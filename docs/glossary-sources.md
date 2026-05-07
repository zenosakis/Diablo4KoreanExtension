# Diablo IV Korean Glossary Sources

This project uses a local glossary before machine translation so Diablo IV
proper nouns keep the Korean in-game wording.

## Current glossary

- `data/diablo4-ko-glossary.json`
- English source locale: `en-US`
- Korean target locale: `ko-KR`
- Matching should prefer the longest term first. For example, replace
  `Critical Strike Damage` before replacing `Damage`.

## Source priority

1. Blizzard Korean patch notes and official Korean news.
2. Korean Wowhead item/database pages when official pages do not expose a
   complete searchable database.
3. Community-maintained English inventories such as D4LF for discovering
   missing English term keys.
4. Manual verification in the Korean game client for ambiguous terms.

## Mapping Rule

Do not add semantic Korean translations for named items, skills, aspects,
paragon nodes, or activities. Those entries should use a verified Korean game
client string or a Korean database page with the same Diablo IV item/string id.

Example:

- `Heir of Perdition` must map to `영벌의 후예`, not `파멸의 계승자`.
- `영벌의 후예` is verified from Wowhead Korean item id `2059799`.

## Wowhead Audit Notes

Verified item names by resolving the English Wowhead search result to the same
Diablo IV item id on the Korean Wowhead page and reading the Korean page title.

Corrections made from that audit:

- `Heir of Perdition` -> `영벌의 후예`
- `Starfall Coronet` -> `별똥별의 관`
- `Mother's Embrace` is the canonical English name; `Mothers Embrace` is kept as
  an alias.

Verified skill names by resolving the English Wowhead search result to the same
Diablo IV skill id on the Korean Wowhead page and reading the Korean page title.

Corrections made from that audit:

- `Barrage` -> `탄막`
- `Rapid Fire` -> `연발 사격`
- `Charged Bolts` -> `번개 줄기`
- `Claw` -> `발톱`
- `Maul` -> `할퀴기`
- `Crushing Hand` -> `짓이기는 손`
- `Crushing Force` -> `짓이기는 힘`

Fallback note:

- Unknown terms that are missing from the glossary can still be translated by
  the browser/machine translator. `Crushing` was not in the glossary, so it
  could be rendered as a generic phrase such as `눌러 터트리는`. Add verified
  glossary entries for those terms to prevent that fallback from changing game
  terminology.

## Local Game Install Scan

Scanned install path:

- `D:\SteamLibrary\steamapps\common\Diablo IV`

Findings:

- The install uses packed `Data` files rather than loose locale JSON/CSV files.
- `koKR` markers were found in these packed files:
  - `Data\000\0x0103-meta.dat`
  - `Data\000\1944276-0000.dat`
- An `enUS` marker was found in:
  - `Data\001\1893651-child.dat`
- A plain-text log file contains Korean UI purchase messages that confirm class
  names such as `도적`, `야만용사`, and `원소술사`:
  - `_FenrisDebug-6.txt`
- The packed locale files are not directly extractable with a text scan alone.
  To build a complete official table from the install, use a CASC/VFS extractor
  that can decode Diablo IV package data, then compare `enUS` and `koKR`
  string tables by string key.

## Follow-Up Tasks

- Try D4Analyzer again with a Battle.net Diablo IV install. The Steam install
  was not recognized as a valid local storage by the tested tools.
- If D4Analyzer opens the Battle.net install, export `StringLists /
  translations` for both `enUS` and `koKR`.
- Build a generated glossary from matching `enUS` and `koKR` string ids, then
  mark those entries as verified.
- Keep Wowhead id-based checks for items, skills, aspects, and other database
  objects where direct game string export is unavailable.
- Add a review queue for glossary misses so browser translation fallback does
  not silently invent game terminology.

## Useful references

- Blizzard Korean patch notes:
  https://news.blizzard.com/ko-kr/article/24266869/informacje-o-aktualizacji-gry-diablo-iv
- Blizzard Korean Lord of Hatred overview:
  https://news.blizzard.com/ko-kr/article/24267729/%EA%B2%B0%EC%A0%84%EC%97%90%2B%EB%8C%80%EB%B9%84%ED%95%98%EB%9D%BC%3A%2B%EC%A6%9D%EC%98%A4%EC%9D%98%2B%EA%B5%B0%EC%A3%BC%EA%B0%80%2B%EB%8B%A4%EA%B0%80%EC%98%B5%EB%8B%88%EB%8B%A4
- Wowhead Korean item example, The Grandfather:
  https://www.wowhead.com/diablo-4/ko/item/%ED%95%9C%EC%95%84%EB%B9%84-223271
- Wowhead Korean item example, Harlequin Crest:
  https://www.wowhead.com/diablo-4/ko/item/%ED%95%A0%EB%A6%AC%ED%80%B8-%EA%B4%80%EB%AA%A8-609820
- Wowhead Korean item example, Heir of Perdition:
  https://www.wowhead.com/diablo-4/ko/item/%EC%98%81%EB%B2%8C%EC%9D%98-%ED%9B%84%EC%98%88-2059799
- D4LF English term inventories:
  https://github.com/d4lfteam/d4lf/tree/main/assets/lang/enUS
- Community English/Korean mapping reference:
  https://gfndz.com/entry/%EB%94%94%EC%95%84%EB%B8%94%EB%A1%9C-4-%EC%98%81%EB%AC%B8-%EB%AA%85%EC%B9%AD%EA%B3%BC-%ED%95%9C%EA%B8%80-%EB%AA%85%EC%B9%AD-%EB%A7%A4%EC%B9%AD-%EC%A0%95%EB%A6%AC
- PureDiablo paragon references:
  https://www.purediablo.com/diablo4/Paragon_Board

## Extension implementation notes

- Apply glossary replacements before calling a general translator.
- For machine translation, protect glossary terms with placeholders and restore
  them after translation.
- Sort replacement keys by descending length to prevent partial replacements.
- Do not translate inside URLs, code blocks, or build planner identifiers.
- Keep aliases such as `Shako` mapped to the same Korean term as the canonical
  item name.
- Treat this glossary as a living file. Diablo IV seasonal patches can add or
  rename items, affixes, aspects, and activities.
