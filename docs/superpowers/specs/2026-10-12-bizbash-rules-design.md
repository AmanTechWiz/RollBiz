# Bizbash — Multiplayer Board Game Rules & Economy

Source: the product owner's brief (2026-10-12), kept close to verbatim. The "Implementation decisions" section at the end records calls made where the brief is ambiguous; those are ours, not the owner's.

## 1. Core Design Requirements

- Multiplayer games with 2–4 players (owner decision 2026-10-12: 4 tokens per theme, 4 players max).
- Currency: Indian Rupees (₹).
- Default starting balance: **₹20,000 per player**.
- The room creator configures starting money, property prices, bank inventory and other economy settings before the game begins.
- Every player in a room uses the same finalized economy configuration.
- Room configuration changes are validated and frozen once the game starts.
- All rules and economic values are server-authoritative. Never trust client-submitted balances, rent amounts, dice results, card effects or purchase prices.

## 2. Room Creator: Economy Configuration

### Starting Money
- Default ₹20,000. Presets: ₹10,000, ₹15,000, ₹20,000, ₹25,000, ₹30,000, ₹40,000.
- Custom values must be positive, finite, and within a configurable limit.
- Every player receives the same configured starting balance.

### Property Price Scaling
- Default multiplier 1.0×. Presets 0.5×, 0.75×, 1.0×, 1.25×, 1.5×.
- Applies consistently to purchase prices, base rents, building costs, mortgage values and other explicitly price-scaled values.
- Integer currency. Round to the nearest ₹100, minimum ₹100 for positive amounts.
- Base configuration is immutable; never multiply already-scaled values.
- The UI must make clear the multiplier affects rents and building costs too.

### Bank Inventory
- Default **32 houses and 12 hotels**. Presets or custom positive integers.
- Shared by all players and enforced on the server.
- Houses/hotels returned by selling, downgrading or other legal actions go back to the bank.
- No negative inventory, duplicate buildings, or building beyond supply.

### Additional Settings
- Game mode: elimination or timed; duration for timed mode.
- Auctions on/off. Trading on/off. Doubles and jail rules. Event-card deck configuration.
- Keep the setup UI concise. Show a live preview of starting money, property prices, rents, building costs and bank inventory before the host starts the game.

## 3. Economy Configuration Architecture

Single source of truth, kept separate:
- `gameConfig`: immutable base configuration and defaults.
- `roomEconomyConfig`: host-selected settings for one room.
- `resolvedEconomy`: fully calculated, immutable values used during the game.
- `bankState`: cash, houses, hotels.
- `playerState`: balance, position, owned properties, buildings, cards, jail state, bankruptcy.

### Scaling Rules
- Resolve once at game start; store with the game.
- `startingMoney` is used directly, not multiplied.
- Scale purchase prices, base rents, house costs, hotel upgrade costs, mortgage values, fixed rent schedules, and fixed monetary penalties or rewards.
- Round positive scaled amounts to the nearest ₹100.
- Do not scale percentages, multipliers, dice values, player counts, or quantities (houses/hotels).
- Do not scale rules expressed as a proportion of assets unless the rule names a monetary amount.
- Existing games must not change if global defaults are later edited.
- Test repeated game initialization and custom room settings (no double scaling).

## 4. Default Board: 40 Tiles (clockwise from index 0)

Square track (owner decision 2026-10-12: "choose the best order, as Indian board games do"). Corners at 0, 10, 20, 30; each side has nine tiles: two colour groups, one transport in the middle, and two other spaces. Prices rise clockwise. City names and tiers set by the owner on 2026-10-12: regional cities first, tourist spots (Ooty, Darjeeling, Srinagar, Goa) on the higher side, metros and NCR at the top.

| # | Tile | Category |
|---|---|---|
| 0 | Start | Corner |
| 1 | Patna | Brown |
| 2 | Community Chest | Event |
| 3 | Ranchi | Brown |
| 4 | Raipur | Brown |
| 5 | Indian Railways | Transport |
| 6 | Bhopal | Light Blue |
| 7 | Income Tax | Tax |
| 8 | Nagpur | Light Blue |
| 9 | Indore | Light Blue |
| 10 | Jail / Just Visiting | Corner |
| 11 | Lucknow | Pink |
| 12 | Power Grid | Utility |
| 13 | Surat | Pink |
| 14 | Jaipur | Pink |
| 15 | National Highways | Transport |
| 16 | Chandigarh | Orange |
| 17 | Chance | Event |
| 18 | Ahmedabad | Orange |
| 19 | Ooty | Orange |
| 20 | Rest House | Corner |
| 21 | Darjeeling | Red |
| 22 | Chance | Event |
| 23 | Srinagar | Red |
| 24 | Goa | Red |
| 25 | Indian Airways | Transport |
| 26 | Noida | Yellow |
| 27 | Gurugram | Yellow |
| 28 | Digital Bharat Network | Utility |
| 29 | Pune | Yellow |
| 30 | Club | Corner |
| 31 | Hyderabad | Green |
| 32 | Kolkata | Green |
| 33 | Community Chest | Event |
| 34 | Chennai | Green |
| 35 | Coastal Shipping | Transport |
| 36 | Bengaluru | Dark Blue |
| 37 | Wealth Tax | Tax |
| 38 | New Delhi | Dark Blue |
| 39 | Mumbai | Dark Blue |

24 city properties, 4 transport, 2 utilities, 2 Chance, 2 Community Chest, 2 taxes, 4 corners. Verify counts and corner positions programmatically.

## 5. Base Property Data (₹)

| Group | Property | Buy | Base | 1H | 2H | 3H | Hotel | Mortgage |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Brown | Patna | 2000 | 200 | 600 | 1000 | 1600 | 2400 | 1000 |
| Brown | Ranchi | 2400 | 240 | 720 | 1200 | 1920 | 2880 | 1200 |
| Brown | Raipur | 2800 | 280 | 840 | 1400 | 2240 | 3360 | 1400 |
| Light Blue | Bhopal | 3200 | 320 | 960 | 1600 | 2560 | 3840 | 1600 |
| Light Blue | Nagpur | 3600 | 360 | 1080 | 1800 | 2880 | 4320 | 1800 |
| Light Blue | Indore | 4000 | 400 | 1200 | 2000 | 3200 | 4800 | 2000 |
| Pink | Lucknow | 4400 | 440 | 1320 | 2200 | 3520 | 5280 | 2200 |
| Pink | Surat | 4800 | 480 | 1440 | 2400 | 3840 | 5760 | 2400 |
| Pink | Jaipur | 5200 | 520 | 1560 | 2600 | 4160 | 6240 | 2600 |
| Orange | Chandigarh | 5600 | 560 | 1680 | 2800 | 4480 | 6720 | 2800 |
| Orange | Ahmedabad | 6000 | 600 | 1800 | 3000 | 4800 | 7200 | 3000 |
| Orange | Ooty | 6400 | 640 | 1920 | 3200 | 5120 | 7680 | 3200 |
| Red | Darjeeling | 6800 | 680 | 2040 | 3400 | 5440 | 8160 | 3400 |
| Red | Srinagar | 7200 | 720 | 2160 | 3600 | 5760 | 8640 | 3600 |
| Red | Goa | 7600 | 760 | 2280 | 3800 | 6080 | 9120 | 3800 |
| Yellow | Noida | 8000 | 800 | 2400 | 4000 | 6400 | 9600 | 4000 |
| Yellow | Gurugram | 8400 | 840 | 2520 | 4200 | 6720 | 10080 | 4200 |
| Yellow | Pune | 8800 | 880 | 2640 | 4400 | 7040 | 10560 | 4400 |
| Green | Hyderabad | 9200 | 920 | 2760 | 4600 | 7360 | 11040 | 4600 |
| Green | Kolkata | 9600 | 960 | 2880 | 4800 | 7680 | 11520 | 4800 |
| Green | Chennai | 10000 | 1000 | 3000 | 5000 | 8000 | 12000 | 5000 |
| Dark Blue | Bengaluru | 11000 | 1100 | 3300 | 5500 | 8800 | 13200 | 5500 |
| Dark Blue | New Delhi | 12000 | 1200 | 3600 | 6000 | 9600 | 14400 | 6000 |
| Dark Blue | Mumbai | 13000 | 1300 | 3900 | 6500 | 10400 | 15600 | 6500 |

Building costs by group (per house / hotel upgrade): Brown 1000/1000, Light Blue 1000/1000, Pink 1500/1500, Orange 1500/1500, Red 2000/2000, Yellow 2000/2000, Green 2500/2500, Dark Blue 3000/3000.

Hotel upgrade cost is paid on top of the three existing houses; those three houses return to the bank on upgrade.

## 6. Transport and Utilities

| Property | Buy | 1 owned | 2 owned | 3 owned | 4 owned | Mortgage |
|---|---:|---:|---:|---:|---:|---:|
| Indian Railways | 7000 | 500 | 1000 | 2000 | 4000 | 3500 |
| National Highways | 7000 | 500 | 1000 | 2000 | 4000 | 3500 |
| Indian Airways | 8000 | 500 | 1000 | 2000 | 4000 | 4000 |
| Coastal Shipping | 6000 | 500 | 1000 | 2000 | 4000 | 3000 |

Transport rent depends on how many transports the **owner** holds.

Utilities: Power Grid and Digital Bharat Network, buy 5000, mortgage 2500. Rent: one utility owned 4× dice total; both owned 10× dice total.

## 7. Taxes and Special Spaces

- **Start:** collect ₹2,000 when passing or landing. Never twice in one movement.
- **Income Tax:** pay ₹500 to the bank.
- **Wealth Tax:** ₹100 per house and ₹100 per hotel owned, capped at ₹500.
- **Jail:** distinguish being in jail from just visiting.
- **Rest House:** collect ₹100 from each other active player.
- **Club:** pay ₹100 to each other active player.
- **Chance / Community Chest:** draw and resolve one card.

## 8. Chance Cards

| ID | Title | Effect |
|---|---|---|
| CH01 | Startup Funding | Collect ₹2,000 from bank |
| CH02 | Market Rally | Collect ₹1,500 from bank |
| CH03 | Unexpected Audit | Pay ₹1,000 to bank |
| CH04 | Infrastructure Boom | Move forward 3 spaces; resolve destination normally |
| CH05 | Corporate Relocation | Move to nearest transport property; pay applicable rent |
| CH06 | Tax Notice | Pay ₹500 to bank |
| CH07 | Major Contract | Collect ₹2,500 from bank |
| CH08 | Supply Chain Disruption | Pay ₹500 per house and ₹1,000 per hotel owned, capped at ₹3,000 |
| CH09 | Venture Capital | Collect ₹3,000 from bank |
| CH10 | Legal Dispute | Pay ₹1,500 to bank |
| CH11 | Strategic Acquisition | Move to an unowned city property; may purchase it or trigger an auction |
| CH12 | Rail Expansion | Move to Indian Railways and pay applicable rent |
| CH13 | Economic Slowdown | Pay ₹200 to each other active player |
| CH14 | Government Incentive | Collect ₹1,000 from bank |
| CH15 | Free from Jail | Retain until used to leave jail |
| CH16 | Advance to Start | Move to Start and collect ₹2,000 |

## 9. Community Chest Cards

| ID | Title | Effect |
|---|---|---|
| CC01 | Dividend Payment | Collect ₹1,000 from bank |
| CC02 | Insurance Payout | Collect ₹1,500 from bank |
| CC03 | Medical Emergency | Pay ₹500 to bank |
| CC04 | Municipal Maintenance | Pay ₹200 per house and ₹500 per hotel owned, capped at ₹2,000 |
| CC05 | Festival Bonus | Collect ₹500 from each other active player |
| CC06 | Utility Rebate | Collect ₹500 from bank |
| CC07 | Loan Repayment | Pay ₹1,000 to bank |
| CC08 | Employee Bonus | Pay ₹500 to bank |
| CC09 | Property Sale | Collect ₹1,000 from bank |
| CC10 | Business Award | Collect ₹2,000 from bank |
| CC11 | Community Donation | Pay ₹200 to each other active player |
| CC12 | Bank Interest | Collect ₹500 per owned transport property, capped at ₹2,000 |
| CC13 | Unexpected Fine | Pay ₹750 to bank |
| CC14 | Startup Grant | Collect ₹1,500 from bank |
| CC15 | Free from Jail | Retain until used to leave jail |
| CC16 | Tax Refund | Collect ₹1,000 from bank |

Every card effect is a validated game action with structured effects (no parsing of display text). Define behaviour when a player cannot pay in full.

## 10. Turn, Movement and Purchase Rules

1. Roll two six-sided dice, move clockwise.
2. Passing or landing on Start awards ₹2,000 once.
3. Resolve the destination space.
4. Unowned city/transport/utility: the active player may buy it at the resolved price.
5. Declined or unaffordable: auction it when auctions are enabled.
6. Owned and not mortgaged: charge rent.
7. Mortgaged: no rent.
8. Tax and event spaces resolve immediately.
9. Track doubles; three consecutive doubles send the player to jail.
10. Doubles allow another roll unless a rule ends the turn.
11. Jailed player: pay ₹500, use a Get Out of Jail Free card, or try for doubles. After three failed attempts, payment is mandatory and the player moves with the final roll.
12. Cash transfers are atomic, validated, and persisted.

## 11. Building Rules

- Must own the whole colour group (3 properties) to build.
- Build evenly: no property more than one house ahead of another in its group.
- Up to three houses, then a hotel upgrade.
- Hotel upgrade needs three houses on every property in the group; costs the hotel-upgrade cost; returns the three houses to the bank.
- No building when the bank lacks houses/hotels.
- Selling follows the refund policy, returns pieces to the bank, keeps even-building.
- Building and selling only in the appropriate phase.

## 12. Mortgage, Trading and Bankruptcy

- Mortgage value is 50% of the resolved purchase price. Mortgaged properties earn no rent.
- Unmortgage costs mortgage value + 10% interest.
- A property whose group has buildings cannot be mortgaged or traded until buildings are sold.
- Trades exchange cash, properties and Get Out of Jail Free cards when trading is enabled; validated on the server before committing.
- A player who can't pay may liquidate buildings and mortgage before declaring bankruptcy.
- A bankrupt player exits; remaining assets go to the creditor or the bank.
- No negative balances unless an explicit controlled debt state is used.

## 13. Bank Inventory and Bank Cash

- Houses 32, hotels 12, bank cash **₹10,00,000** at game start (host-configurable).
- Purchases transfer ownership bank → player.
- All bank payments and collections are recorded in a transaction ledger.
- If the bank runs low on cash it may only issue more through a logged bank-replenishment action.
- Returned houses/hotels go back to inventory. Inventory operations are atomic.

## 14. Room Creation and Economy Resolution

1. Start from immutable base configuration.
2. Apply the host's starting money, multiplier, inventory and optional rules.
3. Calculate scaled values exactly once.
4. Validate; no missing property, group or card.
5. Preview for the host.
6. Freeze when the game starts.
7. Same starting balance for every player.
8. Bank inventory from resolved settings.
9. Keep the resolved configuration with the room so reconnects, reloads and spectators see the same game.

## 15. Technical and Testing Requirements

- Follow the existing stack and style. Stable IDs for tiles, properties, cards, players.
- Separate base config, room settings, resolved economy, live state.
- Deterministic state-transition function where practical.
- Enforce turn order; validate every state-changing action on the server.
- Prevent duplicate purchases, card draws, rent payments, Start rewards.
- Atomic transactions; idempotent where retries are possible.
- Reconnects don't duplicate actions. Don't expose private state unnecessarily.
- Unit tests: every rent tier, mortgage calc, construction rule, card effect, bankruptcy flow, scaling multiplier, bank-inventory constraint.
- Multiplayer tests: simultaneous purchases, duplicate submissions, reconnects, stale state.
- Test the default config and at least two custom configs.
- Validate at startup: 40 tiles, 8 colour groups, 24 cities, 4 transports, 2 utilities, 32 cards.

## 16. Deliverables

1. Canonical base config. 2. Room economy settings and preview. 3. Resolved economy calculation and validation. 4. Server-authoritative rules engine. 5. Purchasing, rent, auctions, construction, mortgages, trading. 6. Chance and Community Chest. 7. Bank cash and inventory. 8. Bankruptcy and end game. 9. Tests. 10. A concise rules/config doc.

---

## Implementation decisions (ours, not from the brief)

1. **Product name.** The brief says "Bizbash"; the repo and app are "RollBiz". Code keeps RollBiz until the owner decides.
2. **Board order.** Superseded by the owner's 2026-10-12 decision: the square layout in §4. The brief's original order had corners at 0, 9, 18, 30.
3. **Rounding at 1.0×.** Rounding to ₹100 would change base values such as ₹240 rent. At exactly 1.0× base values are used unchanged; at any other multiplier every scaled amount is rounded to the nearest ₹100, minimum ₹100.
4. **What scales.** All fixed monetary rules and card amounts scale (Start bonus, taxes, jail fine, Rest House/Club, per-house/per-hotel card rates and caps, transport rents, minimum bid). Not scaled: starting money, bank cash, utility dice multipliers, percentages.
5. **Unmortgage cost** = ceil(mortgage × 1.10) to the nearest rupee.
6. **No rent doubling** for an unimproved full colour set (the brief doesn't ask for it).
7. **Refund policy.** Selling returns 50% of the building's cost. Selling a hotel downgrades to three houses (needs three houses in the bank). `sellGroupBuildings` sells everything in a group at once and always works, so a debtor can never be trapped by low bank stock.
8. **Debt.** A payment that can't be covered never goes negative: it becomes an outstanding debt. The debtor may sell buildings, mortgage, then `payDebt`, or `declareBankruptcy`. No turn can progress while any debt is outstanding.
9. **Bankruptcy.** To a player creditor: buildings are sold to the bank first (50% refund), then cash, properties (mortgage state kept) and jail cards go to the creditor. To the bank: buildings return to inventory, properties return unowned and unmortgaged, cash goes to the bank. One solvent player left → game over.
10. **Timed mode.** At time-up, the winner is the highest net worth: cash + price of unmortgaged properties + mortgage value of mortgaged ones + building cost of buildings.
11. **Starting money comes out of bank cash** and is logged in the ledger.
12. **Auctions** are open-outcry: any remaining bidder may bid at least the current high bid + minimum increment (₹100 scaled); players pass to drop out; it ends when one bidder remains or everyone passes with no bid (property stays unowned). The server may auto-pass idle bidders.
13. **CH11 Strategic Acquisition** moves forward to the nearest unowned city; with none left, nothing happens. Forward card moves pay the Start bonus if they pass Start.
14. **Jail.** The only way into jail on this board is three doubles. Leaving jail by rolling doubles moves you but doesn't grant an extra roll.
15. **Leaving mid-game** (consented leave or expired reconnection) forfeits: bankruptcy to the bank.
16. **Persistence.** The resolved economy and live state stay in the Colyseus room (covers reconnects and reloads on the single game server). Writing match results to Postgres is a later step.
17. **Private state.** Deck order is never sent to clients; the public view shows only deck sizes.
