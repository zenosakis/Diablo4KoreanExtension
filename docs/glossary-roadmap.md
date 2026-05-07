# Diablo IV Korean Glossary Roadmap

이 문서는 Diablo IV 영어 -> 한국어 용어표를 더 정확한 1:1 매핑표로 만들기 위한 후속 작업 목록입니다.

## Current Problem

- 현재 `data/diablo4-ko-glossary.json`은 완전한 공식 1:1 용어표가 아닙니다.
- 일부 항목은 Wowhead/Blizzard/게임 클라이언트 기준으로 확인됐지만, 일부 항목은 과거에 의미 번역이나 커뮤니티 표기를 바탕으로 들어간 흔적이 있습니다.
- 용어표에 없는 항목은 브라우저/Chrome 번역기가 일반 문장처럼 번역할 수 있습니다.
- 그 결과 `Crushing`처럼 게임 용어로는 `으스러뜨리는`이 맞는 표현이 `눌러 터트리는` 같은 일반 번역으로 나올 수 있습니다.

## Short-Term Tasks

1. Add a glossary miss review queue.
   - 페이지에서 번역 전 영어 게임 용어가 glossary에 없을 때 후보 목록으로 남깁니다.
   - 사용자가 이상한 번역을 발견했을 때 바로 `en`, 현재 번역 결과, 페이지 URL을 수집할 수 있게 합니다.

2. Continue Wowhead id-based verification.
   - 아이템, 기술, 위상, 정복자 노드처럼 Wowhead에 id가 있는 항목은 영어 페이지 id와 한국어 페이지 id를 맞춰 검증합니다.
   - 검증된 항목은 `source`나 `verified` metadata를 붙입니다.
   - 검증 실패 항목은 임의로 번역하지 말고 별도 목록에 남깁니다.

3. Mark glossary confidence.
   - 각 항목을 `verified`, `unverified`, `manual`, `generated` 같은 상태로 구분합니다.
   - verified가 아닌 항목은 나중에 우선 검토 대상으로 삼습니다.

## Battle.net Install Extraction Plan

1. Battle.net 버전 Diablo IV를 설치합니다.
2. D4Analyzer에서 Battle.net 설치 경로를 다시 엽니다.
   - Steam 설치본은 D4Analyzer/CASCExplorer 로컬 모드에서 valid storage로 인식되지 않았습니다.
3. D4Analyzer가 열리면 `StringLists / translations`를 확인합니다.
4. `enUS`와 `koKR` 문자열 테이블을 export합니다.
5. 같은 string id/key 기준으로 `enUS -> koKR` 매핑표를 생성합니다.
6. 생성된 표와 기존 `diablo4-ko-glossary.json`을 비교합니다.
7. 충돌 항목은 게임 파일 export 값을 최우선으로 삼고, Wowhead/Blizzard 출처로 보조 검증합니다.

## Generated Glossary Plan

1. Add a script such as `scripts/build-glossary-from-stringlists.js`.
2. Input:
   - exported `enUS` string table
   - exported `koKR` string table
3. Output:
   - generated raw mapping file
   - verified glossary subset
   - conflict report
   - missing Korean or missing English report
4. Review generated mappings before merging into the extension glossary.

## Translation Behavior Improvements

1. Protect known game terms before machine translation.
2. Do not let machine translation rewrite verified glossary replacements.
3. For high-risk glossary misses, prefer leaving the English term unchanged over inventing Korean game terminology.
4. Add debug mode that shows which glossary entry changed each piece of text.

## Priority Order

1. Fix reported bad mappings immediately.
2. Verify all common item and skill names with Wowhead id-based checks.
3. Add glossary miss review queue.
4. Try Battle.net install extraction.
5. Generate official string-id-based glossary if extraction succeeds.
6. Replace unverified/manual entries with verified generated mappings.

