# RollBiz rules and configuration

How the game plays, what the host can configure, and how the room talks to clients. The server is authoritative for everything below; clients only send intents and render what they are told.

Code lives in `packages/engine` (rules), `apps/server` (the Colyseus room) and `packages/shared` (message types). The full design brief, including the reasoning behind the calls marked "our decision", is `docs/superpowers/specs/2026-10-12-bizbash-rules-design.md`.

## The game in plain words

2 to 4 players share a square 40-tile board and start with the same cash (default ₹20,000). Everyone buys cities, transports and utilities, collects rent from each other, builds houses and hotels, and tries to be the last player standing (or the richest when time runs out).

All money is whole rupees. Cash never goes below zero: a payment you cannot cover becomes a debt (see below).

### The board

Corners are at tiles 0, 10, 20 and 30. Going clockwise:

| Tile | Corner | Side contents |
|---|---|---|
| 0 | Start | Orange group (Patna, Ranchi, Raipur), Indian Railways, Purple group (Bhopal, Nagpur, Indore), Community Chest, Income Tax |
| 10 | Jail / Just Visiting | Pink group (Lucknow, Surat, Jaipur), Power Grid, National Highways, Sky Blue group (Chandigarh, Ahmedabad, Ooty), Chance |
| 20 | Rest House | Red group (Darjeeling, Srinagar, Goa), Indian Airways, Yellow group (Noida, Gurugram, Pune), Digital Bharat Network, Chance |
| 30 | Club | Green group (Hyderabad, Kolkata, Chennai), Coastal Shipping, Dark Blue group (Bengaluru, New Delhi, Mumbai), Community Chest, Wealth Tax |

That is 24 cities in 8 colour groups of 3, 4 transports, 2 utilities, 2 Chance, 2 Community Chest, 2 taxes and 4 corners. Group ids in code are `brown` (shown as Orange), `lightBlue` (Purple), `pink`, `orange` (Sky Blue), `red`, `yellow`, `green`, `darkBlue`. Prices and rents rise clockwise; exact values are in `packages/engine/src/config/base.ts`.

### A turn

1. The player whose turn it is rolls two dice and moves clockwise.
2. Passing or landing on Start pays the Start bonus (₹2,000), once per move.
3. The landing tile resolves:
   - **Unowned city, transport or utility:** the player may buy it at its price. If they decline (or cannot afford it) and auctions are on, it goes to auction.
   - **Owned by someone else, not mortgaged:** pay rent to the owner. Mortgaged properties earn nothing.
   - **Income Tax:** pay ₹500 to the bank.
   - **Wealth Tax:** ₹100 per house and ₹100 per hotel you own, at most ₹500.
   - **Rest House:** every other active player pays you ₹100.
   - **Club:** you pay ₹100 to every other active player.
   - **Chance / Community Chest:** draw a card (see below).
   - **Start, Jail / Just Visiting:** nothing.
4. A double lets you roll again (if the room allows it). Three doubles in a row send you to jail instead of moving.
5. Once you have rolled, and rolled again after any doubles, and settled any open buy decision, auction or debt, end your turn.

### Rent

- **City:** the rent for its current level: base, 1, 2 or 3 houses, hotel. Owning the whole group does not double the unbuilt rent.
- **Transport:** depends on how many transports the owner holds: ₹500, ₹1,000, ₹2,000, ₹4,000 for 1 to 4.
- **Utility:** 4 times the dice total if the owner has one utility, 10 times if both.

### Auctions

When a buy is declined and auctions are enabled, every active player (including the one who declined) can bid. Bids must be at least the current high bid plus the minimum increment (₹100, scaled) and no more than the bidder's cash. A player who is not the high bidder may pass and drops out. The auction ends when the high bidder is the only one left (they pay and own the tile), or when everyone has passed with no bid (the tile stays unowned). The high bidder cannot pass. The server may auto-pass idle bidders.

### Building

- You need the whole colour group to build, with none of its properties mortgaged.
- Build evenly: no property may be more than one level ahead of another in its group.
- Up to 3 houses per property, then a hotel upgrade, which needs 3 houses on every property in the group. The hotel upgrade returns the 3 houses to the bank.
- Building is limited by the bank's stock of houses and hotels (default 32 and 12).
- Selling gives back 50% of the building's cost and returns the pieces to the bank. Selling is also even. Selling a hotel downgrades it to 3 houses, which needs 3 houses in the bank. `sellGroupBuildings` sells everything in a group at once and always works, so a player in debt is never stuck by low bank stock.
- Building and unmortgaging need your turn, nothing pending and no debts anywhere. Selling and mortgaging are also allowed to a debtor at any time.

### Mortgages

Mortgaging pays 50% of the property's price and stops its rent. Unmortgaging costs the mortgage value plus 10%, rounded up to the rupee. A property in a group that has buildings cannot be mortgaged or traded until the buildings are sold.

### Trading

When trading is on, a player can offer another player a swap of cash, properties and Get Out of Jail Free cards. Both sides are checked when the offer is made and again when it is accepted, so an offer that has gone stale cannot be accepted. Only the recipient can accept or reject; only the proposer can cancel. Open offers involving a player are dropped when they go bankrupt or leave. Properties in a group with buildings cannot be traded.

### Jail

The only way into jail on this board is rolling three doubles in a row. In jail, before rolling, you can pay the fine (₹500), or use a Get Out of Jail Free card, or just roll and try for doubles. Rolling doubles frees you and moves you by that roll, with no extra roll. After three failed rolls the fine is mandatory and you move with the third roll. If you cannot cover the fine it becomes a debt and you still move.

### Chance and Community Chest

16 cards each, shuffled at the start. A drawn card goes to the bottom of its deck, except Get Out of Jail Free, which the player keeps until used (it then goes back to the bottom). Amounts are scaled like everything else. Cards can pay or collect money, move the player (forward only, paying the Start bonus if they pass it), charge per building, or take money from or give money to every other active player. "Strategic Acquisition" moves you forward to the nearest unowned city (nothing happens if there is none). Individual cards can be switched off in room settings.

### Debts and bankruptcy

If a payment cannot be covered, nothing moves and a debt is recorded. While any debt is outstanding nothing else in the game progresses: only a debtor can act, and only to sell buildings, mortgage, pay a debt or declare bankruptcy. This also freezes any pending buy decision or auction that came with the same move; they resume once all debts are cleared.

Several debts can exist at once (for example when Rest House, the Club or an "each player" card hits several people who cannot pay). The turn resumes only when all are cleared.

A debtor who cannot or will not settle declares bankruptcy:

- **To a player:** buildings are sold back to the bank (50% refund), then the player's cash, properties (keeping their mortgage state) and jail cards go to the creditor.
- **To the bank:** buildings return to the bank's stock, properties become unowned and unmortgaged, cash goes to the bank, jail cards go back to the deck.
- A bankrupt player's other debts vanish. Debts that others owed *to* them are redirected to the bank.
- They also leave any open auction and trade.

A player who leaves for good (consented leave, or the 30-second reconnection window runs out) forfeits, which is bankruptcy to the bank.

### Winning

- **Elimination (default):** when one player is left, they win.
- **Timed:** at the deadline the highest net worth wins (ties go to the earlier player in turn order). Net worth is cash, plus the price of each unmortgaged property or the mortgage value of each mortgaged one, plus the cost of all buildings. Elimination still ends a timed game early.

### Bank

Starting money is paid out of the bank's cash. The bank has cash, houses and hotels. If it runs short of cash it issues more through a logged "bank replenishment" ledger entry, so it never blocks a payment. Every payment is in the ledger.

## Room settings

The host sets these in the lobby; changing any setting un-readies everyone. They are validated by `RoomSettingsSchema` (packages/engine/src/economy/settings.ts) and frozen when the game starts. Unknown keys are rejected.

| Setting | Default | Limits | Notes |
|---|---|---|---|
| `startingMoney` | 20,000 | 1,000 to 1,000,000 (whole rupees) | Presets 10k, 15k, 20k, 25k, 30k, 40k. Not scaled. |
| `priceMultiplier` | 1 | 0.25 to 3 | Presets 0.5, 0.75, 1, 1.25, 1.5. See "What scales". |
| `houses` | 32 | 1 to 200 | Bank house stock. Presets 24 / 32 / 48. |
| `hotels` | 12 | 1 to 100 | Bank hotel stock. Presets 8 / 12 / 16. |
| `bankCash` | 1,000,000 | 1 to 100,000,000 | Not scaled. |
| `gameMode` | `elimination` | `elimination` or `timed` | |
| `durationMinutes` | 60 | 10 to 240 | Only used when timed. |
| `auctionsEnabled` | true | boolean | Off: declining a buy leaves the tile unowned. |
| `tradingEnabled` | true | boolean | |
| `doublesRollAgain` | true | boolean | Off: doubles give no extra roll. |
| `threeDoublesToJail` | true | boolean | Off: no jail on this board at all. |
| `disabledCardIds` | `[]` | up to 32 known card ids | e.g. `["CH15", "CC15"]` removes the jail cards. Unknown ids are rejected. |

### What scales

The economy is resolved once at game start from the immutable base configuration and the settings, then stored with the game. It is never scaled twice, and editing defaults later does not affect running games.

At exactly 1x every base value is used unchanged. At any other multiplier each scaled amount is `base * multiplier`, rounded to the nearest ₹100, with a minimum of ₹100 for positive amounts.

**Scaled:** purchase prices, all rents (city, transport), house and hotel costs, mortgage values (half the scaled price) and unmortgage cost (derived), Start bonus, Income Tax, Wealth Tax rates and cap, Rest House and Club amounts, jail fine, minimum bid increment, and every money amount on the cards (including the per-building rates and caps).

**Not scaled:** starting money, bank cash, bank houses and hotels, utility dice multipliers (4 and 10), the 10% unmortgage interest, the 50% building refund, house and hotel counts, dice, player counts, and turn limits (3 doubles, 3 jail attempts).

## Room message contract

Transport is Colyseus. Types are in `packages/shared/src/index.ts`; the room is `apps/server/src/rooms/GameRoom.ts`.

### Joining

`joinOrCreate("game", { accessToken, displayName?, isPrivate? })`. `accessToken` is the Supabase session JWT, verified on the server; the user id becomes the engine player id and is stable across reconnects. A user may sit in at most 2 rooms. Joining is refused with 403 once the game has started, with 409 if the same account is already in the room, and with 401/429/503 for auth problems. Private rooms are skipped by Quick Play and joined by room id.

### Client to server

Every message is validated; junk is dropped without a reply. Clients sending more than 15 messages a second are disconnected.

| Message | Payload | Who and when | Effect |
|---|---|---|---|
| `ready` | none | lobby | Toggles the sender's ready flag. |
| `updateSettings` | `{ settings: Record<string, unknown> }` | host, lobby | Merges a partial patch over current settings, validates, un-readies everyone. |
| `start` | none | host, lobby | Needs at least 2 players, all ready. Shuffles seat order, resolves the economy, creates the game, locks the room. |
| `action` | `{ action }` | any player, playing | A game action (below). |

Game actions (`ActionSchema`): `roll`, `buy`, `declineBuy`, `bid {amount}`, `passAuction`, `build {tileId}`, `sellBuilding {tileId}`, `sellGroupBuildings {group}`, `mortgage {tileId}`, `unmortgage {tileId}`, `payJailFine`, `useJailCard`, `payDebt`, `declareBankruptcy`, `proposeTrade {to, give, get}`, `acceptTrade {tradeId}`, `rejectTrade {tradeId}`, `cancelTrade {tradeId}`, `endTurn`.

Every action may also carry:

- `actionId` (string, up to 64 chars): a client-generated id. If the server has already applied this id (it remembers the last 200), it acknowledges silently and does nothing: no second charge, card draw or purchase. Reuse the same id when retrying after a reconnect. An id whose first attempt was rejected can be tried again.
- `expectedVersion` (integer): if it differs from the game's current `version`, the action is rejected with `stale state, please retry`.

Rolls, card draws and everything random use the server's own randomness; clients cannot submit dice, balances, rents or prices.

### Server to client

- **Synced room state** (Colyseus schema): `phase` (`lobby`, `playing`, `finished`), `hostId` (a session id), `players` (map by session id: `id`, `name`, `ready`, `connected`), `settingsJson`, `economyJson` (the resolved economy, sent once at start) and `gameJson`.
- **`gameJson`:** the public game view, replaced after every applied action. It is the engine state without the deck order, the action-id log and the economy; instead it has `deckSizes`. Fields include `version` (up by 1 per action), `players` (cash, position, jail state, jail-free card ids, `bankrupt`), `properties` (owner, mortgaged, houses, hotel), `bank`, `turn`, `pending` (a buy decision or an auction), `debts`, `trades`, `ledger`, `status`, `winnerId`, `endsAt`.
- **`events`** message: `{ events: GameEvent[] }` for the animations and activity log, sent for every applied action (not for acknowledged duplicates). Event types are in `packages/engine/src/types.ts`.
- **`error`** message: `{ message }`, sent only to the client whose message failed. Rule violations carry a short readable reason, for example `it is not your turn`, `not enough cash`, `outstanding debts must be settled first`, `stale state, please retry`.

### Connection lifecycle

- A dropped connection marks the player `connected: false` and gives them 30 seconds to reconnect; reconnecting restores them. They can resume sending actions, and retries with the same `actionId` are safe.
- A consented leave, or an expired window, in the lobby removes the player (the next player in join order becomes host if the host left). During a game it forfeits the player: bankrupt to the bank, their seat entry stays visible with `connected: false`.
- When the game ends (one player left, or time up) `phase` becomes `finished` and `winnerId` is set. Further actions are refused.
- In timed mode the room arms a timer for `endsAt`; when it fires the server applies time-up and the highest net worth wins.

The resolved economy and live state live in the room's memory on the single game server, which is what covers reconnects and reloads. Saving match results to Postgres is a later step.
