# naver-blog-uploader

마크다운 파일을 네이버 블로그에 자동으로 올려주는 Playwright 기반 CLI 도구입니다.
특수 마크업(`**bold**`, `==highlight==`, `##소제목##` 등)을 네이버 스마트에디터의 서식으로 자동 변환해 업로드합니다.

## 주요 기능

- 네이버 로그인 자동화
- 마크다운 → 네이버 스마트에디터 서식 자동 변환
- 멀티 계정 지원 (계정당 글 개수 제한 자동 관리)
- 업로드 대기 / 완료 파일을 폴더 단위로 관리

## 지원하는 마크업

| 마크업 | 결과 |
|---|---|
| `**텍스트**` | **굵게** |
| `__텍스트__` | 밑줄 |
| `*텍스트*` | *기울임* |
| `==텍스트==` | 노란 하이라이트 |
| `##텍스트##` | 소제목 (+ 구분선) |
| `>>텍스트<<` | 인용구 블록 |
| `**__텍스트__**` | 굵게 + 밑줄 조합 |

자세한 규칙은 `docs/` 폴더의 마크업 가이드를 확인하세요.

## 요구 사항

- Node.js **18 이상**
- 네이버 계정 1개 이상
- 윈도우 / macOS / 리눅스 모두 동작 (Playwright Chromium 기준)

## 설치

```bash
git clone https://github.com/<your-username>/naver-blog-uploader.git
cd naver-blog-uploader
npm install        # Playwright Chromium이 자동 다운로드됩니다 (postinstall)
cp .env.example .env
```

`.env` 파일을 열어 네이버 아이디/비밀번호를 입력하세요.

```
NAVER_USERNAME=your_naver_id
NAVER_PASSWORD=your_naver_password
```

## 사용법

### 1. 마크다운 파일 준비

`files/ready/` 하위에 폴더를 만들고 그 안에 마크다운 파일을 넣어주세요.

```
files/ready/
└── my-batch/
    ├── 2026-04-16__여행후기_제주도.md
    └── 2026-04-16__맛집리뷰_성수동.md
```

파일명 권장 형식: `YYYY-MM-DD__제목_키워드.md`

### 2. 실행

```bash
npm start
```

또는 직접:

```bash
node agent-blog-upload.js
```

브라우저가 자동으로 열려 로그인부터 업로드까지 진행합니다.

## 프로젝트 구조

```
naver-blog-uploader/
├── agent-blog-upload.js      # 메인 실행 파일
├── src/
│   ├── index.js              # 프로그래매틱 API
│   ├── config/defaults.js    # 기본 설정
│   ├── services/             # Naver 로그인 / 블로그 작성 로직
│   └── utils/                # 로거, 셀렉터, 헬퍼
├── examples/                 # 사용 예시
├── files/
│   ├── ready/                # 업로드 대기 (여러분의 마크다운)
│   └── done/                 # 업로드 완료된 파일 이동
├── docs/                     # 마크업 작성 가이드
└── tests/                    # Playwright 테스트
```

## 환경 변수

필수 변수만 `.env.example` 참고해서 설정하면 됩니다. 고급 옵션:

| 변수 | 설명 | 기본값 |
|---|---|---|
| `NAVER_USERNAME` / `NAVER_PASSWORD` | 1번 계정 | 필수 |
| `NAVER_USERNAME_2` ~ `_9` | 추가 계정 (최대 9개) | — |
| `BROWSER_HEADLESS` | 브라우저 숨김 실행 | `true` |
| `BROWSER_TIMEOUT` | 네비게이션 타임아웃(ms) | `30000` |
| `POSTS_PER_ACCOUNT` | 계정당 최대 글 수 | `7` |
| `UPLOAD_DELAY` | 업로드 사이 대기(ms) | `2000` |

## 주의사항 / 면책

> ⚠️ **이 도구를 사용하기 전에 반드시 읽어주세요.**

- **네이버 이용약관**은 자동화 도구 사용을 제한할 수 있습니다. 계정 제재 위험이 있으며, 이로 인한 책임은 사용자 본인에게 있습니다.
- 이 프로젝트는 **학습 및 개인용**으로 제공됩니다. 상업적 대량 스팸 용도로의 사용을 금지합니다.
- 로그인 정보(`.env`)는 절대 공개 저장소에 커밋하지 마세요. `.gitignore`에 기본 포함되어 있습니다.
- 네이버 UI가 변경되면 셀렉터 수정이 필요할 수 있습니다 (`src/utils/selectors.js`).

## 기여

이슈/PR 환영합니다. 셀렉터 업데이트, 마크업 추가, 버그 리포트 모두 좋습니다.

## 라이선스

MIT — `LICENSE` 참고.
