# portal-container

One home for your games. The Portal holds a **character vault** and launches each game; when you enter a game you choose a **party of up to 5 characters** to bring along. Characters are copied, never moved, and progress earned in a game (level, rarity) flows back to the vault.

| id | Game | Repo |
|---|---|---|
| `nxbnvnb` | Ultimate Ninja Legends (Naruto) | [Pomu1144/NXBNVNB](https://github.com/Pomu1144/NXBNVNB) |
| `jjk-net0` | Jujutsu Kaisen: Cursed Clash | [Pomu1144/JJK-net0](https://github.com/Pomu1144/JJK-net0) |

## How it fits together

```
portal-container/            (this repo — the hub)
  index.html                 launcher: games, vault, party picker, in-game view
  games.json                 game list: id, name, url, maxParty
  js/vault.js                the character vault (localStorage portal_vault_v1)
  js/market.js               price engine for currencies and stocks
  js/bank.js                 balances, conversions, trades, orders, ledger (portal_bank_v1)
  js/charts.js               SVG price charts
  js/bridge.js               hub side of the protocol
  js/hub.js                  the app: Play, Vault, Exchange, Markets, Activity
  data/stocks.json           the fictional companies
  assets/ART_PROMPTS.md      image prompts for every art slot
  sdk/portal-sdk.js          the file every game includes (canonical copy)
  schema/character.v1.json   the portable character card
```

Each game stays its own repo and site. The hub opens a game in an iframe and the two talk over `postMessage` using `sdk/portal-sdk.js`:

1. The game says `hello`; the hub answers `welcome` with the player and the party (0–5 cards).
2. The game turns each card into its own unit with an **adapter**: a card from its own game adds that unit; a card from another game becomes a playable *guest*.
3. The game may `update` a party card (level/rarity only go up) or `grant` one of **its own** characters into the vault.

4. The game may `deposit` its currencies at the Portal or `withdraw` them.

The hub only reads messages from the open game's iframe and origin, rejects updates for cards outside the party, and refuses grants of characters a game does not own.

Without the hub, characters can still travel as a **Portal Code** (`PRTL1.…`, up to 5 cards): copy it from one game's *Settings → Portal* and paste it into another game or into the hub.

## Currency and the Portal Exchange

Each game's two currencies are held at the Portal as their own assets:

| Asset | NXBNVNB | JJK-net0 |
|---|---|---|
| `<game>:coins` | Ryo | JP |
| `<game>:premium` | Ninja Pearls | Cubes |

A game deposits and withdraws only its own two currencies (`deposit` / `withdraw` in the SDK). Moving value between games happens on the hub's **Exchange**, priced in **Portal Credits (◈)**:

- **Floating exchange rates.** Every currency has a price in credits that moves minute by minute, so 1 Ryo might buy 1.14 JP today and 1.26 next week. **Convert** swaps any currency for another (or for credits) in one step.
- **Stock market.** Twelve fictional companies from both worlds (`data/stocks.json`) with their own volatility, a shared market factor and occasional news events that move prices. Buy shares with credits, sell them later, convert the credits into whatever currency a game needs.
- **Target orders.** Buy or sell at a price you choose. The cost (or the shares) is set aside, the order fills automatically if the price reaches the target, even while the hub is closed, and expires after 7 days returning what was set aside.
- **Activity** lists holdings with profit/loss, open and closed orders, and every transfer, trade and order.

How prices work (`js/market.js`): a price is a pure function of the player's market seed, the asset and the minute: layered smooth noise at time scales from 30 minutes to 2 weeks, a market-wide factor for stocks, and decaying news shocks. Nothing is stored or ticked, so history for charts and order checks is computed on demand and reloading can't change a price. The noise is mean-reverting: prices wander around a base value instead of inflating.

Money rules (`js/bank.js`): rounding always goes against the player, buying and selling cross a spread (1–2% for currencies, 0.4% for stocks), so no round trip creates money. The bank's clock never goes backwards, so winding the device clock back can't replay an old price. Every game transfer carries a `txId`; the bank applies each one once, so a game that lost the answer retries safely. Portal Codes never carry currency.

## Character card (v1)

```json
{
  "schema": 1,
  "id": "nxbnvnb:minato_2101",
  "sourceGame": "nxbnvnb",
  "baseId": "minato_2101",
  "name": "Minato Namikaze",
  "title": "Raikosekka",
  "franchise": "naruto",
  "element": "Skill",
  "rarity": 6,
  "level": 75,
  "maxLevel": 100,
  "stats": { "hp": 0.545, "atk": 0.432, "speed": 0.553 },
  "art": { "portrait": "https://…/portrait_6S.webp", "full": "https://…/full_6S.webp" }
}
```

Every game shares the same elements: Body > Skill > Heart > Body, and Bravery and Wisdom are strong against each other. Stats are normalised to 0–1 against `PortalSDK.STAT_CAPS` (hp 75000, atk 10000, speed 550). Full schema: `schema/character.v1.json`.

## Adding a game

1. Copy `sdk/portal-sdk.js` into the game unchanged.
2. Call `PortalSDK.connect({ gameId })` on page load; it resolves to `null` when the game runs on its own.
3. Write the adapter: card → unit (import) and unit → card (export).
4. Add the game to `games.json`.

## Hosting

GitHub Pages serves every repo under `https://pomu1144.github.io/<repo>/`, so the hub and the games share one origin and `games.json` links them with relative URLs (`../NXBNVNB/index.html`). Enable Pages for this repo (Settings → Pages → Source: GitHub Actions); `.github/workflows/deploy-pages.yml` deploys `main`.

## Running locally

Put the repos side by side and serve their parent folder:

```sh
# parent/portal-container, parent/NXBNVNB, parent/JJK-net0
cd parent && python3 -m http.server 8000
# open http://localhost:8000/portal-container/
```
