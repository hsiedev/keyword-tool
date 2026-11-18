# AGENTS.md: AI 작업자용 안내

이 문서는 이 저장소를 고치는 AI(코딩 에이전트)와 사람 개발자를 위한 안내예요.
**이 프로젝트가 어떻게 GitHub에 올라가는지**, 어디를 고치면 되는지, 무엇을 건드리면 안 되는지를 정리했어요.
사용자용 설명은 `README.md`, 기능 단위 수정 기록은 `CHANGELOG.md`에 있어요.

---

## 1. 한눈에 보기

| 항목 | 내용 |
|-|-|
| 프로젝트 | 네이버 키워드 분석기 (로컬 PC에서 실행하는 웹 앱) |
| 로컬 경로 (원본 PC) | `C:\Users\<사용자>\Documents\Lhost\keyword-tool` |
| GitHub 저장소 | https://github.com/hsiedev/keyword-tool (**비공개**, 브랜치 `main`) |
| 실행 | `start.bat` → Node.js로 `server.mjs` 실행 → http://localhost:8787 |
| 필요 프로그램 | Node.js 18 이상 (fetch 내장). npm 패키지 없음 (`node_modules` 없음) |
| GitHub 업로드 방식 | **git을 쓰지 않음.** `github-sync.mjs`가 GitHub REST API(Git Data API)로 직접 커밋 |

---

## 2. GitHub에 어떻게 올라가나 (자동 백업 구조)

### 2-1. 처음 구축한 과정 (2026-11-11)
1. GitHub 계정 `hsiedev`에 비공개 저장소 `keyword-tool`을 만듦 (README 포함으로 생성해 `main` 브랜치가 처음부터 있음).
2. **Fine-grained personal access token**을 만듦.
   - 이름 `keyword-tool-sync`, 대상 저장소 `hsiedev/keyword-tool` 하나만
   - 권한: Contents **Read and write** (+ 필수 Metadata 읽기). 다른 권한 없음
   - 만료: **2027-11-10**
3. 토큰은 원본 PC의 `data\github.json`에만 저장 (저장소에는 절대 올리지 않음).
4. 첫 커밋 `8df18a1`: "키워드 분석기 전체 코드 첫 업로드" (파일 20개).
5. 원본 PC에 git이 설치돼 있지 않아서, git 대신 API로 올리는 방식을 택함.

### 2-2. 자동 업로드 동작 (`github-sync.mjs`)
- `server.mjs`가 시작될 때 `createGitSync(__dirname)`로 만들고 `GIT.start()`를 호출해요.
  - 서버 시작 5초 뒤 한 번 동기화
  - `fs.watch`로 루트 폴더 · `public\` · `data\`의 일부 파일을 감시 → 바뀌면 **마지막 변경 30초 뒤** 동기화
- 동기화 순서 (`sync()`):
  1. `GET /git/ref/heads/main` → 최신 커밋 → 그 커밋의 tree를 `?recursive=1`로 받음
  2. 올릴 파일 목록(`listFiles()`)을 만들고, 각 파일의 **git blob SHA-1** (`"blob <길이>\0" + 내용`)을 계산
  3. 원격과 SHA가 다른 파일 = 바뀐 파일, 원격에만 있는 파일 = 삭제할 파일
  4. 바뀐 게 없으면 아무것도 안 함
  5. 바뀐 파일만 `POST /git/blobs` → 전체 목록으로 `POST /git/trees` (base_tree 없이 → 로컬에 없는 파일은 원격에서 삭제됨)
  6. `POST /git/commits` (부모 = 현재 main) → `PATCH /git/refs/heads/main`
- 커밋 메시지:
  - `data\next-commit.txt`가 있으면 그 내용을 쓰고, 올린 뒤 그 파일을 지움
  - 없으면 `자동 백업: 바뀐 파일 목록`
  - 어느 경우든 메시지 끝에 `바뀐 파일 (N):` 목록이 붙음
- 상태 기록: `data\github-state.json` (마지막 업로드 시각, 커밋, 오류)
- 화면: 설정 › API 설정 › **GitHub 백업** 탭
  - 상태 표시, [지금 올리기], 저장소·토큰 입력, "기존 키워드 목록·대량 분석 내역도 올리기" 옵션
- 서버 API:
  - `GET /api/github`: 상태
  - `POST /api/github`
    - `{ sync: true }`: 지금 올리기
    - `{ config: { owner, repo, token, includeData } }`: 설정 저장
    - `{ message: "..." }`: 다음 커밋 메시지 지정

### 2-3. 올리는 것 / 올리지 않는 것
`listFiles()`와 `.gitignore`가 같은 규칙을 따라요.

| 올림 | 올리지 않음 |
|-|-|
| 루트의 `*.mjs` `*.js` `*.bat` `*.md` `*.json`(아래 제외) `.gitignore` | `config.json` (네이버·Gemini API 키) |
| `public\` 전체 (화면) | `cache.json` (분석 캐시, 수 MB) |
| `data\settings.json` (화면·규칙 설정, 비밀 아님) | `data\github.json` (**GitHub 토큰**), `data\github-state.json`, `data\next-commit.txt` |
| (옵션 켜면) `data\existing-keywords.json`, `data\bulk-history\` | `data\` 나머지 (사용자 키워드 목록, 대량 분석 내역), `backup\`, `*.tmp` |

**새 비밀 파일을 만들면 반드시 `github-sync.mjs`의 `listFiles()`와 `.gitignore` 둘 다에서 제외하세요.**

---

## 3. 코드를 고친 뒤 AI가 할 일

1. **고치기 전**: 화면 파일을 크게 바꿀 때는 `backup\<이름>_<날짜시간>\`에 복사해 두기 (backup은 업로드 안 됨).
2. **고치기 시작할 때 먼저** `data\next-commit.txt`에 이번 수정 요약을 적으세요. 서버가 켜져 있으면 파일을 저장하고 30초 뒤에 바로 올라가요. 설명을 나중에 쓰면 커밋이 "자동 백업: 파일명"으로만 남아요. 30초 대기는 파일이 바뀔 때마다 다시 시작되니, 설명을 먼저 써두면 마지막 수정까지 한 커밋에 묶여요.
3. **고친 뒤**:
   - `CHANGELOG.md` 맨 위 날짜 아래에 기능 단위로 한 줄 추가
   - 사용자 기능이 바뀌었으면 `README.md`의 해당 섹션 수정
   - `data\next-commit.txt`에 이번 수정 요약을 한국어로 적기
     - 첫 줄 = 커밋 제목 (예: `대량 분석: 판정 필터 추가`), 다음 줄부터 상세
4. **업로드**:
   - 서버가 켜져 있으면 30초 안에 자동으로 올라가요.
   - 서버가 꺼져 있거나 바로 올려야 하면, 2-2의 API 순서를 그대로 직접 실행하세요. 토큰은 `data\github.json`의 `token`.
   - 일부 파일만 올릴 때는 `POST /git/trees`에 `base_tree`(현재 커밋의 tree SHA)를 넣으면 나머지 파일은 그대로 유지돼요.
   - **토큰 값을 로그·채팅·파일에 출력하지 마세요.**
5. **확인**: https://github.com/hsiedev/keyword-tool/commits/main 에 새 커밋이 생겼는지 확인.

---

## 4. 파일 구조

| 파일 | 역할 |
|-|-|
| `server.mjs` | HTTP 서버 (127.0.0.1:8787)<br>네이버 검색광고·검색·데이터랩 API 호출, 분석, 캐시<br>AI 호출, 설정 API, GitHub 자동 백업 연결 |
| `sections.mjs` | 네이버 통합검색 결과 HTML에서 섹션 순서 파싱 |
| `settings-defaults.mjs` | 화면·규칙 설정 기본값과 정규화 (`data\settings.json`) |
| `ai-cli.mjs` | **로그인형 AI**: 공식 CLI를 실행해 구독 계정으로 AI 사용<br>Antigravity CLI `agy` / Claude Code `claude -p` / Codex CLI `codex exec` |
| `github-sync.mjs` | GitHub 자동 백업 (2장) |
| `tests\run.mjs`, `test.bat` | 자동 테스트. 코드만 임시 폴더로 복사해서 서버를 띄우고 바깥 인터넷 요청은 가짜 응답으로 바꿈. 하위 프로세스 없음 |
| `start.bat` | Node.js 실행 파일을 찾아 `server.mjs --open` 실행 (fnm·nvm·Volta 등 경로 탐색) |
| `public\index.html` | 키워드 분석 화면 + 설정 창 + 공통 함수(`$`, `esc`, `fmt`, `run`, 차트) |
| `public\app.css` | 전체 스타일. 색은 모두 CSS 변수, `html.dark`에서 다크 모드 |
| `public\layout.js` | 왼쪽 사이드바 · 상단 바 · 테마 전환 (기존 화면 코드를 감싸는 틀) |
| `public\ai.js` | AI 키워드 생성기 (탭, 생성, 중복 검사 엔진, 조건 재검증) |
| `public\dedup.js` | 키워드 중복 검사 화면 |
| `public\bulk.js` | 대량 분석 (내역 탭, AI 조건 재검증) |
| `public\copy-spec.js` | 카피 규격(FORMATS)과 자동 검사(check · checkText). **화면 · 서버(copy-core.mjs가 읽어 씀) · 테스트가 같이 씀** → 규격은 여기서만 고치세요 |
| `copy-core.mjs` | 경쟁 파워링크 읽기(parsePowerlinks: #power_link_body), 카피 생성·다시 쓰기·재검증 요청문, 파일 저장소(createStore: 탭/캠페인 하나 = 파일 하나 + index.json) |
| `public\copy.js`, `public\copy.css` | AI 카피 생성기 화면 (#copyView, 사이드바 #cSide) |
| `public\admock.js` | 광고 목업 (#mockView, #mSide). 템플릿 정의 TPL · 확장소재 EXT · 네이버 모양 CSS(MOCK_CSS, PNG 저장에도 씀) · window.__MOCK(addFromCopy, miniPreview) |
| `google-core.mjs` | 구글 모드 서버: 자동완성(구글·유튜브), 구글 트렌드(비공식 · 쿠키 · 429 재시도 · 메모리 저장), 키워드 플래너 CSV 읽기(parsePlannerCsv) · 모음(data\google\planner.json), 트렌드 CSV(parseTrendsCsv), 유튜브(config.youtubeKey). 라우트는 /api/google/* (handle) |
| `public\google.js`, `public\google.css` | 구글 키워드 분석 화면 (#gView). window.__G = { show, run } |
| `public\dialogs.js` | 화면 안 알림 `toast(msg, type)`·확인창 `await uiConfirm(msg)`. `window.alert`는 toast로 바뀜. **새 코드에서 브라우저 confirm/alert를 쓰지 말 것** |
| `public\filters.js` | 공통 결과 필터 막대 (검색어·제외어·숫자 범위) |
| `public\review.js` | 판정 엇갈림 정리 창 |
| `public\settings.js` | 설정 › 화면·커스텀, 규칙·알고리즘 탭 |
| `public\logo.png` 외 | 로고 (512·128), 탭 아이콘 `favicon.png`(64)·`favicon-32.png`, `apple-touch-icon.png`(180). 원본은 투명 배경 PNG |
| `public\xlsx-lite.js` | 엑셀 읽기·쓰기 (의존성 없는 자체 구현) |

AI 제공자는 서버의 `PROVIDERS`에 정의돼 있어요.
- `gemini`: API 키
- `agy` / `claude` / `codex`: 로그인형
- Claude·GPT **API 키 연동은 비용 문제로 삭제됨**. 다시 넣지 마세요.

---

## 5. 지켜야 할 것 (사용자 요구사항)

- 원본 PC의 `config.json`, `cache.json`, `data\` 파일은 **테스트로 덮어쓰거나 지우지 말 것**.
  - 과거에 config 삭제 사고가 있었어요.
  - 테스트는 임시 복사본에서 하세요.
- 서버(`*.mjs`)를 바꾸면 사용자가 `start.bat`을 다시 실행해야 적용돼요. 화면(`public\`)만 바꾸면 새로고침으로 충분해요. 답변에 어느 쪽인지 알려주세요.
- **데모(가짜) 데이터를 화면에 넣지 말 것.** API 키가 없으면 "미표시"로 보여줘요.
- 키워드는 띄어쓰기 없이 붙여서 저장·생성 (설정에서 끌 수 있음).
- 모든 다운로드에는 엑셀/CSV와 함께 TXT 제공. 필터가 걸려 있으면 필터된 결과만 내보내요.
- 사용자에게 보이는 문구는 쉬운 한국어로.

---

## 6. 새 PC에서 처음부터 구축하기

`README.md` 맨 위 "새 PC에 설치하기"를 따르면 돼요. 요약하면:
1. Node.js LTS 설치
2. 저장소 ZIP 받기 또는 `git clone`
3. `start.bat` 실행
4. 설정에서 API 키 다시 입력
5. 그 PC에서도 자동 백업하려면 설정 › API 설정 › GitHub 백업에 저장소 `hsiedev/keyword-tool`과 토큰 입력

토큰을 새로 만들 때: https://github.com/settings/personal-access-tokens/new
- Only select repositories → `keyword-tool`
- Repository permissions → Contents: Read and write
- 토큰 이름은 **영문**으로 하세요. 한글 이름이면 GitHub가 "unknown error"를 냈어요.

## 7. 서버 공통 규칙 (2026-11-12 추가)

- **보안 검사(`guard`)**: `server.mjs`의 라우터 맨 앞에서 모든 요청을 검사해요. Host가 localhost/127.0.0.1이 아니면 403, `/api/`의 GET 외 요청은 Origin이 localhost가 아니거나 Sec-Fetch-Site가 cross-site면 403. 새 POST 엔드포인트도 자동으로 보호되니 따로 검사할 필요 없어요.
- **요청 본문**: `readBody`는 25MB 제한(413), JSON이 아니면 400. 오류 객체에 `status`를 넣으면 그 상태 코드로 응답해요.
- **버전·다시 시작**: `/api/version`은 서버 파일(server/ai-cli/github-sync/sections/settings-defaults)의 해시를 시작할 때와 지금 비교해 `stale`을 알려줘요. `/api/restart`는 `KT_LOOP=1`(새 start.bat)일 때만 코드 99로 종료 → start.bat이 다시 실행.
- **자동완성**: `/api/suggest?keyword=&deep=1`. 네이버 관련 검색어는 통합검색 PC HTML 안의 `"apiURL":"https://s.search.naver.com/p/qra/..."`를 찾아 그 JSON을 읽어요. 네이버가 구조를 바꾸면 여기부터 확인하세요.
- **테스트**: 고친 뒤 `node tests\run.mjs` (Windows 샌드박스 등에서 하위 프로세스가 막혀 있어도 돌아가요). 새 기능엔 테스트를 한 줄이라도 추가하세요.
- **긴 작업 중 자동 커밋**: 서버가 켜져 있으면 파일을 저장할 때마다 30초 뒤 올라가요. `next-commit.txt` 설명은 첫 업로드에만 쓰이고 그 뒤는 "자동 백업: 파일명"이 돼요. 여러 단계 작업은 마지막에 문서(CHANGELOG)와 함께 전체 요약 설명으로 한 번 더 커밋하세요.
- **알려진 한계**: 데이터랩은 요청마다 최댓값=100인 상대값만 줘서 성별·연령 비율은 정확히 낼 수 없어요 (넣지 않기로 함).
## 8. AI 카피 생성기 · 광고 목업 (2026-11-13 추가)

- **규격은 public\copy-spec.js 한 곳**: 네이버 광고 도움말·광고 가이드 기준 (파워링크 /help/faq/344·1454·1422, 브랜드검색 /adguide/1627·1628·1631·1649·1650~1654·1656·1668·1637·1666, 표현 /adguide/24·144). 목업 템플릿(admock.js TPL)의 글자 수·이미지 크기도 같은 출처예요. 바꾸면 tests\run.mjs 기대값도 같이 확인하세요.
- **검사는 PC가 계산** (AI에 맡기지 않음). AI 재검증은 참고용으로 따로.
- **사용자 주의어(rules.copy.caution)는 빈 목록이 기본** (사용자 결정). 최상급 검사는 네이버 공통 규정이라 기본 켜짐, 설정에서 끌 수 있음.
- **카피는 띄어쓰기를 지켜요**: 키워드 생성기의 '붙여 쓰기' 설정을 카피에 쓰지 마세요 (붙여 쓴 문구는 심사 보류).
- **경쟁 광고 읽기**: 통합검색 PC HTML의 `#power_link_body` 안 `li.lst`에서 `.site · .lnk_url · .lnk_tit(여러 개) · .link_desc · .link_ext_desc(.prefix_ext/.title_ext) · .sublink_text/.lst_link .link`. 네이버가 구조를 바꾸면 여기부터 고치세요. 1시간 캐시(`pl:키워드`).
- **저장**: `/api/copy-projects`, `/api/ad-mock` (GET ?id= / GET 목록 / POST {doc} / POST {doc, metaOnly} / POST {delete}). 데이터는 GitHub 백업 대상이 아니에요.
- **미리보기 CSS(MOCK_CSS)는 .nvm 안에서만**: PNG 저장은 SVG foreignObject로 그려서, 바깥 이미지(경쟁사 파비콘 등)를 쓰면 안 돼요 (data URL만).
- 브라우저 `prompt()`도 쓰지 말고 `await uiPrompt(msg, { value, placeholder })`.
- **상단 탭 줄 (2026-11-13)**: layout.js가 상단 바에 #openTabs를 만들고, 한 번이라도 연 화면(VIEWS의 키)을 localStorage 'openViews'에 순서대로 기억해요 (같은 화면은 하나만). 새 화면을 VIEWS에 추가하면 탭도 자동으로 생겨요. 검색창 #searchForm은 상단에서 빠져 #empty(첫 화면) 또는 #kwSearch(결과 위)로 옮겨 다녀요. #histBtn · #topTitle은 다른 코드가 참조해서 지우지 않고 CSS로만 숨겨요.

## 9. 구글 모드 (2026-11-13 추가)

- **무료 방식만** (사용자 결정). 키워드 플래너 API는 Basic 승인 + 브랜드 인증이 필요해서 쓰지 않고 CSV 가져오기로 해요. 구글 검색 결과 API(Custom Search)는 신규 가입이 막혔고, Gemini 검색 연결은 무료 등급에서 안 돼서 넣지 않았어요.
- **모드 상태**: localStorage `siteMode`('naver'|'google'), `body.mode-google`. layout.js의 `getMode/isG/setMode/applyMode`가 담당하고 `window.__MODE`로 열어 둠. 구글 모드에서 네이버 전용 화면이 열리면(해시·다른 코드) 자동으로 네이버 모드로 바뀜. 상단 탭 `openViews_g`, 최근 검색 `gHistory`.
- **구글 메뉴를 늘릴 때**: CSS `body.mode-google .as-nav [data-view]:not([data-view="analyze"])` 숨김 규칙과 layout.js `go()`의 구글 분기를 같이 고치세요.
- **구글 트렌드**는 비공식이라 언제든 막힐 수 있어요. explore → widgetdata(multiline · relatedsearches · comparedgeo) 순서, 요청 사이 0.9초, 429면 쿠키 새로 받아 최대 3번. 실패한 부분만 errors에 넣고 CSV 가져온 값으로 채움. 관련 검색어가 원래 없는 키워드도 있어요(예: 상조회사).
- **플래너 CSV**는 UTF-16(탭)인 경우가 많아 화면(google.js decode)에서 글자를 풀어 텍스트로 보내요. 머리글은 '키워드/Keyword' 칸이 있는 줄, 월별 칸은 '검색:/Searches:'로 시작.
- 테스트: tests\run.mjs '3-2. 구글 모드' (가짜 응답으로 429 재시도 · CSV · 유튜브).
## 10. 파워링크 분석기 (2026-11-18 추가)
- 서버: `powerlink-core.mjs` (createPowerlink). 화면: `public/pl.js` (#plView, 사이드 #pSide), 라우트 `/api/pl/*` (jobs · job · start · resume · stop · perf · xlsx · img · rename · delete).
- 순위: `ad.search.naver.com/search.naver?where=ad` (PC) · `m.ad.search.naver.com/search.naver?where=m_expd` (모바일) HTML의 `data-nlog-params` → `cr_rank_legacy`(순위) · `display_url` · `ad_id`(nad-a001-01 = 파워링크, -03 = 파워컨텐츠 제외). 쿠키 없이 = 로그아웃 상태.
- 내 광고 찾기(findMine): 표시 URL과 사용자 URL 비교. 3 주소+경로 · 2 같은 주소 · 1 같은 도메인(하위 주소 다름, 화면에 '도메인만 일치' 경고).
- 캡처: Edge/Chrome headless를 CDP(Node 내장 WebSocket)로 직접 제어, 추가 설치 없음. 프로필 `data/powerlink/.browser`. 통합검색 블록 `[id^=pcPowerLink]`/`[id^=mobilePowerLink]`. 원본 `NNNN_pc.jpg` + 내 광고 주변 `NNNN_pc_f.jpg`(표·엑셀용).
- 속도: 모든 네이버 요청은 gate()로 간격(rules.powerlink.gapMs, 기본 1200ms + 랜덤 0~300ms). '검색 서비스 이용이 제한' 감지 시 60·120·240…초 쉼.
- 입찰가: `/estimate/average-position-bid/keyword` (PC 1~10 · 모바일 1~5, 묶음 실패 시 하나씩), `/estimate/performance/keyword` (bids 1개, 동시 3). ad-guard 허용 목록 안.
- 엑셀: `buildXlsx` (그림 포함, 서버에서 zip 직접 작성). 작업 데이터는 `data/powerlink/` → GitHub 업로드 제외(data/*).
