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

## Useful references

- Blizzard Korean patch notes:
  https://news.blizzard.com/ko-kr/article/24266869/informacje-o-aktualizacji-gry-diablo-iv
- Blizzard Korean Lord of Hatred overview:
  https://news.blizzard.com/ko-kr/article/24267729/%EA%B2%B0%EC%A0%84%EC%97%90%2B%EB%8C%80%EB%B9%84%ED%95%98%EB%9D%BC%3A%2B%EC%A6%9D%EC%98%A4%EC%9D%98%2B%EA%B5%B0%EC%A3%BC%EA%B0%80%2B%EB%8B%A4%EA%B0%80%EC%98%B5%EB%8B%88%EB%8B%A4
- Wowhead Korean item example, The Grandfather:
  https://www.wowhead.com/diablo-4/ko/item/%ED%95%9C%EC%95%84%EB%B9%84-223271
- Wowhead Korean item example, Harlequin Crest:
  https://www.wowhead.com/diablo-4/ko/item/%ED%95%A0%EB%A6%AC%ED%80%B8-%EA%B4%80%EB%AA%A8-609820
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
