# Bizbash Rules & Economy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full server-authoritative rules and economy for the 40-tile Indian board: configurable room economy with preview, buying, rent, auctions, building, mortgages, trading, cards, jail, debt, bankruptcy and end game.

**Architecture:** A pure TypeScript engine package (`packages/engine`) owns all rules: `applyAction(state, playerId, action, rng)` clones the state, runs one handler, and returns the new state plus events, or a rule error. The Colyseus room holds the engine state, applies validated client messages, and syncs a public JSON view. The web app reads that view, and uses the same engine package for the host's settings preview.

**Tech Stack:** TypeScript 7, bun workspaces and `bun test`, zod 4, Colyseus 0.18 (`@colyseus/schema` v5), React 19, Tailwind 4, motion.

**Spec:** `docs/superpowers/specs/2026-10-12-bizbash-rules-design.md`. Read it in full, including "Implementation decisions" at the end, which settle the ambiguous rules.

## Global Constraints

- The contract is already in the repo and is fixed. Its files are `packages/engine/src/types.ts`, `actions.ts`, `economy/settings.ts`, `engine.ts` and `core/context.ts`, plus the exported signatures in every stub file. Implement the bodies, never change a signature. If a contract change is truly needed, stop and report it instead of making it.
- Stubs call `todo("name")`. Replace each `todo(...)` in your files and leave nobody else's.
- Integer rupees everywhere; balances never go negative (shortfalls become `Debt`s via `pay`).
- Rule violations throw `RuleError` with a short, player-readable message. Any other throw is a bug.
- Handlers mutate `ctx.state` (a private draft) and report what happened via `ctx.emit`.
- Randomness only through `ctx.rng`; never `Math.random` or `crypto` inside the engine.
- Tests: `bun test` from `packages/engine`, files in `packages/engine/test/*.test.ts`, using `import { describe, expect, test } from "bun:test"`.
- Shared test helpers live in `packages/engine/test/helpers.ts`, owned by Task F: `seqRng(values: number[]): Rng` (a fixed sequence), `diceRng(...pairs: [number, number][]): Rng` (turns dice faces into rng values for `rollDie`), `newGame(opts?: { players?: number; settings?: RoomSettingsInput; now?: number }): GameState` (players p1..pN), and `act(state, playerId, action, rng?)`, which applies an action, throws on `ok: false`, and returns `{ state, events }`.
- Typecheck with `bun run typecheck` at the repo root.
- Do not run `bun install`; dependencies are already installed. Do not commit; the lead commits.

## Review Focus

1. **Simultaneous actions.** Two players act on the same `version` (both bid, or buy then decline). The second is applied to the new state and must be rejected cleanly or re-validated, never double-applied. Owner: Task I.
2. **Retried action after a reconnect.** The same `actionId` sent twice must charge, draw or buy only once. Owner: Task I (plus F's dispatcher test).
3. **Debt cascades.** Rest House, Club or "each player" cards, when several players can't pay, create several debts. Only debtors can act, and the turn resumes only when all are cleared. A creditor going bankrupt redirects their unpaid debts to the bank. Owner: Task D.
4. **Low bank stock.** Selling a hotel with fewer than 3 houses in the bank is rejected with a clear message. `sellGroupBuildings` must still work, so a debtor is never trapped. Owner: Task C.
5. **Leaving mid-action.** A player forfeiting while the high bidder, while holding the turn, while owing a debt or while party to a trade leaves no dangling auction, trade, debt or turn. Owner: Task D (forfeit), Task B (`removeFromAuction`).

---

## Wave 1 (parallel)

### Task F: Foundation (config data, economy, state helpers, money, game creation, view)

**Files:**
- Fill: `src/config/base.ts`, `src/config/validate.ts`, `src/economy/resolve.ts`, `src/core/state.ts`, `src/core/money.ts`, `src/game.ts`, `src/view.ts`
- Create: `test/helpers.ts`, `test/config.test.ts`, `test/economy.test.ts`, `test/money.test.ts`, `test/game.test.ts`, `test/engine.test.ts`

**Interfaces:**
- Produces everything in the files above, with signatures as in the stubs, plus the helpers listed in Global Constraints.
- Tile ids are lower-kebab-case names: `start`, `patna`, `ranchi`, `community-chest-1`, `raipur`, `income-tax`, `lucknow`, `bhopal`, `indore`, `jail`, `jaipur`, `udaipur`, `chance-1`, `jodhpur`, `ahmedabad`, `surat`, `vadodara`, `indian-railways`, `rest-house`, `hyderabad`, `chennai`, `kolkata`, `community-chest-2`, `pune`, `bengaluru`, `ahmedabad-gift-city`, `wealth-tax`, `gurugram`, `noida`, `mumbai`, `club`, `new-delhi`, `bengaluru-tech-park`, `mumbai-bkc`, `chance-2`, `national-highways`, `power-grid`, `indian-airways`, `coastal-shipping`, `digital-bharat-network`.
- Card ids are as in the spec (`CH01`..`CH16`, `CC01`..`CC16`). CH05 is `moveToNearest` transport, CH11 is `moveToUnownedCity`, CH12 is `moveTo` `indian-railways`, and CH16 is `moveTo` `start`.
- `BASE_RULES`:
  - Values from the spec: startBonus 2000, incomeTax 500, wealthTaxPerHouse 100, wealthTaxPerHotel 100, wealthTaxCap 500, restHouseFromEach 100, clubToEach 100, jailFine 500.
  - Our values: minBidIncrement 100, utilityMultipliers [4, 10], unmortgageInterestRate 0.1, buildingRefundRate 0.5, maxHousesPerProperty 3, maxJailAttempts 3, doublesToJail 3.
- `resolveEconomy`:
  - Scales every monetary field of cities, transports, utilities, groups, rules and card effects via `scaleAmount`. Not scaled: utilityMultipliers, rates, counts, `startingMoney` and `bankCash`.
  - Computes `unmortgageCost = Math.ceil(mortgage * (1 + rate))`.
  - Copies the boolean settings into `rules`.
  - Filters `disabledCardIds` out of `decks`, rejecting unknown ids with an Error.
  - Deep-freezes the result.
- `pay`:
  - Writes `LedgerEntry` rows (`seq` from `nextId`) and emits `paid`.
  - Queues a `Debt` when a player is short.
  - When the bank is short, it first adds the shortfall to bank cash, writes a ledger row from "bank" to "bank" with reason "bank replenishment", and emits `bankReplenished`.
- `createGame`:
  - The first turn goes to `players[0]`, with hasRolled false and doublesCount 0.
  - `properties` holds an entry for every property tile.
  - `bank` comes from economy.bank, minus starting money paid out.
  - Throws an Error for fewer than 2 or more than 6 players, or duplicate ids.

- [ ] Tests:
  - **Config:** board counts per spec §15; tile 9 is `jail`; tile 39 is `digital-bharat-network`; 32 cards with unique ids.
  - **scaleAmount:** (240, 1) = 240; (240, 0.75) = 200; (2000, 0.5) = 1000; (100, 0.25) = 100; (0, 1.5) = 0.
  - **resolveEconomy defaults:**
    - Patna price 2000, rents [200, 600, 1000, 1600, 2400], unmortgageCost 1100.
    - Mumbai BKC houseCost 3000.
    - The economy is frozen.
  - **resolveEconomy at 1.5×:**
    - Patna price 3000, rents[0] 300.
    - startBonus 3000.
    - startingMoney still 20000.
    - utilityMultipliers [4, 10].
  - **Repeat resolves:** resolving twice gives deep-equal results; there is no double scaling.
  - **Custom config** {startingMoney: 40000, priceMultiplier: 0.75, houses: 24, hotels: 8}: bank houses 24, Patna 1500.
  - **Invalid settings:** negative money, a multiplier of 10, or an unknown card id all throw.
- [ ] Tests for `pay`:
  - **Player to player:** cash moves and a ledger row is written.
  - **Shortfall:** nothing moves, a debt is queued and `false` is returned.
  - **Bank short:** the bank is replenished and logged before paying.
  - **Amount 0:** a no-op.
- [ ] Tests for `payEachOther`: collect and pay directions both work, and bankrupt players are skipped.
- [ ] Tests for `createGame`:
  - Each player gets 20000.
  - Bank cash is 1,000,000 minus the starting money paid out.
  - Decks hold 16 cards each.
  - Timed mode sets endsAt.
  - Shuffling with the same rng gives the same order.
- [ ] `toPublicView` test: decks and processedActionIds are absent, and deckSizes are present.
- [ ] Dispatcher tests (engine.ts already exists), using a minimal hand-built state if handlers are still stubs:
  - A duplicate `actionId` returns `duplicate: true` and the same state object.
  - A wrong `expectedVersion` is rejected.
  - A bankrupt actor is rejected.
  - A non-debt action while debts exist is rejected.
- [ ] Run `bun test` and the typecheck; both must pass for your files.

### Task S: Server integration (`apps/server`)

**Files:** Modify `apps/server/src/rooms/GameRoom.ts` and `apps/server/src/rooms/schema/GameState.ts`. Delete `apps/server/src/game/rules.ts` (superseded) but keep `seats.ts`. Modify `apps/server/src/index.ts` or `app.config.ts` only to call `validateBaseConfig()` at startup.

**Interfaces:**
- **Room schema (the web reads this exactly):**
  - `phase` is "lobby", "playing" or "finished".
  - `hostId` is the sessionId of the first joiner, handed to the next player if the host leaves the lobby.
  - `players` is a MapSchema of `Player { id, name, ready, connected }` keyed by sessionId.
  - `settingsJson` holds the parsed RoomSettings.
  - `economyJson` holds the ResolvedEconomy; it is "" in the lobby.
  - `gameJson` holds the `PublicGameView`; it is "" in the lobby.
- **Messages:** `ClientMessageSchema` from `@rollbiz/shared`.
  - `ready`: toggle.
  - `updateSettings`: host and lobby only. Merge over the current settings, parse with `RoomSettingsSchema`, send the zod issue text as an error on failure, and unready everyone.
  - `start`: host only; requires MIN_PLAYERS and everyone ready. Shuffle the seat order with `crypto.randomInt`, then call `resolveEconomy` and `createGame`.
  - `action`: parse with `ActionSchema`, then `applyAction(state, client.auth.userId, action, cryptoRng)`. On `ok`, store the state, update `gameJson`, and broadcast `events`. On an error, send `error` to that client.
- `cryptoRng` = `() => randomInt(0, 2 ** 48) / 2 ** 48`.
- **Timed mode:** `this.clock.setTimeout` until `endsAt`, then `applySystemAction({ type: "timeUp" })`.
- **Leaving:**
  - A drop keeps the 30 s reconnection hold.
  - `onLeave` during play means forfeit via `applySystemAction({ type: "forfeit", playerId })`.
  - When the engine status becomes "finished", set phase to "finished".
- Engine `PlayerId` = Supabase user id (`client.auth.userId`), not sessionId.
- Keep the existing auth, rate limit, seat cap, public/private and reconnection behaviour.

- [ ] Typecheck the server against the stub engine (no engine tests are needed in this task).
- [ ] Add `apps/server/test/room-flow.test.ts`, skipped until the engine is complete (`test.skip` with a TODO naming Task I). It drives `GameRoom` logic through a small adapter, or covers only the pure helpers you extract, such as `mergeSettings` and `cryptoRng` range.

### Task W: Web UI (`apps/web`)

**Files:** Modify `apps/web/src/lib/colyseus.ts`, `hooks/useRoomState.ts` and `screens/Room.tsx`. Create `apps/web/src/screens/room/` for the subviews listed below.

**Interfaces:**
- Reads the room schema from Task S. It parses `settingsJson`, `economyJson` and `gameJson` with `JSON.parse` into `RoomSettings`, `ResolvedEconomy` and `PublicGameView` from `@rollbiz/engine`.
- Sends messages from `@rollbiz/shared`. Game actions go out as `{ type: "action", action }`, each with a fresh `actionId` (`crypto.randomUUID()`) and `expectedVersion: view.version`.
- Plays `events` messages into a short activity log, and shows `error` messages as a toast.

- [ ] **Lobby `RoomSetup`:**
  - The host edits starting money (presets plus a custom field), the price multiplier (presets, with a note that it scales rents and building costs too), bank houses and hotels (presets plus custom), bank cash, game mode and duration, and the auctions, trading, doubles and jail toggles.
  - Non-hosts see the settings read-only.
  - A **live preview** calls `resolveEconomy(settings)` locally and shows starting money, a compact price/rent/building-cost table by group, transports, utilities and the bank inventory.
  - Shows the player list, the Ready button and the host's Start button.
- [ ] **In-game `GameView`:**
  - A vertical board list showing, for each of the 40 tiles: name, group colour, owner, houses or hotel, mortgaged, and the players standing on it.
  - The player panel shows cash, jail state and cards.
  - Contextual actions:
    - Roll; End turn.
    - Buy or Decline at the price.
    - An auction panel with the high bid, a bid input and Pass.
    - Jail options.
    - A "Manage" sheet: build, sell, sell group, mortgage and unmortgage per owned property, with costs from the economy.
    - A debt panel with the amount, creditor, Pay and Declare bankruptcy.
    - A trade composer and incoming offers with Accept and Reject.
    - A game-over screen with the winner and net worths.
  - Buttons are disabled when the action isn't legal for you. The server stays the authority; this only saves clicks.
- [ ] Use the existing `GameButton` and `Panel` and the theme tokens. Placeholder visuals only, mobile-first, and no new dependencies.
- [ ] Typecheck the web app.

## Wave 2 (parallel, after F)

Each wave-2 task fills only its own files and writes tests in its own test file. Use `test/helpers.ts`, and set up scenarios by editing a state from `newGame()` directly (for example, giving ownership or setting position) before calling `act`.

### Task A: Turns, movement, jail, special spaces, cards

**Files:** Fill `src/rules/turn.ts` and `src/rules/cards.ts`. Tests in `test/turn.test.ts` and `test/cards.test.ts`.

**Interfaces:** Consumes `landOnProperty` (Task B) and `countBuildings` (Task C) in `resolveLanding` and the card effects. Your tests may stub those functions with `bun:test`'s `mock.module`, or only cover non-property tiles, until B and C land.

- **Roll:**
  - Requires your turn, no pending decision, no debts, and either not yet rolled or `rollAgain`.
  - Doubles increment `doublesCount`. At 3 with `threeDoublesToJail`, send the player to jail and end their movement.
  - Otherwise move, resolve the landing, and set `rollAgain = doubles && doublesRollAgain && !inJail`.
- **Jail:**
  - A roll while in jail is an attempt. Doubles mean leave, move and no extra roll.
  - Otherwise `jailAttempts++`. On the 3rd failure, `pay` the fine to the bank, leave, and move with that roll.
  - `payJailFine` and `useJailCard` are allowed only before rolling while in jail. The used card goes back to the bottom of its deck.
- **Landing:**
  - Start: nothing extra, since the bonus is paid by the move.
  - Income Tax and Wealth Tax use `countBuildings` and the cap.
  - Rest House and Club use `payEachOther`.
  - Chance and Community Chest call `drawCard`.
  - Jail means just visiting.
  - Properties go to `landOnProperty`.
- **End turn:** requires that you have rolled, `!rollAgain`, no pending decision and no debts. Then `startNextTurn`.
- **Cards:**
  - All 32 effects, per spec §8-9 and decisions 13 and 14.
  - The drawn card goes to the bottom, except jail-free cards, which the player keeps.
  - Moves go forward and resolve the landing with the same dice total.
- [ ] Tests:
  - A plain move.
  - Passing Start versus landing on Start pays once.
  - Doubles force another roll.
  - Three doubles send the player to jail.
  - Jail: escape by doubles, pay the fine, use a card, and the 3rd failure forces the fine.
  - Income Tax.
  - Wealth Tax at 0, 3 and 10 buildings (the cap).
  - Rest House and Club with 3 players.
  - Every card ID: one test each for CH01–CH16 and CC01–CC16. Force the draw order by setting `state.decks` directly.
  - End-turn guards.

### Task B: Buying, rent, auctions

**Files:** Fill `src/rules/property.ts` and `src/rules/auction.ts`. Tests in `test/property.test.ts` and `test/auction.test.ts`.

**Interfaces:** Consumes `pay`, `getProperty`, `requireTurn` and `activePlayers` (F). Produces `rentFor`, `landOnProperty`, `startAuction` and `removeFromAuction`.

- **Landing:**
  - Unowned property: `pending = { kind: "buy" }`.
  - Owned by you, or mortgaged: nothing.
  - Otherwise `pay` the rent to the owner.
- **Rent:**
  - City: rents[0..3] by house count, rents[4] for a hotel.
  - Transport: rents[count − 1], where count is the owner's transports, mortgaged ones included.
  - Utility: multiplier[0 or 1] × dice total, by the number of utilities the owner holds.
- **Buy:** requires your turn and a buy pending on that tile, plus enough cash. Otherwise RuleError "not enough cash". The price goes to the bank via `pay`, which never creates a debt here because cash was checked first.
- **Decline:** starts an auction if `auctionsEnabled`; otherwise clears the pending decision.
- **Auction:**
  - Bidders are all active players in turn order. A bid must be ≥ highBid + minBidIncrement (the first bid ≥ minBidIncrement), ≤ the bidder's cash, and from someone still in.
  - Pass removes the bidder. The auction ends when one bidder remains who holds the high bid, or when nobody remains. The winner pays and takes ownership; with no bids, the property stays unowned.
  - A high bidder can't pass.
- [ ] Tests:
  - Every rent tier for one city per group, at the default and at 1.5×.
  - Transports 1–4.
  - Utilities with 1 and 2 owned.
  - A mortgaged property charges no rent; your own property charges no rent.
  - Rent you can't afford creates a debt.
  - Buy happy path; insufficient cash; a duplicate buy fails, because the pending decision is gone.
  - Decline with auctions off.
  - Full auction; a bid below the increment; a bid above cash.
  - Everyone passes.
  - `removeFromAuction` of the high bidder: their bid is voided and the auction continues for the rest.

### Task C: Building, selling, mortgages

**Files:** Fill `src/rules/building.ts` and `src/rules/mortgage.ts`. Tests in `test/building.test.ts` and `test/mortgage.test.ts`.

**Interfaces:** Produces `countBuildings`, `groupHasBuildings` and `liquidateAllBuildings`.

- **Who may act:** the current player with no pending decision, or (for selling and mortgaging) a debtor while debts exist. The dispatcher already gates debt mode.
- **Build:**
  - Requires the whole group owned and none of it mortgaged.
  - Even rule, using levels 0–4 where a hotel is 4.
  - Bank stock: houses for levels 1–3; a hotel at level 4, which returns 3 houses to the bank.
  - Requires cash.
- **Sell:**
  - A house refunds `floor(houseCost × refundRate)`, as long as the even rule allows it.
  - A hotel drops the property back to 3 houses, needing 3 houses in the bank, and refunds `floor(hotelCost × rate)`.
- **`sellGroupBuildings`:** sells everything in the group. A hotel counts as hotelCost + 3 × houseCost at the rate. Pieces go back to the bank: hotels as hotels, houses as houses.
- **Mortgage:** requires that you own the property, it isn't mortgaged, and its group has no buildings. You receive the mortgage value. Unmortgage costs `unmortgageCost`.
- [ ] Tests:
  - Full-set requirement.
  - The even rule, both when building and when selling.
  - Running out of houses.
  - Hotel upgrade and its effect on bank stock.
  - The hotel limit.
  - Selling a hotel when the bank has fewer than 3 houses: rejected, but `sellGroupBuildings` works.
  - Refund amounts at 1× and 0.5×.
  - Mortgage blocked by buildings in the group; an unmortgage of 1100 for Patna.
  - Building on a mortgaged group is blocked.
  - Selling while in debt is allowed; building while in debt is blocked (dispatcher).

### Task D: Trading, debt, bankruptcy, end game

**Files:** Fill `src/rules/trade.ts` and `src/rules/bankruptcy.ts`. Tests in `test/trade.test.ts` and `test/bankruptcy.test.ts`.

**Interfaces:**
- Consumes:
  - `liquidateAllBuildings` and `groupHasBuildings` (C).
  - `removeFromAuction` (B).
  - `startNextTurn` (A).
  - `pay` and `activePlayers` (F).

**Trades**
- Requires `tradingEnabled`.
- Propose:
  - Any active player, to another active player.
  - Not while a decision is pending.
  - Every listed property is owned by the right side, and its group has no buildings.
  - Cash ≤ balance. The jail cards are held.
  - No empty trade.
- Accept: only the recipient. It is re-validated at accept time, then applied atomically.
- Reject: only the recipient. Cancel: only the proposer.

**Debts**
- `payDebt`: pays the oldest debt the player owes, if they now have the cash; otherwise RuleError.

**Bankruptcy**
- When the debtor declares bankruptcy:
  - Remove them from any auction.
  - Drop their trades.
  - Assets go to the oldest debt's creditor, per decision 9.
  - Delete all their debts.
  - Redirect debts owed *to* them so they are owed to the bank.
- Forfeit does the same, with the bank as creditor, and works even without a debt.
- If the bankrupt player held the turn, run `startNextTurn`. Clear the pending decision if it was theirs.

**Game over**
- After any bankruptcy, if one active player remains: `status = "finished"`, set `winnerId`, and emit `gameOver` ("elimination").
- `timeUp` picks the highest `netWorth` and ends the game; ties go to turn order.

- [ ] Tests:
  - **Trades:** a valid trade; a property with buildings in its group is rejected; trading disabled; a stale trade (an asset gone) fails on accept; a jail card changes hands.
  - **Debt:** pay a debt after mortgaging.
  - **Bankruptcy:** to a player (assets transferred, buildings sold first); to the bank (properties unowned, buildings back in inventory).
  - **Forfeit:** with the turn held; as the high bidder.
  - **Cascading debts:** a creditor going bankrupt redirects their debts to the bank.
  - **Game end:** elimination and time-up.
  - **netWorth:** the exact value for a mixed portfolio.

## Wave 3 (after A–D, S, W)

### Task I: Integration, multiplayer tests, docs

**Files:**
- Create `packages/engine/test/simulation.test.ts`, `packages/engine/test/multiplayer.test.ts` and `docs/rules.md`.
- Un-skip and finish `apps/server/test/room-flow.test.ts`.
- Delete `src/core/todo.ts` once no stubs remain.

- [ ] **Simulation:** play 200 full random games (seeded rng, scripted policy) at the default settings and at 2 custom settings. After every action, check the invariants:
  - No negative cash.
  - Bank houses + houses on the board = configured total, counting each hotel as 0 houses.
  - Bank hotels + hotels on the board = configured total.
  - Every property's owner is an active player or null.
  - Total money is conserved apart from bank replenishment, checked against the ledger.
  - The game ends with ≥1 winner, or the test hits its action limit.
- [ ] **Multiplayer:**
  - Two buys from one state: the second is rejected.
  - Concurrent bids at the same version.
  - A duplicate `actionId` after a "reconnect": state unchanged.
  - A stale `expectedVersion`.
  - Forfeit mid-auction and mid-debt.
- [ ] Write `docs/rules.md`: the rules in plain words, the settings table with defaults and limits, what scales, and the room message contract.
- [ ] Run all of these and confirm they pass: root `bun run typecheck`, `bun test` in `packages/engine`, `bun test` in `apps/server`, and `bun run build` for web.
