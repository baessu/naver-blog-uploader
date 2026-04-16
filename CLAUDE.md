# CLAUDE.md

이 파일은 Claude Code(또는 Cursor, Windsurf 등 다른 AI 코딩 에이전트)가
이 레포를 다룰 때 참고하는 컨텍스트입니다.

## 프로젝트 한 줄 요약

마크다운 파일 → 네이버 블로그 자동 업로드 (Playwright + Chromium).

## 실행 전제

- **Node.js 18+**, npm
- **네이버 계정** (자동화 정책상 개인 책임)
- Playwright Chromium (`npm install` 시 `postinstall` 훅으로 자동 다운로드)

## 핵심 엔트리포인트

| 경로 | 역할 |
|---|---|
| `agent-blog-upload.js` | 메인 실행 스크립트 (`npm start`) |
| `src/index.js` | 프로그래매틱 API (클래스 `NaverLoginAutomation`) |
| `src/services/NaverLoginService.js` | 네이버 로그인 자동화 |
| `src/services/NaverBlogService.js` | 블로그 글쓰기 (셀렉터 포함) |
| `src/utils/selectors.js` | 네이버 DOM 셀렉터 모음 — UI 변경 시 여기부터 수정 |
| `src/config/defaults.js` | 환경변수 기반 기본 설정 |

## 폴더 규약

```
files/
├── ready/                # 업로드 대기. 폴더 단위로 1포스트
│   └── <아무폴더명>/
│       └── <아무이름>.md   # 첫 발견 .md 파일만 사용
├── done/                 # 업로드 완료 시 자동 이동
└── ready/sample-post/    # 레포에 포함된 테스트용 샘플
```

- 업로더는 `files/ready/` 하위 **서브폴더**를 순회합니다.
- 각 서브폴더에서 첫 번째 `.md` 파일을 찾아 업로드합니다.
- 제목은 `.md` 파일 첫 줄의 `# 제목` 또는 `##제목##` 에서 추출합니다.

## 절대 하지 말 것 (AI 에이전트 주의사항)

1. **실제 네이버 아이디/비밀번호를 코드에 하드코딩하지 말 것.**
   자격증명은 반드시 `.env` 로만 관리. v0.1.0 에서 과거의 하드코딩 사례를 모두 제거했으니
   재도입하지 말 것.
2. **`.env` 를 커밋하지 말 것.** `.gitignore` 에 이미 포함되어 있음.
3. **개인 블로그 URL/사용자명을 하드코딩하지 말 것.** `src/config/defaults.js` 의
   `buildAccountsFromEnv()` 패턴을 유지하고, 블로그 URL이 필요하면
   `https://blog.naver.com/${username}?Redirect=Write&` 템플릿을 쓰세요.
4. **네이버 UI 셀렉터는 `src/utils/selectors.js` 한 곳에서만 관리.** 서비스 파일에
   셀렉터를 분산시키지 말 것.
5. **자동화 악용 금지.** 대량 스팸, 어뷰징 용도의 개조·배포는 거부하세요.
   이 도구는 개인 콘텐츠 발행 효율화가 목적입니다.

## 자주 요청되는 작업과 접근법

### "설치해서 테스트해줘"
```bash
npm install
cp .env.example .env
# .env 편집 (NAVER_USERNAME, NAVER_PASSWORD)
npm start
```
기본적으로 `files/ready/sample-post/` 가 먼저 업로드됩니다. 계정이 없는 환경에서는
로그인 단계에서 실패하는 게 정상입니다 (dry-run 모드 없음).

### "UI 셀렉터가 안 먹혀요"
네이버가 스마트에디터를 개편했을 가능성이 큽니다.
1. `src/utils/selectors.js` 에서 해당 셀렉터 찾기
2. 실제 브라우저에서 DevTools로 새 셀렉터 확보
3. 업데이트 후 `tests/naver-blog.spec.js` 로 회귀 확인

### "멀티 계정 쓰고 싶어요"
`.env` 에 `NAVER_USERNAME_2=...`, `NAVER_PASSWORD_2=...` 추가. 최대 9번까지 자동 인식.
`POSTS_PER_ACCOUNT` 로 계정당 상한 조절(기본 7).

### "마크업 문법이 기억 안 나요"
`docs/markup-guide.md` 참고. 요약: `**굵게**`, `__밑줄__`, `==형광펜==`,
`##소제목##`, `>>인용<<`, `*이탤릭*`.

## 알려진 한계

- 이미지(`![]()`) 구문은 아직 지원 안 됨. 스마트에디터 이미지 업로드는 별도 API 필요.
- 네이버 2단계 인증이 활성화된 계정은 자동 로그인이 중단될 수 있음 (OTP/기기 등록 필요).
- 헤드리스(`BROWSER_HEADLESS=true`) 모드에서 드물게 봇 탐지가 걸릴 수 있음 → 실패 시 `false` 로.

## 참고 파일

- `README.md` — 사람용 설치/사용 가이드
- `docs/markup-guide.md` — 마크업 문법 레퍼런스
- `.env.example` — 환경변수 템플릿
