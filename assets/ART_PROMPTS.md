# Portal art: image prompts

Every image below already has a slot in the hub. Until a file exists, the hub draws a fallback (gradient, kanji or monogram), so images can be added one at a time.

**How to use:** paste the style anchor at the top of a new image chat, then one prompt per message. Save as PNG; drop the files into this folder at the paths shown (or hand them over and they'll be resized and converted to WebP).

## Style anchor (paste once per chat)

> You are producing game UI art for "Portal", a premium launcher that connects anime-inspired gacha games. Art direction: Japanese lacquerware and gold leaf: deep black-brown lacquer (#0b0a09 to #211d16), warm gold (#d4af5f to #f1d79b) used sparingly as a highlight, subtle washi-paper grain, soft volumetric light, crisp edges. Feel: AAA mobile game UI (Genshin Impact / Honkai: Star Rail menu quality). No text, letters or watermarks in any image unless asked. No real logos or brands. Consistent lighting from the upper left.

## Brand

| # | File | Size | Prompt |
|---|---|---|---|
| 1 | `brand/portal-mark.png` | 1024×1024, transparent | An app emblem: a stylised torii gate whose opening is a swirling gold portal, carved in black lacquer with gold-leaf edges, set on a rounded-square tile with a soft bevel. Centered, symmetrical, readable at 32 px. Transparent background. |

## Backgrounds

| # | File | Size | Prompt |
|---|---|---|---|
| 2 | `bg/hub-backdrop.webp` | 1536×1024 | A wide, dark atmospheric backdrop for a menu screen: an endless hall of black lacquer torii gates receding into fog, faint gold light leaking through, drifting gold dust. Very low contrast and mostly dark so UI text stays readable on top; the brightest area in the upper right. No characters. |
| 3 | `games/nxbnvnb-cover.webp` | 1536×1024 | Key art banner for a ninja game: a hidden village in a forested valley at golden hour, giant faces carved into the cliff above it, a lone ninja silhouette on a rooftop facing the village, swirling leaves, warm orange and gold palette. Leave the bottom third calm and darker for overlaid text. No text. |
| 4 | `games/jjk-net0-cover.webp` | 1536×1024 | Key art banner for a modern dark-fantasy sorcery game: a Tokyo street crossing at night under a black dome barrier, violet and blue cursed energy rising like smoke, a lone sorcerer silhouette in a dark school uniform. Leave the bottom third calm and darker for overlaid text. No text. |

## Currency icons

All 1024×1024 with a transparent background, front-facing, centered, one object, readable at 32 px.

| # | File | Prompt |
|---|---|---|
| 5 | `currency/credits.png` | A premium gold coin for "Portal Credits": thick polished gold with a black lacquer inlay of a diamond-in-a-ring symbol, subtle engraved rim. |
| 6 | `currency/nxbnvnb-coins.png` | An old Japanese oval gold coin (koban style) for a ninja world's money, "Ryo": warm gold, worn edges, a leaf-shaped stamp. No readable text. |
| 7 | `currency/nxbnvnb-premium.png` | A glowing violet-white pearl resting in a small gold setting, soft inner light: the ninja world's premium currency. |
| 8 | `currency/jjk-net0-coins.png` | **Done:** JP icon from the game's own art (JJK-net0 `assets/pp/currency/jp.webp`). |
| 9 | `currency/jjk-net0-premium.png` | **Done:** Cubes icon from the game's own art (JJK-net0 `assets/pp/currency/cubes.webp`). |

## Stock logos (12)

Run this prompt once per row, changing the bracketed parts. 1024×1024, transparent background.

> A company logo mark for a fictional company called **[NAME]** in the **[SECTOR]** sector: **[MOTIF]**. Flat, bold, two-tone (gold #d4af5f on deep lacquer black) inside a rounded-square badge, like a premium stock-market app icon. No text, no letters.

| File | NAME | SECTOR | MOTIF |
|---|---|---|---|
| `stocks/RAMN.png` | Ichiraku Ramen Co. | Food & Drink | a steaming ramen bowl with chopsticks |
| `stocks/LEAF.png` | Hidden Leaf Construction | Infrastructure | a leaf crossed with a builder's square |
| `stocks/KUNI.png` | Kunai & Co. Armory | Industrials | two crossed kunai |
| `stocks/TOAD.png` | Mt. Myōboku Resorts | Leisure | a toad sitting on a mountain peak |
| `stocks/AKTK.png` | Akatsuki Ventures | Private Equity | a red cloud outline |
| `stocks/SAND.png` | Sunagakure Glassworks | Materials | an hourglass of desert sand |
| `stocks/JJHS.png` | Jujutsu High Endowment | Education | a temple roof over an open book |
| `stocks/ZENN.png` | Zen'in Clan Holdings | Conglomerate | a stern family crest with a tiger stripe |
| `stocks/SHBY.png` | Shibuya Underground Rail | Transit | a train entering a tunnel arch |
| `stocks/CTLS.png` | Cursed Tools Ltd | Industrials | a spear and a chain crossed |
| `stocks/KGNE.png` | Kogane Payments | Fintech | a cute golden coin-shaped mascot face |
| `stocks/LMTL.png` | Limitless Labs | Technology | an infinity symbol bent into a blindfold |

## Empty states

| # | File | Size | Prompt |
|---|---|---|---|
| 10 | `ui/empty-vault.webp` | 1024×1024, transparent | A small open lacquer treasure chest, empty inside, faint gold glow and dust motes rising. Minimal, centered, soft shadow under it. |

## Tips

- If the generator refuses a likeness, keep the prompt about places and silhouettes (as above); none of these need a named character.
- Ask for "the same style as the previous image" to keep a set consistent, and generate all currency icons in one chat, and all stock logos in another.
- Keep the backgrounds dark: the UI sits on top of them.
