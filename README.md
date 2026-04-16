# naver-blog-uploader

> 마크다운 파일을 네이버 블로그에 자동으로 올려주는 **Playwright 기반 CLI 도구**.
> `**bold**`, `==highlight==`, `##소제목##` 같은 커스텀 마크업을 네이버 스마트에디터 서식으로 자동 변환합니다.

- 🤖 **AI 에이전트 친화적**: Claude Code / Cursor / Windsurf 등에 레포를 던져주고 "설정하고 테스트해줘" 한 줄이면 동작합니다.
- 🧪 **샘플 포스트 포함**: 설치 직후 바로 dry-check 가능한 `files/ready/sample-post/` 제공.
- 🔐 **자격증명 분리**: 모든 계정 정보는 `.env` 로 관리, 코드에 하드코딩 없음.

---

## 목차

- [빠른 시작 (3줄)](#빠른-시작-3줄)
- [AI 에이전트로 한 번에 돌리기](#ai-에이전트로-한-번에-돌리기)
- [요구 사항](#요구-사항)
- [상세 설치 가이드](#상세-설치-가이드)
- [첫 실행: 샘플 포스트로 검증](#첫-실행-샘플-포스트로-검증)
- [본인 콘텐츠 올리기](#본인-콘텐츠-올리기)
- [마크업 문법 요약](#마크업-문법-요약)
- [환경 변수 전체 목록](#환경-변수-전체-목록)
- [멀티 계정](#멀티-계정)
- [프로젝트 구조](#프로젝트-구조)
- [문제 해결](#문제-해결)
- [주의사항 / 면책](#주의사항--면책)
- [기여 / 라이선스](#기여--라이선스)

---

## 빠른 시작 (3줄)

```bash
git clone https://github.com/baessu/naver-blog-uploader.git
cd naver-blog-uploader && npm install && cp .env.example .env
# .env 파일 열어 NAVER_USERNAME / NAVER_PASSWORD 입력 후
npm start
```

첫 실행 시 `files/ready/sample-post/` 의 샘플 글이 업로드됩니다.

---

## AI 에이전트로 한 번에 돌리기

Claude Code / Cursor / Windsurf / Aider 등 AI 코딩 에이전트가 이 레포를 스스로 셋업하고 테스트할 수 있도록 `CLAUDE.md` 를 포함했습니다.

### 권장 프롬프트 예시

아래 블록을 그대로 AI 에이전트에게 던지세요.

```
다음 레포를 클론해서 로컬에서 실행 가능한 상태로 만들어줘:
https://github.com/baessu/naver-blog-uploader

순서:
1. git clone 후 cd 이동
2. 루트의 CLAUDE.md 를 먼저 읽고 전체 구조 파악
3. npm install (postinstall 에서 Playwright Chromium 자동 설치)
4. .env.example 을 .env 로 복사 — 실제 계정은 내가 직접 채울 거니 placeholder 그대로 둬
5. files/ready/sample-post/ 의 샘플 마크다운이 있는지 확인
6. 설치 중 발생한 경고/에러만 요약해서 알려줘
7. .env 가 준비되면 내가 직접 `npm start` 실행할 테니 그 전까지만 준비
```

### 에이전트가 주의해야 할 것

- `.env` 값은 **사용자가 직접 채우도록** 두세요. AI가 임의로 채우지 말 것.
- 민감 정보(네이버 아이디/비밀번호)를 **코드에 하드코딩하지 마세요**. `src/config/defaults.js` 의 `buildAccountsFromEnv()` 패턴 유지.
- 네이버 셀렉터가 안 먹힐 땐 `src/utils/selectors.js` 한 곳만 수정하세요.

자세한 가이드는 [`CLAUDE.md`](./CLAUDE.md) 참고.

---

## 요구 사항

| 항목 | 버전/조건 |
|---|---|
| Node.js | **18 이상** (`node --version` 으로 확인) |
| npm | 9 이상 권장 |
| OS | Windows / macOS / Linux |
| 네이버 계정 | 1개 이상, 2단계 인증 비활성 권장 |
| 디스크 | ~500MB (Playwright Chromium 포함) |

---

## 상세 설치 가이드

### 1. 레포 클론

```bash
git clone https://github.com/baessu/naver-blog-uploader.git
cd naver-blog-uploader
```

### 2. 의존성 설치

```bash
npm install
```

`postinstall` 훅이 자동으로 Playwright Chromium 을 다운로드합니다(~170MB).
실패하면 수동으로:

```bash
npx playwright install chromium
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
```

편집기로 `.env` 를 열어 최소 두 값을 채우세요.

```dotenv
NAVER_USERNAME=your_naver_id
NAVER_PASSWORD=your_naver_password
```

> ⚠️ `.env` 는 **절대 git 에 커밋되지 않습니다** (`.gitignore` 로 처리됨). 그래도 실수로 공유 폴더에 두지 마세요.

---

## 첫 실행: 샘플 포스트로 검증

레포에는 **업로드 가능한 샘플 글**이 포함되어 있습니다.

```
files/ready/sample-post/2026-04-16__sample__hello_naver_blog.md
```

환경변수 입력 후 바로 실행:

```bash
npm start
```

정상 동작 시:
1. Chromium 창이 열리며 네이버 로그인 페이지로 이동
2. `.env` 자격증명으로 자동 로그인
3. 블로그 글쓰기로 이동 후 샘플 마크다운이 입력됨
4. 업로드 완료 시 샘플 폴더가 `files/done/` 으로 이동

로그인까지 성공하면 핵심 경로는 모두 정상입니다.

---

## 본인 콘텐츠 올리기

### 폴더 규약

`files/ready/` 하위에 **폴더 하나당 글 하나** 를 배치합니다.

```
files/ready/
├── 2026-04-17_travel-jeju/
│   └── 2026-04-17__travel__제주_3박4일.md
├── 2026-04-18_restaurant-review/
│   └── 2026-04-18__review__성수동_맛집.md
└── sample-post/                          ← 레포 기본 샘플
    └── 2026-04-16__sample__hello_naver_blog.md
```

- 폴더명은 자유입니다.
- 각 폴더에서 첫 번째로 발견된 `.md` 파일이 업로드됩니다.
- 파일명 권장 형식: `YYYY-MM-DD__카테고리__제목_키워드.md` (정렬/추적용, 필수는 아님)

### 마크다운 작성

```markdown
# 제주 3박 4일 후기

##첫째 날##

공항에 내리자마자 느낀 **제주의 바람**은 기대 이상이었습니다.
렌터카로 이동해 __협재 해수욕장__ 으로 직진, ==꼭 들러야 할 곳== 이었어요.

>>여행은 결국 함께한 사람의 기억으로 남는다<<

*작은 노트에 적어둔 문장이 오늘따라 떠올랐다.*
```

전체 문법은 [`docs/markup-guide.md`](./docs/markup-guide.md) 참고.

### 실행

```bash
npm start
```

여러 개 폴더가 있으면 순차 업로드, 각 업로드 사이에 `UPLOAD_DELAY` (기본 2초) 만큼 대기합니다.

---

## 마크업 문법 요약

| 마크업 | 결과 |
|---|---|
| `**텍스트**` | **굵게** |
| `__텍스트__` | <u>밑줄</u> |
| `*텍스트*` | *기울임* |
| `==텍스트==` | 노란 하이라이트 |
| `##텍스트##` | 소제목 (+ 구분선) |
| `>>텍스트<<` | 인용구 블록 |
| `**__텍스트__**` | **<u>굵게 + 밑줄</u>** |

전체 규칙과 예시: [`docs/markup-guide.md`](./docs/markup-guide.md)

---

## 환경 변수 전체 목록

| 변수 | 설명 | 기본값 |
|---|---|---|
| `NAVER_USERNAME` | 1번 계정 아이디 | **필수** |
| `NAVER_PASSWORD` | 1번 계정 비밀번호 | **필수** |
| `NAVER_USERNAME_2` ~ `_9` | 추가 계정 아이디 | — |
| `NAVER_PASSWORD_2` ~ `_9` | 추가 계정 비밀번호 | — |
| `NAVER_BLOG_URL` | 글쓰기 URL 커스텀 | `https://blog.naver.com/${USERNAME}?Redirect=Write&` |
| `NAVER_BLOG_URL_2` ~ `_9` | 추가 계정별 글쓰기 URL | 위 템플릿 자동 사용 |
| `BROWSER_HEADLESS` | `true` 면 브라우저 창 숨김 | `true` |
| `BROWSER_TIMEOUT` | 페이지 이동 타임아웃(ms) | `30000` |
| `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` | 브라우저 뷰포트 | `1920` / `1080` |
| `POSTS_PER_ACCOUNT` | 계정당 1회 실행 최대 글 수 | `7` |
| `UPLOAD_DELAY` | 업로드 간 대기(ms) | `2000` |
| `IMAGE_UPLOAD_TIMEOUT` | 이미지 업로드 타임아웃(ms) | `10000` |
| `LOG_DIR` | 로그 저장 경로 | `./logs` |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` | `info` |

---

## 멀티 계정

한 번에 여러 계정을 순회하며 글을 올릴 수 있습니다. `.env` 에 번호를 붙여 추가하세요.

```dotenv
NAVER_USERNAME=my_main_id
NAVER_PASSWORD=main_pw

NAVER_USERNAME_2=my_second_id
NAVER_PASSWORD_2=second_pw

NAVER_USERNAME_3=my_third_id
NAVER_PASSWORD_3=third_pw
```

동작 방식:
1. 계정 1로 로그인 → `POSTS_PER_ACCOUNT` 개까지 업로드
2. 로그아웃 → 계정 2로 전환 → 반복
3. 모든 계정 소진 또는 `files/ready/` 비면 종료

---

## 프로젝트 구조

```
naver-blog-uploader/
├── agent-blog-upload.js           # 메인 CLI (npm start)
├── src/
│   ├── index.js                   # 프로그래매틱 API (NaverLoginAutomation 클래스)
│   ├── config/
│   │   └── defaults.js            # 환경변수 기반 기본 설정
│   ├── services/
│   │   ├── NaverLoginService.js   # 로그인 자동화
│   │   ├── NaverBlogService.js    # 블로그 작성 (핵심)
│   │   ├── ImprovedNaverBlogService.js
│   │   ├── AutonomousAgent.js
│   │   └── AIVisionService.js
│   └── utils/
│       ├── selectors.js           # 네이버 DOM 셀렉터 (UI 변경 시 수정)
│       ├── logger.js              # 파일+콘솔 로거
│       ├── helpers.js             # sleep, getEnvVar 등
│       ├── errors.js              # 커스텀 에러 클래스
│       ├── pageUtils.js
│       └── waitUtils.js
├── examples/                      # 프로그래매틱 사용 예시
├── files/
│   ├── ready/                     # 업로드 대기 ← 여기에 글 넣기
│   │   └── sample-post/           # 레포 기본 샘플
│   └── done/                      # 업로드 완료 자동 이동
├── docs/
│   └── markup-guide.md            # 마크업 문법 전체
├── tests/                         # Playwright 테스트
├── .env.example                   # 환경변수 템플릿
├── CLAUDE.md                      # AI 에이전트 컨텍스트
└── README.md                      # 이 문서
```

---

## 문제 해결

### `npm install` 단계에서 Playwright 다운로드 실패
네트워크 상태나 방화벽 이슈일 가능성.
```bash
npx playwright install chromium
# 또는 프록시 뒤라면
HTTPS_PROXY=http://your-proxy:port npx playwright install chromium
```

### 로그인 페이지에서 멈춤 / 캡차 요구
- 네이버가 의심스러운 접속으로 판단한 경우입니다.
- `BROWSER_HEADLESS=false` 로 바꾸고 직접 눈으로 확인해보세요.
- 2단계 인증이 켜져 있다면 **끄거나**, 최초 1회 수동 로그인으로 디바이스를 등록하세요.
- 동일 IP에서 너무 잦은 자동 로그인은 일시 차단될 수 있습니다.

### 스마트에디터에서 본문이 입력되지 않음
네이버 UI 개편으로 셀렉터가 바뀌었을 가능성이 큽니다.
1. `src/utils/selectors.js` 열기
2. 브라우저 DevTools 로 실제 요소의 최신 셀렉터 확인
3. 해당 항목 업데이트
4. `tests/naver-blog.spec.js` 로 회귀 확인

### 이미지 삽입이 안 됨
현재 버전은 마크다운 `![alt](path)` 구문을 자동 업로드하지 않습니다.
스마트에디터의 이미지 툴바를 프로그래매틱하게 쓰려면
`src/services/NaverBlogService.js` 의 이미지 핸들러를 참고해 확장하세요.

### 에러 로그 확인
`logs/` 디렉토리에 서비스별 로그 파일이 생성됩니다.

---

## 주의사항 / 면책

> ⚠️ **사용 전 반드시 읽어주세요.**

- **네이버 이용약관**은 자동화 도구 사용을 제한합니다. 계정 제재 / 일시 차단 위험이 있으며 모든 책임은 **사용자 본인**에게 있습니다.
- 이 프로젝트는 **학습 / 개인 워크플로우 효율화** 목적으로 제공됩니다. 대량 스팸 / 어뷰징 / SEO 조작 용도는 **금지**합니다.
- 로그인 정보(`.env`)를 절대 공개 저장소, 공용 PC, AI 에이전트 채팅 로그 등에 남기지 마세요.
- 네이버 UI는 자주 바뀝니다. 셀렉터 수정이 필요한 경우 Issue / PR 환영합니다.

---

## 기여 / 라이선스

- 버그 리포트 / 셀렉터 업데이트 / 기능 제안 환영합니다. Issue 혹은 PR 을 남겨주세요.
- **MIT License** — `LICENSE` 파일 참조.
