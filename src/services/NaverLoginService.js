import { LoginError, NavigationError, ValidationError } from '../utils/errors.js';
import { NaverSelectors } from '../utils/selectors.js';
import { PageUtils } from '../utils/pageUtils.js';

/**
 * 네이버 로그인 서비스 클래스
 * 네이버 로그인 프로세스를 관리하는 단일 책임 클래스
 */
export class NaverLoginService {
  constructor(page) {
    this.page = page;
    this.selectors = NaverSelectors;
    this.pageUtils = new PageUtils(page);
  }

  /**
   * 네이버 로그인 프로세스 실행
   * @param {string} userId - 네이버 아이디
   * @param {string} password - 네이버 비밀번호
   * @param {Object} options - 로그인 옵션
   * @param {number} options.timeout - 타임아웃 시간 (기본값: 30000ms)
   * @param {boolean} options.waitForNavigation - 네비게이션 대기 여부 (기본값: true)
   * @returns {Promise<boolean>} 로그인 성공 여부
   * @throws {ValidationError} 입력값 검증 실패 시
   * @throws {NavigationError} 페이지 네비게이션 실패 시
   * @throws {LoginError} 로그인 프로세스 실패 시
   */
  async login(userId, password, options = {}) {
    const { timeout = 30000, waitForNavigation = true } = options;

    try {
      // 1. 입력값 검증
      this._validateLoginCredentials(userId, password);

      // 2. 네이버 로그인 페이지로 이동
      await this._navigateToLoginPage(timeout);

      // 3. 로그인 폼 대기 및 검증
      await this._waitForLoginForm(timeout);

      // 4. 자격 증명 입력
      await this._enterCredentials(userId, password);

      // 5. 로그인 버튼 클릭
      await this._clickLoginButton();

      // 6. 로그인 완료 대기 (선택적)
      if (waitForNavigation) {
        await this._waitForLoginCompletion(timeout);
      }

      // 7. 로그인 성공 검증
      return await this._verifyLoginSuccess();

    } catch (error) {
      // 에러 컨텍스트 추가 및 재발생
      if (error instanceof LoginError || 
          error instanceof NavigationError || 
          error instanceof ValidationError) {
        throw error;
      }
      
      throw new LoginError(
        `네이버 로그인 중 예상치 못한 오류가 발생했습니다: ${error.message}`,
        error
      );
    }
  }

  /**
   * 로그인 자격 증명 검증
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} password - 비밀번호
   * @throws {ValidationError} 검증 실패 시
   */
  _validateLoginCredentials(userId, password) {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new ValidationError('유효한 네이버 아이디를 입력해주세요.');
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
      throw new ValidationError('유효한 비밀번호를 입력해주세요.');
    }
  }

  /**
   * 네이버 로그인 페이지로 이동
   * @private
   * @param {number} timeout - 타임아웃 시간
   * @throws {NavigationError} 네비게이션 실패 시
   */
  async _navigateToLoginPage(timeout) {
    try {
      await this.page.goto('https://nid.naver.com/nidlogin.login', {
        waitUntil: 'domcontentloaded',
        timeout
      });
    } catch (error) {
      throw new NavigationError(
        '네이버 로그인 페이지로 이동하는데 실패했습니다.',
        error
      );
    }
  }

  /**
   * 로그인 폼 대기 및 검증
   * @private
   * @param {number} timeout - 타임아웃 시간
   * @throws {LoginError} 로그인 폼을 찾을 수 없는 경우
   */
  async _waitForLoginForm(timeout) {
    try {
      await this.page.waitForSelector(this.selectors.loginForm, { timeout });
      
      // 필수 입력 요소들이 존재하는지 확인
      const isIdInputVisible = await this.pageUtils.isElementVisible(this.selectors.idInput);
      const isPasswordInputVisible = await this.pageUtils.isElementVisible(this.selectors.passwordInput);
      
      if (!isIdInputVisible || !isPasswordInputVisible) {
        throw new LoginError('로그인 폼의 필수 요소를 찾을 수 없습니다.');
      }
    } catch (error) {
      if (error instanceof LoginError) {
        throw error;
      }
      throw new LoginError('로그인 폼을 로드하는데 실패했습니다.', error);
    }
  }

  /**
   * 자격 증명 입력
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} password - 비밀번호
   * @throws {LoginError} 자격 증명 입력 실패 시
   */
  async _enterCredentials(userId, password) {
    try {
      // 기존 값 클리어 후 입력
      await this.page.fill(this.selectors.idInput, '');
      await this.page.fill(this.selectors.idInput, userId);
      
      await this.page.fill(this.selectors.passwordInput, '');
      await this.page.fill(this.selectors.passwordInput, password);

      // 입력값 검증
      const enteredId = await this.page.inputValue(this.selectors.idInput);
      const enteredPassword = await this.page.inputValue(this.selectors.passwordInput);

      if (enteredId !== userId) {
        throw new LoginError('아이디 입력이 올바르게 처리되지 않았습니다.');
      }

      if (enteredPassword !== password) {
        throw new LoginError('비밀번호 입력이 올바르게 처리되지 않았습니다.');
      }

    } catch (error) {
      if (error instanceof LoginError) {
        throw error;
      }
      throw new LoginError('로그인 정보 입력 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 로그인 버튼 클릭
   * @private
   * @throws {LoginError} 로그인 버튼 클릭 실패 시
   */
  async _clickLoginButton() {
    try {
      // 로그인 버튼이 클릭 가능한 상태인지 확인
      await this.page.waitForSelector(this.selectors.loginButton, { 
        state: 'visible' 
      });

      const isButtonEnabled = await this.page.isEnabled(this.selectors.loginButton);
      if (!isButtonEnabled) {
        throw new LoginError('로그인 버튼이 비활성화 상태입니다.');
      }

      await this.page.click(this.selectors.loginButton);
    } catch (error) {
      if (error instanceof LoginError) {
        throw error;
      }
      throw new LoginError('로그인 버튼 클릭 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 로그인 완료 대기
   * @private
   * @param {number} timeout - 타임아웃 시간
   * @throws {LoginError} 로그인 완료 대기 실패 시
   */
  async _waitForLoginCompletion(timeout) {
    try {
      // URL 변경 또는 특정 요소 출현을 대기
      await Promise.race([
        this.page.waitForURL(/.*naver\.com.*/, { timeout }),
        this.page.waitForSelector(this.selectors.profileArea, { timeout }).catch(() => null)
      ]);
    } catch (error) {
      throw new LoginError('로그인 완료를 확인하는데 시간이 초과되었습니다.', error);
    }
  }

  /**
   * 로그인 성공 검증
   * @private
   * @returns {Promise<boolean>} 로그인 성공 여부
   */
  async _verifyLoginSuccess() {
    try {
      // 현재 URL 확인
      const currentUrl = this.page.url();
      
      // 로그인 에러 메시지 확인
      const hasErrorMessage = await this.pageUtils.isElementVisible(this.selectors.errorMessage);
      if (hasErrorMessage) {
        const errorText = await this.page.textContent(this.selectors.errorMessage);
        throw new LoginError(`로그인 실패: ${errorText}`);
      }

      // 로그인 성공 지표 확인
      const isLoggedIn = currentUrl.includes('naver.com') && !currentUrl.includes('nidlogin');
      
      return isLoggedIn;
    } catch (error) {
      if (error instanceof LoginError) {
        throw error;
      }
      throw new LoginError('로그인 성공 여부를 확인하는데 실패했습니다.', error);
    }
  }
} 