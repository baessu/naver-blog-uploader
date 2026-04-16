import { ElementError, TimeoutError } from './errors.js';

/**
 * 페이지 유틸리티 클래스
 * Playwright 페이지 객체를 래핑하여 안전하고 편리한 메서드들을 제공
 */
export class PageUtils {
  constructor(page) {
    this.page = page;
  }

  /**
   * 현재 페이지 URL 반환
   */
  getCurrentUrl() {
    return this.page.url();
  }

  /**
   * 현재 페이지 제목 반환
   */
  async getCurrentTitle() {
    return await this.page.title();
  }

  /**
   * 요소가 표시되는지 확인
   * @param {string} selector - CSS 선택자
   * @param {number} timeout - 타임아웃 시간 (기본값: 5000ms)
   * @returns {Promise<boolean>} 요소가 표시되면 true, 아니면 false
   */
  async isElementVisible(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { 
        state: 'visible', 
        timeout 
      });
      return true;
    } catch (error) {
      // TimeoutError는 예상된 에러이므로 false 반환
      if (error.name === 'TimeoutError') {
        return false;
      }
      // 다른 에러는 재발생
      throw new ElementError(
        `요소 표시 확인 중 오류 발생: ${selector}`,
        selector,
        error
      );
    }
  }

  /**
   * 요소가 존재하는지 확인 (표시 여부와 무관)
   * @param {string} selector - CSS 선택자
   * @returns {Promise<boolean>} 요소가 존재하면 true, 아니면 false
   */
  async isElementPresent(selector) {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch (error) {
      throw new ElementError(
        `요소 존재 확인 중 오류 발생: ${selector}`,
        selector,
        error
      );
    }
  }

  /**
   * 요소가 클릭 가능한지 확인
   * @param {string} selector - CSS 선택자
   * @param {number} timeout - 타임아웃 시간 (기본값: 5000ms)
   * @returns {Promise<boolean>} 클릭 가능하면 true, 아니면 false
   */
  async isElementClickable(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { 
        state: 'visible', 
        timeout 
      });
      
      const element = await this.page.$(selector);
      if (!element) {
        return false;
      }
      
      const isEnabled = await element.isEnabled();
      const isVisible = await element.isVisible();
      
      return isEnabled && isVisible;
    } catch (error) {
      if (error.name === 'TimeoutError') {
        return false;
      }
      throw new ElementError(
        `요소 클릭 가능 확인 중 오류 발생: ${selector}`,
        selector,
        error
      );
    }
  }

  /**
   * 안전한 클릭 (요소 대기 후 클릭)
   * @param {string} selector - CSS 선택자
   * @param {Object} options - 클릭 옵션
   * @returns {Promise<boolean>} 클릭 성공 여부
   */
  async safeClick(selector, options = {}) {
    const { timeout = 30000, force = false } = options;
    
    try {
      // 요소가 표시될 때까지 대기
      await this.page.waitForSelector(selector, { 
        state: 'visible', 
        timeout 
      });
      
      // 클릭 가능한 상태까지 대기 (force가 false인 경우)
      if (!force) {
        await this.page.waitForSelector(selector, { 
          state: 'attached', 
          timeout: 5000 
        });
      }
      
      // 클릭 실행
      await this.page.click(selector, { force });
      
      return true;
    } catch (error) {
      throw new ElementError(
        `요소 클릭 중 오류 발생: ${selector}`,
        selector,
        error
      );
    }
  }

  /**
   * 안전한 텍스트 입력 (요소 대기 후 입력)
   * @param {string} selector - CSS 선택자
   * @param {string} text - 입력할 텍스트
   * @param {Object} options - 입력 옵션
   * @returns {Promise<boolean>} 입력 성공 여부
   */
  async safeType(selector, text, options = {}) {
    const { timeout = 30000, clearFirst = true } = options;
    
    try {
      // 요소가 표시될 때까지 대기
      await this.page.waitForSelector(selector, { 
        state: 'visible', 
        timeout 
      });
      
      // 기존 텍스트 클리어 (옵션에 따라)
      if (clearFirst) {
        await this.page.fill(selector, '');
      }
      
      // 텍스트 입력
      await this.page.type(selector, text, { delay: 50 });
      
      // 입력 완료 확인
      const inputValue = await this.page.inputValue(selector);
      const expectedText = clearFirst ? text : inputValue + text;
      
      if (inputValue !== expectedText) {
        console.warn(`입력값 불일치: 예상="${expectedText}", 실제="${inputValue}"`);
      }
      
      return true;
    } catch (error) {
      throw new ElementError(
        `텍스트 입력 중 오류 발생: ${selector}`,
        selector,
        error
      );
    }
  }

  /**
   * 여러 선택자 중 하나라도 나타날 때까지 대기
   * @param {string[]} selectors - CSS 선택자 배열
   * @param {number} timeout - 타임아웃 시간 (기본값: 30000ms)
   * @returns {Promise<string|null>} 첫 번째로 나타난 선택자, 실패 시 null
   */
  async waitForAnyElement(selectors, timeout = 30000) {
    try {
      const promises = selectors.map(selector =>
        this.page.waitForSelector(selector, { state: 'visible', timeout })
          .then(() => selector)
          .catch(() => null)
      );
      
      const results = await Promise.allSettled(promises);
      const foundSelector = results
        .find(result => result.status === 'fulfilled' && result.value)
        ?.value;
      
      return foundSelector || null;
    } catch (error) {
      throw new TimeoutError(
        `모든 선택자에 대해 타임아웃 발생: ${selectors.join(', ')}`,
        timeout,
        error
      );
    }
  }

  /**
   * 페이지 로딩 완료 대기
   * @param {number} timeout - 타임아웃 시간 (기본값: 30000ms)
   */
  async waitForPageLoad(timeout = 30000) {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout });
      await this.page.waitForLoadState('networkidle', { timeout: timeout / 2 });
    } catch (error) {
      throw new TimeoutError(
        '페이지 로딩 완료 대기 중 타임아웃 발생',
        timeout,
        error
      );
    }
  }

  /**
   * 스크린샷 캡처
   * @param {string|null} fileName - 파일명 (null이면 자동 생성)
   * @returns {Promise<string>} 저장된 파일 경로
   */
  async captureScreenshot(fileName = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const finalFileName = fileName || `screenshot-${timestamp}.png`;
      
      // screenshots 디렉토리가 없으면 생성
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const screenshotDir = './screenshots';
      try {
        await fs.access(screenshotDir);
      } catch {
        await fs.mkdir(screenshotDir, { recursive: true });
      }
      
      const filePath = path.join(screenshotDir, finalFileName);
      
      // 전체 페이지 스크린샷 캡처
      await this.page.screenshot({ 
        path: filePath, 
        fullPage: true 
      });
      
      console.log(`📸 스크린샷 저장됨: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`스크린샷 캡처 실패: ${error.message}`);
      
      // 스크린샷 실패 시 페이지의 버퍼라도 반환 시도
      try {
        const buffer = await this.page.screenshot({ fullPage: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const bufferFileName = `screenshot-buffer-${timestamp}.png`;
        
        // 버퍼를 파일로 저장
        const fs = await import('fs/promises');
        await fs.writeFile(`./screenshots/${bufferFileName}`, buffer);
        
        return `./screenshots/${bufferFileName}`;
      } catch (bufferError) {
        console.error(`스크린샷 버퍼 캡처도 실패: ${bufferError.message}`);
        return 'screenshot-failed';
      }
    }
  }
} 