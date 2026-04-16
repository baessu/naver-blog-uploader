import { test, expect } from '@playwright/test';
import { NaverLoginService } from '../src/services/NaverLoginService.js';
import { LoginError, ValidationError, NavigationError } from '../src/utils/errors.js';

/**
 * 네이버 로그인 테스트 스위트
 * 다양한 시나리오에서 로그인 기능을 검증
 */
test.describe('네이버 로그인 자동화 테스트', () => {
  let loginService;

  test.beforeEach(async ({ page }) => {
    // 각 테스트마다 새로운 LoginService 인스턴스 생성
    loginService = new NaverLoginService(page);
    
    // 페이지 설정
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  });

  test.describe('입력값 검증 테스트', () => {
    test('유효하지 않은 사용자 ID - 빈 문자열', async () => {
      await expect(
        loginService.login('', 'validpassword')
      ).rejects.toThrow(ValidationError);
    });

    test('유효하지 않은 사용자 ID - null', async () => {
      await expect(
        loginService.login(null, 'validpassword')
      ).rejects.toThrow(ValidationError);
    });

    test('유효하지 않은 사용자 ID - 공백만 포함', async () => {
      await expect(
        loginService.login('   ', 'validpassword')
      ).rejects.toThrow(ValidationError);
    });

    test('유효하지 않은 비밀번호 - 빈 문자열', async () => {
      await expect(
        loginService.login('validuser', '')
      ).rejects.toThrow(ValidationError);
    });

    test('유효하지 않은 비밀번호 - null', async () => {
      await expect(
        loginService.login('validuser', null)
      ).rejects.toThrow(ValidationError);
    });
  });

  test.describe('페이지 네비게이션 테스트', () => {
    test('네이버 로그인 페이지 접근 성공', async ({ page }) => {
      // 네이버 로그인 페이지로 직접 이동
      await page.goto('https://nid.naver.com/nidlogin.login', {
        waitUntil: 'domcontentloaded'
      });

      // 로그인 폼이 로드되었는지 확인
      await expect(page.locator('#frmNIDLogin')).toBeVisible();
      await expect(page.locator('#id')).toBeVisible();
      await expect(page.locator('#pw')).toBeVisible();
      await expect(page.locator('#log\\.login')).toBeVisible();
    });

    test('네이버 로그인 페이지 타이틀 확인', async ({ page }) => {
      await page.goto('https://nid.naver.com/nidlogin.login');
      await expect(page).toHaveTitle(/네이버.*로그인/);
    });
  });

  test.describe('실제 로그인 테스트 (환경변수 필요)', () => {
    test.skip(({ }, testInfo) => {
      // 환경변수가 설정되지 않은 경우 테스트 스킵
      if (!process.env.NAVER_ID || !process.env.NAVER_PASSWORD) {
        testInfo.skip();
      }
    }, '실제 로그인 정보가 환경변수에 설정되지 않음');

    test('정상적인 로그인 시나리오', async () => {
      const userId = process.env.NAVER_ID;
      const password = process.env.NAVER_PASSWORD;

      if (!userId || !password) {
        test.skip('환경변수 NAVER_ID, NAVER_PASSWORD가 설정되지 않음');
      }

      const result = await loginService.login(userId, password);
      expect(result).toBe(true);
    });

    test('잘못된 비밀번호로 로그인 시도', async ({ page }) => {
      const userId = process.env.NAVER_ID;
      
      if (!userId) {
        test.skip('환경변수 NAVER_ID가 설정되지 않음');
      }

      await expect(
        loginService.login(userId, 'wrong_password')
      ).rejects.toThrow(LoginError);
    });
  });

  test.describe('로그인 폼 상호작용 테스트', () => {
    test('로그인 폼 요소들과의 상호작용', async ({ page }) => {
      await page.goto('https://nid.naver.com/nidlogin.login');

      // ID 입력 필드 테스트
      const idInput = page.locator('#id');
      await idInput.fill('test_user');
      await expect(idInput).toHaveValue('test_user');

      // 비밀번호 입력 필드 테스트
      const passwordInput = page.locator('#pw');
      await passwordInput.fill('test_password');
      await expect(passwordInput).toHaveValue('test_password');

      // 로그인 버튼 존재 확인
      const loginButton = page.locator('#log\\.login');
      await expect(loginButton).toBeVisible();
      await expect(loginButton).toBeEnabled();
    });

    test('자동 로그인 체크박스 확인', async ({ page }) => {
      await page.goto('https://nid.naver.com/nidlogin.login');

      const keepLoginCheckbox = page.locator('#keep');
      if (await keepLoginCheckbox.isVisible()) {
        await expect(keepLoginCheckbox).toBeVisible();
        
        // 체크박스 토글 테스트
        await keepLoginCheckbox.check();
        await expect(keepLoginCheckbox).toBeChecked();
        
        await keepLoginCheckbox.uncheck();
        await expect(keepLoginCheckbox).not.toBeChecked();
      }
    });
  });

  test.describe('에러 처리 테스트', () => {
    test('네트워크 오류 시나리오', async ({ page }) => {
      // 네트워크를 차단하여 네비게이션 에러 유발
      await page.route('**/*', route => route.abort());

      await expect(
        loginService.login('testuser', 'testpass')
      ).rejects.toThrow(NavigationError);
    });

    test('타임아웃 설정 테스트', async ({ page }) => {
      // 매우 짧은 타임아웃 설정으로 타임아웃 에러 유발
      await expect(
        loginService.login('testuser', 'testpass', { timeout: 1 })
      ).rejects.toThrow(/timeout|시간/);
    });
  });

  test.describe('브라우저 호환성 테스트', () => {
    test('Chromium에서 네이버 로그인 페이지 로드', async ({ page }) => {
      await page.goto('https://nid.naver.com/nidlogin.login');
      
      // 기본 요소들이 모두 로드되었는지 확인
      await expect(page.locator('#frmNIDLogin')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#id')).toBeVisible();
      await expect(page.locator('#pw')).toBeVisible();
    });

    test('반응형 레이아웃 테스트', async ({ page }) => {
      // 모바일 뷰포트로 설정
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('https://nid.naver.com/nidlogin.login');

      // 모바일에서도 로그인 폼이 제대로 보이는지 확인
      await expect(page.locator('#frmNIDLogin')).toBeVisible();
    });
  });

  test.describe('성능 테스트', () => {
    test('페이지 로딩 성능 측정', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('https://nid.naver.com/nidlogin.login', {
        waitUntil: 'networkidle'
      });
      
      const loadTime = Date.now() - startTime;
      
      // 페이지 로딩이 10초 이내에 완료되어야 함
      expect(loadTime).toBeLessThan(10000);
      
      console.log(`페이지 로딩 시간: ${loadTime}ms`);
    });
  });
}); 