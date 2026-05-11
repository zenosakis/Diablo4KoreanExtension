# Diablo IV Korean Translator

디아블로 IV 빌드/정보 사이트의 영어 내용을 한국어로 번역하는 Chrome 확장 프로그램입니다.
일반 번역 전에 디아블로 IV 용어 사전을 먼저 적용해서 아이템, 기술, 상태 효과, 정복자 노드 같은 표현이 한국어판 인게임 용어에 가깝게 표시되도록 합니다.

## 동작 범위

- Maxroll (`https://maxroll.gg/*`, `https://*.maxroll.gg/*`) 페이지에서 동작합니다.
- `chrome://` 같은 브라우저 내부 페이지에서는 Chrome 확장 정책상 동작하지 않습니다.

### 지원 사이트 추가

Maxroll 외 사이트를 추가하려면 URL 제한이 들어간 세 곳을 함께 수정해야 합니다.

1. `manifest.json`
   - `host_permissions`에 사이트 URL 패턴을 추가합니다.
   - `content_scripts[0].matches`에 같은 URL 패턴을 추가합니다.
   - `web_accessible_resources[0].matches`에도 같은 URL 패턴을 추가합니다.

   예:

   ```json
   "host_permissions": [
     "https://maxroll.gg/*",
     "https://*.maxroll.gg/*",
     "https://example.com/*",
     "https://*.example.com/*"
   ]
   ```

2. `src/content.js`
   - `SUPPORTED_HOSTS` 배열에 루트 도메인을 추가합니다.

   ```js
   const SUPPORTED_HOSTS = ["maxroll.gg", "example.com"];
   ```

3. `popup/popup.js`
   - `SUPPORTED_HOSTS` 배열에 같은 루트 도메인을 추가합니다.

   ```js
   const SUPPORTED_HOSTS = ["maxroll.gg", "example.com"];
   ```

4. `popup/popup.html`
   - 토글 문구가 특정 사이트 이름을 직접 말하고 있다면 함께 수정합니다.

수정 후 Chrome 확장 관리 화면(`chrome://extensions`)에서 확장 프로그램을 새로고침하고, 이미 열려 있던 대상 사이트 탭도 새로고침해야 새 설정이 적용됩니다.

## 로컬 설치 방법

1. Chrome을 엽니다.
2. 주소창에 `chrome://extensions`를 입력합니다.
3. 오른쪽 위의 개발자 모드를 켭니다.
4. 압축해제된 확장 프로그램을 로드합니다 버튼을 누릅니다.
5. 이 프로젝트를 압축 해제한 폴더를 선택합니다.
6. 원하는 웹 페이지에 접속한 뒤 확장 프로그램 팝업에서 번역을 활성화합니다.

## 번역 방식

확장 프로그램은 항상 로컬 디아블로 IV 용어 사전을 먼저 적용합니다.

- `data/diablo4-ko-glossary.json`
- `data/diablo4-ko-phrase-rules.json`

Chrome에서 내장 Translator API를 사용할 수 있는 경우에는 일반 영어 문장도 한국어로 번역합니다.
이때 디아블로 IV 고유 용어는 임시 토큰으로 보호한 뒤 번역이 끝나면 다시 한국어 인게임 용어로 복원합니다.

내장 Translator API를 사용할 수 없는 환경에서는 일반 문장 번역 없이 용어 사전 치환만 동작합니다.

## 공식 문자열 추출

용어 사전은 Diablo 4 Analyzer로 Battle.net 설치본의 번역 문자열을 추출해 보강할 수 있습니다.

- 도구: [Diablo4Tools-Releases](https://github.com/DiabloTools/Diablo4Tools-Releases)
- 확인한 버전: Diablo IV Analyzer `3.0.1.71858`
- 권장 설치본: Battle.net Diablo IV
- Steam 설치본은 로컬 CASC/VFS storage로 인식되지 않을 수 있습니다.

### 추출 절차

1. Battle.net 앱에서 Diablo IV를 설치합니다.
2. 영어 문자열을 추출하려면 Battle.net 또는 게임 설정에서 텍스트 언어를 English로 맞춥니다.
3. Diablo IV Analyzer를 실행합니다.
4. `File` 메뉴에서 Diablo IV 설치 경로를 엽니다.
5. 왼쪽 탭에서 `Translations`를 선택합니다.
6. 목록이 로드되면 `Multi select`를 켜고 전체 항목이 선택되어 있는지 확인합니다.
   - 예: `Selected: 58471/58471`
7. 오른쪽 표의 가로 스크롤을 끝까지 밀어 `Translation` 컬럼이 보이는지 확인합니다.
8. `Translation` 컬럼에 영어가 표시되는 상태에서 오른쪽 표를 우클릭하고 `Copy Selected`를 선택합니다.
9. 붙여넣은 내용을 UTF-8 TSV 파일로 저장합니다.
   - `data/raw/d4-translations-enUS.tsv`
10. Battle.net 또는 게임 설정에서 텍스트 언어를 Korean으로 바꿉니다.
11. 필요한 언어 데이터 다운로드가 끝나면 Diablo IV Analyzer를 다시 실행하고 같은 설치 경로를 엽니다.
12. `Translations`에서 같은 방식으로 전체 항목을 선택하고 `Copy Selected`를 실행합니다.
13. 붙여넣은 내용을 UTF-8 TSV 파일로 저장합니다.
   - `data/raw/d4-translations-koKR.tsv`

TSV는 다음 컬럼 순서를 가져야 합니다.

```text
SNO	FileName	Index	KeyHash	Key	Translation
```

예:

```text
2500547	Achievement_Achievement_Classes_Paladin_Arbiter	0	4062401	Name	Sustained Authority
2500547	Achievement_Achievement_Classes_Paladin_Arbiter	0	4062401	Name	지속되는 권위
```

영어/한국어 파일은 `SNO`, `FileName`, `Index`, `KeyHash`, `Key`가 같은 행끼리 매칭합니다. `Index`는 언어 코드가 아니라 같은 파일 안의 문자열 항목 번호입니다. 실제 언어는 `Translation` 컬럼의 내용으로 구분합니다.

### 매핑 생성

TSV 파일을 준비한 뒤 아래 명령으로 공식 문자열 기반 매핑 후보를 생성합니다.

```powershell
node scripts\build-glossary-from-stringlists.js
```

스크립트는 `data/raw/d4-translations-enUS.tsv`와 `data/raw/d4-translations-koKR.tsv`를 읽어서 같은 문자열 키를 가진 행을 조인합니다. 이름처럼 쓰기 좋은 짧은 문자열은 glossary 후보로 분류하고, 같은 영어가 여러 한국어로 번역된 충돌 항목은 자동 병합하지 않고 별도 검토 대상으로 남깁니다.

현재 자동 병합 범위는 빌드/아이템 페이지에서 자주 쓰이는 아이템, 룬, 문양, 일반 기술, 정복자 기술/노드, 부적/목걸이 관련 명칭으로 제한합니다. 업적, 퀘스트, 상점 상품, 꾸미기 외형, 지역명처럼 일반 문장 치환 위험이 큰 항목은 기본 glossary에 넣지 않습니다.

아이템 접미사처럼 공식 문자열이 `of Channeling -> 정신 집중의` 형태로만 존재하는 항목은 `Channeling -> 정신 집중` 파생 항목을 함께 생성합니다. 이 파생 항목은 Maxroll처럼 `of` 없이 위상/접미 명칭을 보여주는 화면을 번역하기 위한 것입니다.

## 개발 메모

- 콘텐츠 스크립트는 원문 텍스트 노드를 저장해 두므로 확장 프로그램을 비활성화하면 페이지 텍스트를 되돌릴 수 있습니다.
- 동적으로 로드되는 빌드 정보와 툴팁은 `MutationObserver`로 감지합니다.
- 긴 용어를 먼저 치환해서 `Critical Strike Damage`보다 `Damage`가 먼저 바뀌는 문제를 방지합니다.
- `Might` 같은 짧은 고유명사는 일반 문장 오번역을 줄이기 위해 필요한 경우 대소문자를 구분해서 매칭합니다.
- 디아블로 IV는 시즌과 확장팩마다 아이템, 속성, 기술, 정복자 노드가 추가되므로 용어 사전은 계속 갱신해야 합니다.
