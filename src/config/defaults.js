/**
 * 기본 설정값 (환경변수 오버라이드 가능)
 *
 * ⚠️ 민감한 정보(아이디/비밀번호)는 절대 여기 두지 마세요.
 *    반드시 .env 파일로 관리하세요.
 */

export const DEFAULT_BROWSER_CONFIG = {
  headless: process.env.BROWSER_HEADLESS !== 'false',
  defaultTimeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'),
  viewport: {
    width: parseInt(process.env.VIEWPORT_WIDTH || '1920'),
    height: parseInt(process.env.VIEWPORT_HEIGHT || '1080'),
  },
  userAgent: process.env.USER_AGENT,
};

export const DEFAULT_NAVER_BLOG_CONFIG = {
  accounts: buildAccountsFromEnv(),
  blog: {
    postsPerAccount: parseInt(process.env.POSTS_PER_ACCOUNT || '7'),
    uploadDelay: parseInt(process.env.UPLOAD_DELAY || '2000'),
    saveButtonSelectors: [
      'button.save_btn__bzc5B',
      '.save_btn',
      '[data-testid="save-button"]',
      'button[type="submit"]',
    ],
    imageUploadTimeout: parseInt(process.env.IMAGE_UPLOAD_TIMEOUT || '10000'),
  },
  selectors: {
    saveButton: [
      'button.save_btn__bzc5B',
      '.save_btn',
      '[data-testid="save-button"]',
      'button[type="submit"]',
    ],
    titleInput: '#post-title-inp',
    contentEditor: '.se-content',
    imageUploadButton: '.se-image-toolbar-button',
    categorySelect: '#category-select',
  },
};

/**
 * 환경변수에서 네이버 계정을 읽어옴.
 * 단일 계정: NAVER_USERNAME, NAVER_PASSWORD
 * 추가 계정: NAVER_USERNAME_2, NAVER_PASSWORD_2, ... NAVER_USERNAME_9 까지 자동 인식
 */
function buildAccountsFromEnv() {
  const accounts = [];

  if (process.env.NAVER_USERNAME && process.env.NAVER_PASSWORD) {
    accounts.push({
      username: process.env.NAVER_USERNAME,
      password: process.env.NAVER_PASSWORD,
    });
  }

  for (let i = 2; i <= 9; i++) {
    const user = process.env[`NAVER_USERNAME_${i}`];
    const pass = process.env[`NAVER_PASSWORD_${i}`];
    if (user && pass) {
      accounts.push({ username: user, password: pass });
    }
  }

  return accounts;
}
