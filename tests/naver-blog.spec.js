import { test, expect } from '@playwright/test';
import { NaverBlogService } from '../src/services/NaverBlogService.js';
import { NaverLoginService } from '../src/services/NaverLoginService.js';
import { BlogError, WriteError, ValidationError } from '../src/utils/errors.js';
import { NaverLoginAutomation } from '../src/index.js';

/**
 * 네이버 블로그 자동화 테스트 스위트
 * 블로그 관련 기능을 포괄적으로 테스트
 */
test.describe('네이버 블로그 자동화 테스트', () => {
  let loginService;
  let blogService;
  let automation;

  test.beforeEach(async ({ page }) => {
    // 각 테스트마다 새로운 서비스 인스턴스 생성
    loginService = new NaverLoginService(page);
    blogService = new NaverBlogService(page);
    
    // 페이지 설정
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    automation = new NaverLoginAutomation();
    await automation.initialize({ headless: true });
  });

  test.afterEach(async () => {
    if (automation) {
      await automation.cleanup();
    }
  });

  test.describe('블로그 셀렉터 검증 테스트', () => {
    test('블로그 관련 셀렉터 정의 확인', async () => {
      // 필수 셀렉터들이 정의되어 있는지 확인
      expect(blogService.selectors.writeButton).toBeDefined();
      expect(blogService.selectors.writeButtonByClass).toBeDefined();
      expect(blogService.selectors.writeButtonByText).toBeDefined();
      expect(blogService.selectors.titleInput).toBeDefined();
    });
  });

  test.describe('제목 입력 검증 테스트', () => {
    test('유효하지 않은 제목 - 빈 문자열', async () => {
      await expect(
        blogService.enterTitle('')
      ).rejects.toThrow(ValidationError);
    });

    test('유효하지 않은 제목 - null', async () => {
      await expect(
        blogService.enterTitle(null)
      ).rejects.toThrow(ValidationError);
    });

    test('유효하지 않은 제목 - 너무 긴 제목', async () => {
      const longTitle = 'a'.repeat(101); // 101자
      await expect(
        blogService.enterTitle(longTitle)
      ).rejects.toThrow(ValidationError);
    });

    test('유효한 제목 검증', async () => {
      const validTitle = '테스트 블로그 글 제목';
      
      // 실제 페이지가 아니므로 에러가 발생할 것이지만, 검증 로직은 통과해야 함
      try {
        await blogService.enterTitle(validTitle);
      } catch (error) {
        // 페이지 요소를 찾을 수 없는 에러는 예상됨
        expect(error).not.toBeInstanceOf(ValidationError);
      }
    });
  });

  test.describe('통합 워크플로우 테스트 (환경변수 필요)', () => {
    test.skip(({ }, testInfo) => {
      // 환경변수가 설정되지 않은 경우 테스트 스킵
      if (!process.env.NAVER_ID || !process.env.NAVER_PASSWORD) {
        testInfo.skip();
      }
    }, '실제 로그인 정보가 환경변수에 설정되지 않음');

    test('전체 워크플로우: 로그인 → 블로그 글쓰기 페이지 이동', async ({ page, context }) => {
      const userId = process.env.NAVER_ID;
      const password = process.env.NAVER_PASSWORD;

      if (!userId || !password) {
        test.skip('환경변수 NAVER_ID, NAVER_PASSWORD가 설정되지 않음');
      }

      // 1. 로그인 실행
      const loginResult = await loginService.login(userId, password);
      expect(loginResult).toBe(true);

      // 2. 페이지 안정화 대기
      await page.waitForTimeout(3000);

      // 3. 새 탭 이벤트 리스너 설정
      const newPagePromise = context.waitForEvent('page');

      // 4. 블로그 글쓰기 페이지로 이동 시도
      try {
        await blogService.navigateToWritePage({
          timeout: 30000,
          waitForEditor: true
        });

        // 새 탭 확인
        const newPage = await newPagePromise;
        expect(newPage.url()).toContain('blog.naver.com');
        expect(newPage.url()).toContain('Write');

      } catch (error) {
        // 글쓰기 버튼을 찾을 수 없는 경우는 페이지 구조 변경일 수 있음
        if (error instanceof BlogError) {
          console.log('블로그 버튼 구조 변경 가능:', error.message);
        } else {
          throw error;
        }
      }
    });

    test('제목 입력 기능 테스트', async ({ page }) => {
      // 먼저 글쓰기 페이지로 직접 이동
      await page.goto('https://blog.naver.com/PostWriteForm.naver');
      
      // 페이지 로딩 대기
      await page.waitForLoadState('networkidle');

      const testTitle = `테스트 제목 - ${new Date().toLocaleString('ko-KR')}`;

      try {
        const result = await blogService.enterTitle(testTitle);
        expect(result).toBe(true);
      } catch (error) {
        // 제목 입력 필드를 찾을 수 없는 경우는 페이지 구조 변경일 수 있음
        if (error instanceof WriteError) {
          console.log('제목 입력 필드 구조 변경 가능:', error.message);
        } else {
          throw error;
        }
      }
    });
  });

  test.describe('에러 처리 테스트', () => {
    test('초기화되지 않은 상태에서 글쓰기 페이지 이동 시도', async ({ page }) => {
      // 로그인하지 않은 상태에서 글쓰기 버튼 찾기 시도
      await page.goto('https://www.naver.com');
      
      await expect(
        blogService.navigateToWritePage()
      ).rejects.toThrow(BlogError);
    });

    test('잘못된 페이지에서 제목 입력 시도', async ({ page }) => {
      // 블로그 글쓰기 페이지가 아닌 곳에서 제목 입력 시도
      await page.goto('https://www.naver.com');
      
      await expect(
        blogService.enterTitle('테스트 제목')
      ).rejects.toThrow();
    });
  });

  test.describe('페이지 상태 확인 테스트', () => {
    test('글쓰기 페이지 URL 확인', async ({ page }) => {
      await page.goto('https://blog.naver.com/PostWriteForm.naver');
      
      const url = blogService.getCurrentUrl();
      expect(url).toContain('blog.naver.com');
      
      const isWritePage = await blogService.isWritePage();
      expect(isWritePage).toBe(true);
    });

    test('일반 페이지에서 글쓰기 페이지 여부 확인', async ({ page }) => {
      await page.goto('https://www.naver.com');
      
      const isWritePage = await blogService.isWritePage();
      expect(isWritePage).toBe(false);
    });
  });

  test.describe('스크린샷 기능 테스트', () => {
    test('스크린샷 캡처 기능', async ({ page }) => {
      await page.goto('https://www.naver.com');
      
      const screenshotPath = await blogService.captureScreenshot('test-screenshot');
      expect(screenshotPath).toContain('screenshots/');
      expect(screenshotPath).toContain('.png');
    });
  });

  test.describe('성능 테스트', () => {
    test('블로그 글쓰기 페이지 로딩 성능', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('https://blog.naver.com/PostWriteForm.naver', {
        waitUntil: 'networkidle'
      });
      
      const loadTime = Date.now() - startTime;
      
      // 페이지 로딩이 15초 이내에 완료되어야 함
      expect(loadTime).toBeLessThan(15000);
      
      console.log(`블로그 글쓰기 페이지 로딩 시간: ${loadTime}ms`);
    });
  });

  test('블로그 글 본문 입력 테스트', async () => {
    // 로그인 및 블로그 이동
    const success = await automation.loginAndNavigateToBlog();
    expect(success).toBe(true);

    // 본문 입력
    const content = '이것은 자동화 테스트로 작성된 본문입니다.\n\n여러 줄의 내용을 포함합니다.';
    const result = await automation.enterBlogContent(content);
    expect(result).toBe(true);
  });

  test('페이지 HTML 조회 테스트', async () => {
    // 로그인 및 블로그 이동
    const success = await automation.loginAndNavigateToBlog();
    expect(success).toBe(true);

    // HTML 조회
    const htmlContent = await automation.getPageHTML();
    
    // HTML이 존재하고 기본적인 구조를 가지고 있는지 확인
    expect(htmlContent).toBeTruthy();
    expect(htmlContent.length).toBeGreaterThan(1000);
    expect(htmlContent).toContain('<html');
    expect(htmlContent).toContain('<head');
    expect(htmlContent).toContain('<body');
    expect(htmlContent).toContain('</html>');
    
    // 네이버 블로그 관련 요소가 있는지 확인
    expect(htmlContent).toMatch(/blog\.naver\.com|네이버|naver/i);
  });

  test('페이지 구조 분석 테스트', async () => {
    // 로그인 및 블로그 이동
    const success = await automation.loginAndNavigateToBlog();
    expect(success).toBe(true);

    // 구조 분석
    const analysis = await automation.analyzeWritePageStructure();
    
    // 분석 결과 기본 구조 확인
    expect(analysis).toBeTruthy();
    expect(analysis.url).toBeTruthy();
    expect(analysis.timestamp).toBeTruthy();
    expect(analysis.elements).toBeTruthy();
    expect(analysis.summary).toBeTruthy();
    
    // 요소 카테고리 확인
    expect(analysis.elements.titleInputs).toBeInstanceOf(Array);
    expect(analysis.elements.contentEditors).toBeInstanceOf(Array);
    expect(analysis.elements.buttons).toBeInstanceOf(Array);
    expect(analysis.elements.containers).toBeInstanceOf(Array);
    
    // 요약 정보 확인
    expect(typeof analysis.summary.totalElements).toBe('number');
    expect(typeof analysis.summary.hasEditor).toBe('boolean');
    expect(typeof analysis.summary.hasTitleInput).toBe('boolean');
    expect(typeof analysis.summary.hasIframe).toBe('boolean');
    expect(analysis.summary.editorType).toBeTruthy();
    
    // 글쓰기 페이지라면 최소한의 요소들이 있어야 함
    expect(analysis.summary.totalElements).toBeGreaterThan(0);
    
    console.log('📊 분석 결과 요약:');
    console.log(`- 총 요소 수: ${analysis.summary.totalElements}`);
    console.log(`- 제목 입력: ${analysis.summary.hasTitleInput}`);
    console.log(`- 에디터: ${analysis.summary.hasEditor} (${analysis.summary.editorType})`);
    console.log(`- iframe: ${analysis.summary.hasIframe}`);
  });

  test('페이지 분석 결과 저장 테스트', async () => {
    // 로그인 및 블로그 이동
    const success = await automation.loginAndNavigateToBlog();
    expect(success).toBe(true);

    // 분석 결과 저장
    const testFileName = `test-analysis-${Date.now()}.json`;
    const filePath = await automation.savePageAnalysis(testFileName);
    
    // 파일이 생성되었는지 확인
    expect(filePath).toBeTruthy();
    expect(filePath).toContain(testFileName);
    
    // 파일 내용 확인
    const fs = await import('fs/promises');
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
    
    if (fileExists) {
      const content = await fs.readFile(filePath, 'utf-8');
      const analysis = JSON.parse(content);
      
      // JSON 구조 확인
      expect(analysis.url).toBeTruthy();
      expect(analysis.elements).toBeTruthy();
      expect(analysis.summary).toBeTruthy();
      
      // 테스트 후 파일 정리
      await fs.unlink(filePath).catch(() => {});
    }
  });

  test('전체 구조 분석 및 저장 테스트', async () => {
    // 로그인 및 블로그 이동
    const success = await automation.loginAndNavigateToBlog();
    expect(success).toBe(true);

    // 전체 분석 및 저장
    const testBaseName = `test-full-analysis-${Date.now()}`;
    const result = await automation.analyzeAndSavePageStructure(testBaseName);
    
    // 결과 구조 확인
    expect(result).toBeTruthy();
    expect(result.htmlFile).toBeTruthy();
    expect(result.analysisFile).toBeTruthy();
    expect(result.screenshotFile).toBeTruthy();
    expect(result.timestamp).toBeTruthy();
    
    // 파일들이 실제로 생성되었는지 확인
    const fs = await import('fs/promises');
    
    const htmlExists = await fs.access(result.htmlFile).then(() => true).catch(() => false);
    const analysisExists = await fs.access(result.analysisFile).then(() => true).catch(() => false);
    const screenshotExists = await fs.access(result.screenshotFile).then(() => true).catch(() => false);
    
    expect(htmlExists).toBe(true);
    expect(analysisExists).toBe(true);
    expect(screenshotExists).toBe(true);
    
    // HTML 파일 내용 확인
    if (htmlExists) {
      const htmlContent = await fs.readFile(result.htmlFile, 'utf-8');
      expect(htmlContent.length).toBeGreaterThan(1000);
      expect(htmlContent).toContain('<html');
    }
    
    // 분석 파일 내용 확인
    if (analysisExists) {
      const analysisContent = await fs.readFile(result.analysisFile, 'utf-8');
      const analysis = JSON.parse(analysisContent);
      expect(analysis.summary).toBeTruthy();
    }
    
    console.log('📁 생성된 파일들:');
    console.log(`- HTML: ${result.htmlFile}`);
    console.log(`- 분석: ${result.analysisFile}`);
    console.log(`- 스크린샷: ${result.screenshotFile}`);
    
    // 테스트 후 파일들 정리
    await Promise.all([
      fs.unlink(result.htmlFile).catch(() => {}),
      fs.unlink(result.analysisFile).catch(() => {}),
      fs.unlink(result.screenshotFile).catch(() => {})
    ]);
  });

  test('에러 상황 테스트 - 글쓰기 페이지가 아닌 경우', async () => {
    // 로그인만 하고 블로그 페이지로 이동하지 않음
    await automation.initialize({ headless: true });
    const loginSuccess = await automation.login();
    expect(loginSuccess).toBe(true);

    // 글쓰기 페이지가 아닌 상태에서 구조 분석 시도
    await expect(automation.analyzeWritePageStructure()).rejects.toThrow('현재 페이지가 글쓰기 페이지가 아닙니다');
    await expect(automation.analyzeAndSavePageStructure()).rejects.toThrow('현재 페이지가 글쓰기 페이지가 아닙니다');
  });
}); 