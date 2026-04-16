import { BlogError, WriteError, EditorError, NavigationError, ValidationError } from '../utils/errors.js';
import { NaverBlogSelectors } from '../utils/selectors.js';
import { PageUtils } from '../utils/pageUtils.js';

/**
 * 네이버 블로그 서비스 클래스
 * 블로그 관련 모든 기능을 담당하는 단일 책임 클래스
 */
export class NaverBlogService {
  constructor(page) {
    this.page = page;
    this.selectors = NaverBlogSelectors;
    this.pageUtils = new PageUtils(page);
  }

  /**
   * 블로그 글쓰기 페이지로 이동
   * @param {Object} options - 네비게이션 옵션
   * @param {number} options.timeout - 타임아웃 시간 (기본값: 30000ms)
   * @param {boolean} options.waitForEditor - 에디터 로딩 대기 여부 (기본값: true)
   * @returns {Promise<boolean>} 네비게이션 성공 여부
   * @throws {BlogError} 블로그 네비게이션 실패 시
   * @throws {WriteError} 글쓰기 페이지 로딩 실패 시
   */
  async navigateToWritePage(options = {}) {
    const { timeout = 30000, waitForEditor = true } = options;

    try {
      console.log('📝 블로그 글쓰기 페이지로 이동 시작...');

      // 1. 글쓰기 버튼 찾기 및 클릭
      await this._clickWriteButton(timeout);

      // 2. 새 탭에서 글쓰기 페이지 열림 처리
      const writePageTab = await this._handleNewTab(timeout);

      // 3. 글쓰기 페이지 로딩 확인
      await this._waitForWritePage(writePageTab, timeout);

      // 4. 에디터 준비 상태 확인 (선택적)
      if (waitForEditor) {
        await this._waitForEditor(writePageTab, timeout);
      }

      console.log('✅ 블로그 글쓰기 페이지 이동 완료');
      return true;

    } catch (error) {
      // 에러 타입별 처리
      if (error instanceof BlogError || error instanceof WriteError) {
        throw error;
      }
      
      throw new BlogError(
        `블로그 글쓰기 페이지 이동 중 예상치 못한 오류가 발생했습니다: ${error.message}`,
        error
      );
    }
  }

  /**
   * 블로그 글쓰기 버튼 클릭
   * @private
   * @param {number} timeout - 타임아웃 시간
   * @throws {BlogError} 글쓰기 버튼을 찾을 수 없거나 클릭 실패 시
   */
  async _clickWriteButton(timeout) {
    try {
      console.log('🔍 블로그 메뉴 버튼 찾는 중...');

      // 1단계: 블로그 메뉴 버튼 클릭 (드롭다운 메뉴 활성화)
      const blogMenuSelectors = [
        this.selectors.blogMenuLink,
        this.selectors.blogMenuButton,
        this.selectors.blogMenuButtonClickable,
        this.selectors.blogMenuButtonParent,
        'a:has-text("블로그")',
        'span:has-text("블로그")',
        '.MyView-module__item_text___VTQQM'
      ];

      let blogMenuFound = false;

      for (const selector of blogMenuSelectors) {
        try {
          console.log(`📍 블로그 메뉴 버튼 시도: ${selector}`);
          
          const isVisible = await this.pageUtils.isElementVisible(selector, 3000);
          
          if (isVisible) {
            console.log(`✅ 블로그 메뉴 버튼 발견: ${selector}`);
            
            // 블로그 메뉴 버튼 클릭으로 드롭다운 메뉴 활성화
            await this.pageUtils.safeClick(selector, { timeout: 10000 });
            console.log('🖱️ 블로그 메뉴 클릭 완료');
            
            // 드롭다운 메뉴 표시 대기
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            blogMenuFound = true;
            break;
          }
        } catch (selectorError) {
          console.log(`❌ 블로그 메뉴 버튼 실패: ${selector} - ${selectorError.message}`);
          continue;
        }
      }

      // 2단계: 글쓰기 버튼 찾기 및 클릭
      console.log('🔍 글쓰기 버튼 찾는 중...');

      const writeButtonSelectors = [
        this.selectors.writeButton,           // href 기반
        this.selectors.writeButtonByClass,    // class 기반
        this.selectors.writeButtonByText      // 텍스트 기반
      ];

      let buttonFound = false;
      let usedSelector = null;

      for (const selector of writeButtonSelectors) {
        try {
          console.log(`📍 글쓰기 버튼 시도: ${selector}`);
          
          // 요소 존재 확인
          const isVisible = await this.pageUtils.isElementVisible(selector, 3000);
          
          if (isVisible) {
            console.log(`✅ 글쓰기 버튼 발견: ${selector}`);
            
            // 클릭 가능한 상태까지 대기
            await this.page.waitForSelector(selector, { 
              state: 'visible', 
              timeout 
            });
            
            // 안전한 클릭
            await this.pageUtils.safeClick(selector, { timeout });
            
            buttonFound = true;
            usedSelector = selector;
            break;
          }
        } catch (selectorError) {
          console.log(`❌ 글쓰기 버튼 실패: ${selector} - ${selectorError.message}`);
          continue;
        }
      }

      // 3단계: 메인 페이지에서 찾지 못한 경우 블로그 페이지로 직접 이동
      if (!buttonFound) {
        console.log('💡 메인 페이지에서 글쓰기 버튼을 찾지 못했습니다. 블로그 페이지로 직접 이동합니다...');
        
        await this.page.goto('https://blog.naver.com/', { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        
        // 페이지 로딩 대기
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('✅ 블로그 페이지로 이동 완료');

        // 블로그 페이지에서 글쓰기 버튼 다시 찾기
        const blogPageSelectors = [
          'a[href*="GoBlogWrite"]',
          '.btn_write',
          'a:has-text("글쓰기")',
          'button:has-text("글쓰기")',
          '.write_btn'
        ];

        for (const selector of blogPageSelectors) {
          try {
            console.log(`📍 블로그 페이지에서 글쓰기 버튼 시도: ${selector}`);
            
            const isVisible = await this.pageUtils.isElementVisible(selector, 5000);
            
            if (isVisible) {
              console.log(`✅ 블로그 페이지에서 글쓰기 버튼 발견: ${selector}`);
              
              // 안전한 클릭
              await this.pageUtils.safeClick(selector, { timeout });
              
              buttonFound = true;
              usedSelector = selector;
              break;
            }
          } catch (selectorError) {
            console.log(`❌ 블로그 페이지 셀렉터 실패: ${selector} - ${selectorError.message}`);
            continue;
          }
        }
      }

      if (!buttonFound) {
        throw new BlogError(
          '글쓰기 버튼을 찾을 수 없습니다. 페이지 구조가 변경되었거나 로그인이 완료되지 않았을 수 있습니다.'
        );
      }

      console.log(`✅ 글쓰기 버튼 클릭 완료: ${usedSelector}`);

    } catch (error) {
      if (error instanceof BlogError) {
        throw error;
      }
      throw new BlogError('글쓰기 버튼 클릭 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 새 탭(글쓰기 페이지) 처리
   * @private
   * @param {number} timeout - 타임아웃 시간
   * @returns {Promise<Page>} 새로 열린 페이지 객체
   * @throws {BlogError} 새 탭 처리 실패 시
   */
  async _handleNewTab(timeout) {
    try {
      console.log('🔄 새 탭 처리 중...');

      // 현재 페이지 수 확인
      const allPages = this.page.context().pages();
      console.log(`📄 현재 페이지 수: ${allPages.length}`);

      // 모든 페이지 URL 확인
      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];
        const pageUrl = page.url();
        console.log(`📄 페이지 ${i + 1}: ${pageUrl}`);
        
        // 글쓰기 페이지 URL 패턴 확인
        if (pageUrl.includes('Write') || 
            pageUrl.includes('write') || 
            (pageUrl.includes('blog.naver.com') && pageUrl.includes('Redirect=Write'))) {
          
          console.log(`✅ 글쓰기 페이지 발견: ${pageUrl}`);
          
          // 해당 페이지로 전환
          this.page = page;
          this.pageUtils = new PageUtils(page);
          
          // 페이지 로딩 완료 대기
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
          
          console.log(`✅ 글쓰기 페이지로 전환 완료`);
          return page;
        }
      }

      // 글쓰기 페이지를 찾지 못한 경우, 잠시 대기 후 다시 확인
      console.log('⏳ 글쓰기 페이지 로딩 대기 중...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 다시 모든 페이지 확인
      const updatedPages = this.page.context().pages();
      console.log(`📄 업데이트된 페이지 수: ${updatedPages.length}`);

      for (let i = 0; i < updatedPages.length; i++) {
        const page = updatedPages[i];
        const pageUrl = page.url();
        console.log(`📄 업데이트된 페이지 ${i + 1}: ${pageUrl}`);
        
        if (pageUrl.includes('Write') || 
            pageUrl.includes('write') || 
            (pageUrl.includes('blog.naver.com') && pageUrl.includes('Redirect=Write'))) {
          
          console.log(`✅ 글쓰기 페이지 발견: ${pageUrl}`);
          
          this.page = page;
          this.pageUtils = new PageUtils(page);
          
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
          
          console.log(`✅ 글쓰기 페이지로 전환 완료`);
          return page;
        }
      }

      // 여전히 찾지 못한 경우
      throw new BlogError('글쓰기 페이지를 찾을 수 없습니다. 새 탭이 제대로 열리지 않았을 수 있습니다.');

    } catch (error) {
      console.error(`새 탭 처리 오류 상세: ${error.message}`);
      throw new BlogError('새 탭(글쓰기 페이지) 처리 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 글쓰기 페이지 로딩 확인
   * @private
   * @param {Page} page - 페이지 객체
   * @param {number} timeout - 타임아웃 시간
   * @throws {WriteError} 글쓰기 페이지 로딩 실패 시
   */
  async _waitForWritePage(page, timeout) {
    try {
      console.log('⏳ 글쓰기 페이지 로딩 대기 중...');

      // URL 확인 (블로그 글쓰기 페이지인지)
      const currentUrl = page.url();
      console.log(`📍 현재 URL: ${currentUrl}`);
      
      if (!currentUrl.includes('blog.naver.com')) {
        throw new WriteError(`예상치 못한 페이지로 이동했습니다: ${currentUrl}`);
      }

      // URL에 Write나 write가 포함되어 있거나 Redirect=Write가 있으면 글쓰기 페이지로 간주
      const isWritePage = currentUrl.includes('Write') || 
                         currentUrl.includes('write') || 
                         currentUrl.includes('Redirect=Write');
      
      if (!isWritePage) {
        console.log('⚠️ URL에서 글쓰기 페이지 패턴을 찾을 수 없지만 계속 진행합니다...');
      }

      // 페이지 컨테이너 대기 (더 유연한 셀렉터 사용)
      const containerSelectors = this.selectors.writePageContainer.split(', ');
      let containerFound = false;
      
      for (const selector of containerSelectors) {
        try {
          await page.waitForSelector(selector.trim(), { timeout: 5000 });
          console.log(`✅ 페이지 컨테이너 발견: ${selector.trim()}`);
          containerFound = true;
          break;
        } catch (selectorError) {
          console.log(`⚠️ 컨테이너 셀렉터 실패: ${selector.trim()}`);
          continue;
        }
      }

      if (!containerFound) {
        console.log('⚠️ 페이지 컨테이너를 찾을 수 없지만 계속 진행합니다...');
      }
      
      // 기본 페이지 로딩 대기
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      console.log('✅ 글쓰기 페이지 로딩 완료');

    } catch (error) {
      if (error instanceof WriteError) {
        throw error;
      }
      throw new WriteError('글쓰기 페이지 로딩 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 에디터 준비 상태 확인
   * @private
   * @param {Page} page - 페이지 객체
   * @param {number} timeout - 타임아웃 시간
   * @throws {EditorError} 에디터 로딩 실패 시
   */
  async _waitForEditor(page, timeout) {
    try {
      console.log('📝 에디터 로딩 대기 중...');

      // 1단계: 기존 작성 중인 글이 있는지 확인하고 처리
      await this._handleExistingDraft(page);

      // 2단계: 새 글쓰기 버튼이 있는지 확인하고 클릭
      await this._clickNewPostButton(page);

      // 3단계: 방해 요소들 제거 (팝업, 도움말 패널 등)
      await this._closeInterruptiveElements(page);

      // 4단계: 에디터 관련 요소들 확인 (더 유연한 셀렉터 사용)
      const editorSelectors = [
        '#title',
        '.se-input-text',
        'input[placeholder*="제목"]',
        'textarea[placeholder*="제목"]',
        '.se-content',
        '.se-component',
        '.editor-body',
        '.content-editor'
      ];

      let editorFound = false;
      let foundSelector = null;

      // 각 셀렉터를 개별적으로 시도
      for (const selector of editorSelectors) {
        try {
          console.log(`📍 에디터 요소 확인: ${selector}`);
          
          const isVisible = await this.pageUtils.isElementVisible(selector, 3000);
          
          if (isVisible) {
            console.log(`✅ 에디터 요소 발견: ${selector}`);
            editorFound = true;
            foundSelector = selector;
            break;
          }
        } catch (selectorError) {
          console.log(`⚠️ 에디터 셀렉터 실패: ${selector}`);
          continue;
        }
      }

      if (!editorFound) {
        console.log('⚠️ 에디터 요소를 찾을 수 없지만 페이지가 로딩되었으므로 계속 진행합니다.');
      } else {
        console.log(`✅ 에디터 준비 완료: ${foundSelector}`);
      }

      // 추가 대기 시간 (페이지 완전 로딩)
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('✅ 에디터 로딩 완료');

    } catch (error) {
      console.log('⚠️ 에디터 로딩 중 오류가 발생했지만 계속 진행합니다:', error.message);
      // 에디터 로딩 실패를 치명적 오류로 처리하지 않음
    }
  }

  /**
   * 기존 작성 중인 글 처리 (취소 버튼 클릭)
   * @private
   * @param {Page} page - 페이지 객체
   */
  async _handleExistingDraft(page) {
    try {
      console.log('🔍 기존 작성 중인 글 확인...');

      // 취소 버튼 셀렉터들
      const cancelSelectors = [
        'button:has-text("취소")',
        '.btn_cancel',
        '.cancel',
        '[data-role="cancel"]',
        'button:has-text("나가기")',
        'a:has-text("취소")'
      ];

      for (const selector of cancelSelectors) {
        try {
          const isVisible = await this.pageUtils.isElementVisible(selector, 2000);
          
          if (isVisible) {
            console.log(`✅ 취소 버튼 발견, 클릭: ${selector}`);
            await this.pageUtils.safeClick(selector, { timeout: 5000 });
            
            // 확인 버튼이 나타나면 클릭
            await this._handleConfirmDialog(page);
            
            console.log('✅ 기존 작성 중인 글 취소 완료');
            break;
          }
        } catch (error) {
          console.log(`⚠️ 취소 버튼 처리 실패: ${selector}`);
          continue;
        }
      }

    } catch (error) {
      console.log('⚠️ 기존 작성 중인 글 처리 중 오류:', error.message);
    }
  }

  /**
   * 확인 다이얼로그 처리
   * @private
   * @param {Page} page - 페이지 객체
   */
  async _handleConfirmDialog(page) {
    try {
      // 확인 다이얼로그가 나타날 수 있으므로 대기
      await new Promise(resolve => setTimeout(resolve, 1000));

      const confirmSelectors = [
        'button:has-text("확인")',
        'button:has-text("예")',
        'button:has-text("네")',
        '.btn_confirm',
        '.confirm'
      ];

      for (const selector of confirmSelectors) {
        try {
          const isVisible = await this.pageUtils.isElementVisible(selector, 2000);
          
          if (isVisible) {
            console.log(`✅ 확인 버튼 클릭: ${selector}`);
            await this.pageUtils.safeClick(selector, { timeout: 5000 });
            break;
          }
        } catch (error) {
          continue;
        }
      }

    } catch (error) {
      console.log('⚠️ 확인 다이얼로그 처리 실패:', error.message);
    }
  }

  /**
   * 새 글쓰기 버튼 클릭
   * @private
   * @param {Page} page - 페이지 객체
   */
  async _clickNewPostButton(page) {
    try {
      console.log('🔍 새 글쓰기 버튼 확인...');

      // 새 글쓰기 버튼 셀렉터들
      const newPostSelectors = [
        'button:has-text("새 글")',
        'a:has-text("새 글쓰기")',
        '.btn_write',
        '.new_post',
        'button:has-text("글쓰기")',
        '[data-role="write"]'
      ];

      for (const selector of newPostSelectors) {
        try {
          const isVisible = await this.pageUtils.isElementVisible(selector, 2000);
          
          if (isVisible) {
            console.log(`✅ 새 글쓰기 버튼 발견, 클릭: ${selector}`);
            await this.pageUtils.safeClick(selector, { timeout: 5000 });
            
            // 새 글쓰기 페이지 로딩 대기
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('✅ 새 글쓰기 버튼 클릭 완료');
            break;
          }
        } catch (error) {
          console.log(`⚠️ 새 글쓰기 버튼 처리 실패: ${selector}`);
          continue;
        }
      }

    } catch (error) {
      console.log('⚠️ 새 글쓰기 버튼 처리 중 오류:', error.message);
    }
  }

  /**
   * 방해 요소들 제거 (팝업, 도움말 패널 등)
   * @private
   * @param {Page} page - 페이지 객체
   */
  async _closeInterruptiveElements(page) {
    try {
      console.log('🧹 방해 요소 제거 중...');
      
      // 메인 페이지에서 방해 요소 제거
      await this._closeElementsInMainPage(page);
      
      // iframe이 로드된 경우 iframe 내부도 확인
      try {
        const mainFrame = page.frameLocator('#mainFrame');
        await this._closeElementsInFrame(mainFrame);
      } catch (error) {
        console.log('⚠️ iframe 내부 방해 요소 제거 실패 (iframe이 아직 로드되지 않았을 수 있음)');
      }
      
      console.log('✅ 방해 요소 제거 완료');
      
    } catch (error) {
      console.log('⚠️ 방해 요소 제거 중 오류:', error.message);
    }
  }

  /**
   * 메인 페이지에서 방해 요소 제거
   * @private
   */
  async _closeElementsInMainPage(page) {
    try {
      // popup과 panel만 처리  
      const popupSelectors = [
        'button:has-text("취소")',
        'button.se-help-panel-close-button'
      ];
      
      for (const selector of popupSelectors) {
        try {
          const element = await this.page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 1000 });
          if (isVisible) {
            await element.click();
            console.log(`🔘 메인 페이지 방해 요소 닫기: ${selector}`);
            await this.page.waitForTimeout(500);
          }
        } catch (error) {
          // 무시
        }
      }
    } catch (error) {
      // 무시
    }
  }

  /**
   * iframe 내부에서 방해 요소 제거
   * @private
   */
  async _closeElementsInFrame(frameLocator) {
    try {
      const frame = await this.page.frameLocator('#mainFrame');
      
      // popup과 panel만 처리
      const popupSelectors = [
        'button.se-popup-button.se-popup-button-cancel',  // popup 
        'button.se-help-panel-close-button'              // panel
      ];
      
      for (const selector of popupSelectors) {
        try {
          const element = frame.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 1000 });
          if (isVisible) {
            await element.click();
            console.log(`🔘 iframe 방해 요소 닫기: ${selector}`);
            await this.page.waitForTimeout(500);
          }
        } catch (error) {
          // 무시
        }
      }
    } catch (error) {
      // iframe이 없거나 접근 불가능
    }
  }

  /**
   * 블로그 글 제목 입력 (iframe 지원)
   * @param {string} title - 글 제목
   * @param {Object} options - 입력 옵션
   * @param {number} options.timeout - 타임아웃 시간 (기본값: 10000ms)
   * @returns {Promise<boolean>} 입력 성공 여부
   * @throws {ValidationError} 제목 검증 실패 시
   * @throws {WriteError} 제목 입력 실패 시
   */
  async enterTitle(title, options = {}) {
    const { timeout = 10000 } = options;

    try {
      // 제목 검증
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new ValidationError('유효한 제목을 입력해주세요.');
      }

      if (title.length > 100) {
        throw new ValidationError('제목은 100자를 초과할 수 없습니다.');
      }

      console.log(`📝 제목 입력 중: "${title}"`);

      // 방해 요소 제거 (입력 전 최종 확인)
      await this._closeInterruptiveElements(this.page);

      // iframe 내부에서 시도
      if (!this.editorFrame) {
        const switched = await this.switchToEditorFrame();
        if (!switched) {
          throw new WriteError('iframe 에디터 프레임에 접근할 수 없습니다.');
        }
      }
      
      return await this._enterTitleInFrame(title);

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new WriteError('제목 입력 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * iframe 내부에서 제목 입력
   * @private
   */
  async _enterTitleInFrame(title) {
    try {
      // 성공이 확인된 제목 셀렉터만 사용
      const titleSelector = '.se-text-paragraph:has-text("제목")';
      console.log(`📝 제목 입력 시작: "${title}"`);
      
      const titleInput = this.editorFrame.locator(titleSelector).first();
      
      if (await titleInput.isVisible({ timeout: 3000 })) {
        console.log(`✅ 제목 입력 필드 발견`);
        
        // 요소 클릭 및 포커스
        await titleInput.scrollIntoViewIfNeeded();
        await titleInput.click({ position: { x: 300, y: 24 } }); // 중앙 클릭
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 기존 텍스트 선택 및 새 제목 입력
        await this.page.keyboard.press('Control+a');
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.page.keyboard.type(title, { delay: 30 });
        
        // 제목 입력 완료 후 본문 영역으로 이동
        console.log('📋 제목 입력 완료, 본문 영역으로 이동 중...');
        
        // Tab 키로 다음 필드(본문)로 이동
        await this.page.keyboard.press('Tab');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Enter 키로 본문 영역 활성화
        await this.page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('✅ 제목 입력 및 본문 이동 완료');
        return true;
      }
      
      throw new WriteError('제목 입력 필드를 찾을 수 없습니다.');
      
    } catch (error) {
      console.log('❌ 제목 입력 실패:', error.message);
      throw new WriteError('iframe 내부에서 제목 입력 필드를 찾을 수 없습니다.');
    }
  }

  /**
   * 메인 페이지에서 제목 입력
   * @private
   */
  async _enterTitleInMainPage(title) {
    const titleSelectors = [
      'input[placeholder*="제목"]',
      'textarea[placeholder*="제목"]',
      '#title',
      '.se-input-text',
      '.title-input',
      '.post-title',
      'input[name="title"]',
      'input[type="text"]'
    ];

    let titleEntered = false;

    for (const selector of titleSelectors) {
      try {
        console.log(`📍 제목 입력 필드 확인: ${selector}`);
        
        // 요소가 존재하는지 확인
        const element = await this.page.$(selector);
        if (!element) {
          console.log(`⚠️ 요소 없음: ${selector}`);
          continue;
        }

        // 요소가 보이는지 확인
        const isVisible = await element.isVisible();
        if (!isVisible) {
          console.log(`⚠️ 요소 보이지 않음: ${selector}`);
          continue;
        }

        console.log(`✅ 제목 입력 필드 발견: ${selector}`);
        
        // 포커스 및 클릭
        await element.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 기존 내용 선택 및 삭제
        await element.selectText();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 새로운 제목 입력
        await element.type(title.trim());
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`✅ 제목 입력 완료: "${title}"`);
        titleEntered = true;
        break;
        
      } catch (error) {
        console.log(`⚠️ 제목 입력 실패: ${selector} - ${error.message}`);
        continue;
      }
    }

    if (!titleEntered) {
      // 페이지의 모든 input 요소를 찾아서 시도
      console.log('🔍 모든 입력 필드 검색 중...');
      const allInputs = await this.page.$$('input, textarea');
      
      for (let i = 0; i < allInputs.length; i++) {
        try {
          const input = allInputs[i];
          const isVisible = await input.isVisible();
          
          if (isVisible) {
            console.log(`📍 입력 필드 ${i + 1} 시도 중...`);
            
            await input.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            await input.selectText();
            await input.type(title.trim());
            
            console.log(`✅ 제목 입력 완료 (필드 ${i + 1}): "${title}"`);
            titleEntered = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    if (!titleEntered) {
      throw new WriteError('제목 입력 필드를 찾을 수 없습니다.');
    }

    console.log('✅ 제목 입력 완료');
    return true;
  }

  /**
   * 블로그 글 본문 입력 (iframe 지원)
   * @param {string} content - 글 본문
   * @param {Object} options - 입력 옵션
   * @param {number} options.timeout - 타임아웃 시간 (기본값: 15000ms)
   * @returns {Promise<boolean>} 입력 성공 여부
   * @throws {ValidationError} 본문 검증 실패 시
   * @throws {WriteError} 본문 입력 실패 시
   */
  async enterContent(content, options = {}) {
    const { timeout = 15000 } = options;

    try {
      // 본문 검증
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new ValidationError('유효한 본문을 입력해주세요.');
      }

      console.log(`📝 본문 입력 중... (${content.length}자)`);

      // 방해 요소 제거 (입력 전 최종 확인)
      await this._closeInterruptiveElements(this.page);

      // iframe 내부에서 시도
      if (!this.editorFrame) {
        const switched = await this.switchToEditorFrame();
        if (!switched) {
          throw new WriteError('iframe 에디터 프레임에 접근할 수 없습니다.');
        }
      }
      
      return await this._enterContentInFrame(content);

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new WriteError('본문 입력 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * iframe 내부에서 본문 입력
   * @private
   */
  async _enterContentInFrame(content) {
    try {
      console.log(`📝 본문 입력 시작 (${content.length}자)...`);
      
      // 성공이 확인된 방식: 에디터 영역 클릭 후 키보드 입력
      const contentArea = this.editorFrame.locator('.se-content');
      
      if (await contentArea.isVisible({ timeout: 3000 })) {
        const box = await contentArea.boundingBox();
        if (box) {
          // 컨텐츠 영역의 하단 클릭하여 커서 위치 설정
          await contentArea.click({ 
            position: { x: box.width / 2, y: Math.max(box.height - 50, box.height * 0.8) } 
          });
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Enter로 새 문단 생성
          await this.page.keyboard.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // 본문 내용을 줄 단위로 입력
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              await this.page.keyboard.type(line, { delay: 15 });
            }
            if (i < lines.length - 1) {
              await this.page.keyboard.press('Enter');
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          console.log('✅ 본문 입력 완료');
          return true;
        }
      }
      
      throw new WriteError('본문 에디터 영역을 찾을 수 없습니다.');
      
    } catch (error) {
      console.error('❌ iframe 내부 본문 입력 실패:', error.message);
      throw new WriteError('iframe 내부에서 본문 에디터를 찾을 수 없습니다.');
    }
  }
  

  
  /**
   * 기존 본문 입력 메서드 (호환성 유지)
   * @private
   */
  async _enterContentInFrameOld(content) {
    // 분석 결과에 기반한 네이버 스마트에디터 본문 셀렉터
    const contentSelectors = [
      '[contenteditable="true"]', // 분석에서 발견된 실제 편집 가능한 요소
      '.se-content', // 스마트에디터 컨텐츠 영역
      '.se-text-paragraph:not(:has-text("제목"))', // 제목이 아닌 텍스트 문단
      '.se-component:not(.se-documentTitle)', // 제목이 아닌 컴포넌트
      'div[contenteditable]', // 일반 편집 가능한 div
      '.editor-body',
      '.content-editor',
      'iframe[title*="Rich Text Area"]',
      '.rich-editor',
      'textarea[placeholder*="내용"]'
    ];
    
    for (const selector of contentSelectors) {
      try {
        console.log(`📍 본문 에디터 확인 (iframe 내부): ${selector}`);
        const contentEditor = this.editorFrame.locator(selector).first();
        
        if (await contentEditor.isVisible({ timeout: 2000 })) {
          console.log(`✅ 본문 에디터 발견 (iframe 내부): ${selector}`);
          
          // 요소를 뷰포트로 스크롤
          await contentEditor.scrollIntoViewIfNeeded();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 강제 클릭으로 포커스
          await contentEditor.click({ force: true });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // contenteditable 요소인 경우 특별 처리
          if (selector.includes('contenteditable') || selector === '[contenteditable="true"]') {
            try {
              // 기존 내용 선택 및 삭제
              await this.page.keyboard.press('Control+a');
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // 텍스트 입력 (여러 방법 시도)
              try {
                await contentEditor.fill(content);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const textContent = await contentEditor.textContent();
                if (textContent && textContent.includes(content.substring(0, 20))) {
                  console.log('✅ 본문 입력 완료 (fill 방식)');
                  return true;
                }
              } catch (fillError) {
                console.log('⚠️ fill 방식 실패, type 방식 시도');
              }
              
              // type 방식으로 시도
              try {
                await this.page.keyboard.press('Control+a');
                await contentEditor.type(content, { delay: 10 });
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const textContent = await contentEditor.textContent();
                if (textContent && textContent.includes(content.substring(0, 20))) {
                  console.log('✅ 본문 입력 완료 (type 방식)');
                  return true;
                }
              } catch (typeError) {
                console.log('⚠️ type 방식도 실패');
              }
              
              // 키보드 직접 입력으로 시도
              try {
                await this.page.keyboard.press('Control+a');
                
                // 긴 텍스트는 줄 단위로 나누어 입력
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (line.trim()) {
                    for (const char of line) {
                      await this.page.keyboard.type(char);
                      await new Promise(resolve => setTimeout(resolve, 5));
                    }
                  }
                  if (i < lines.length - 1) {
                    await this.page.keyboard.press('Enter');
                    await new Promise(resolve => setTimeout(resolve, 50));
                  }
                }
                
                const textContent = await contentEditor.textContent();
                if (textContent && textContent.length > content.length * 0.8) {
                  console.log('✅ 본문 입력 완료 (키보드 방식)');
                  return true;
                }
              } catch (keyboardError) {
                console.log('⚠️ 키보드 방식도 실패');
              }
              
            } catch (error) {
              console.log(`⚠️ contenteditable 처리 실패: ${error.message}`);
            }
          } else {
            // 일반 입력 필드 처리
            try {
              await contentEditor.clear();
              await contentEditor.fill(content);
              console.log('✅ 본문 입력 완료 (일반 방식)');
              return true;
            } catch (error) {
              console.log(`⚠️ 일반 입력 실패: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ 요소 접근 실패 (iframe 내부): ${selector} - ${error.message}`);
        continue;
      }
    }
    
    throw new WriteError('iframe 내부에서 본문 에디터를 찾을 수 없습니다.');
  }

  /**
   * 메인 페이지에서 본문 입력
   * @private
   */
  async _enterContentInMainPage(content) {
    const contentSelectors = [
      '.se-content',
      '.se-component',
      '.editor-body',
      '.content-editor',
      '[contenteditable="true"]',
      'iframe[title*="Rich Text Area"]',
      '.rich-editor',
      'textarea[placeholder*="내용"]'
    ];

    let contentEntered = false;

    for (const selector of contentSelectors) {
      try {
        console.log(`📍 본문 입력 필드 확인: ${selector}`);
        
        // iframe인 경우 특별 처리
        if (selector.includes('iframe')) {
          const iframe = await this.page.$(selector);
          if (iframe) {
            const frame = await iframe.contentFrame();
            if (frame) {
              const body = await frame.$('body');
              if (body) {
                console.log(`✅ iframe 본문 필드 발견: ${selector}`);
                await body.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await body.type(content.trim());
                console.log('✅ iframe 본문 입력 완료');
                contentEntered = true;
                break;
              }
            }
          }
          continue;
        }

        // 일반 요소 처리
        const element = await this.page.$(selector);
        if (!element) {
          console.log(`⚠️ 요소 없음: ${selector}`);
          continue;
        }

        const isVisible = await element.isVisible();
        if (!isVisible) {
          console.log(`⚠️ 요소 보이지 않음: ${selector}`);
          continue;
        }

        console.log(`✅ 본문 입력 필드 발견: ${selector}`);
        
        // 포커스 및 클릭
        await element.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 기존 내용 선택 및 삭제 (contenteditable인 경우)
        if (selector.includes('contenteditable')) {
          await element.selectText();
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 새로운 본문 입력
        await element.type(content.trim());
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('✅ 본문 입력 완료');
        contentEntered = true;
        break;
        
      } catch (error) {
        console.log(`⚠️ 본문 입력 실패: ${selector} - ${error.message}`);
        continue;
      }
    }

    if (!contentEntered) {
      throw new WriteError('본문 입력 필드를 찾을 수 없습니다.');
    }

    return true;
  }

  /**
   * 현재 페이지 URL 반환
   * @returns {string} 현재 페이지 URL
   */
  getCurrentUrl() {
    return this.page.url();
  }

  /**
   * 글쓰기 페이지인지 확인
   * @returns {Promise<boolean>} 글쓰기 페이지 여부
   */
  async isWritePage() {
    const url = this.getCurrentUrl();
    
    return url.includes('blog.naver.com') && 
           (url.includes('Write') || url.includes('write'));
  }

  /**
   * 스크린샷 캡처 (디버깅용)
   * @param {string} fileName - 파일명
   * @returns {Promise<string>} 저장된 파일 경로
   */
  async captureScreenshot(fileName = null) {
    return await this.pageUtils.captureScreenshot(fileName);
  }

  /**
   * 현재 페이지의 전체 HTML 조회
   * @returns {Promise<string>} 페이지의 전체 HTML 코드
   */
  async getPageHTML() {
    try {
      console.log('📄 페이지 HTML 조회 중...');
      const htmlContent = await this.page.content();
      console.log(`✅ HTML 조회 완료 (${htmlContent.length}자)`);
      return htmlContent;
    } catch (error) {
      console.error('❌ HTML 조회 실패:', error.message);
      throw new WriteError('페이지 HTML 조회 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 글쓰기 페이지의 구조 분석 및 주요 요소 정보 반환
   * @returns {Promise<Object>} 페이지 구조 분석 결과
   */
  async analyzeWritePageStructure() {
    try {
      console.log('🔍 글쓰기 페이지 구조 분석 시작...');

      const analysis = {
        url: this.getCurrentUrl(),
        timestamp: new Date().toISOString(),
        pageTitle: await this.page.title(),
        elements: {
          titleInputs: [],
          contentEditors: [],
          buttons: [],
          iframes: [],
          forms: [],
          containers: []
        },
        selectors: {
          found: [],
          missing: []
        },
        summary: {
          totalElements: 0,
          hasEditor: false,
          hasTitleInput: false,
          hasIframe: false,
          editorType: 'unknown'
        }
      };

      // 1. 제목 입력 필드 분석
      const titleSelectors = [
        'input[placeholder*="제목"]',
        'textarea[placeholder*="제목"]',
        '#title',
        '.se-input-text',
        '.title-input',
        '.post-title',
        'input[name="title"]',
        'input[type="text"]'
      ];

      for (const selector of titleSelectors) {
        try {
          const elements = await this.page.$$(selector);
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const element = elements[i];
              const isVisible = await element.isVisible();
              const boundingBox = await element.boundingBox();
              
              analysis.elements.titleInputs.push({
                selector,
                index: i,
                isVisible,
                boundingBox,
                tagName: await element.evaluate(el => el.tagName),
                placeholder: await element.evaluate(el => el.placeholder || ''),
                id: await element.evaluate(el => el.id || ''),
                className: await element.evaluate(el => el.className || '')
              });
            }
            analysis.selectors.found.push(selector);
            analysis.summary.hasTitleInput = true;
          } else {
            analysis.selectors.missing.push(selector);
          }
        } catch (error) {
          analysis.selectors.missing.push(selector);
        }
      }

      // 2. 본문 에디터 분석
      const contentSelectors = [
        '.se-content',
        '.se-component',
        '.editor-body',
        '.content-editor',
        '[contenteditable="true"]',
        'iframe[title*="Rich Text Area"]',
        '.rich-editor',
        'textarea[placeholder*="내용"]'
      ];

      for (const selector of contentSelectors) {
        try {
          const elements = await this.page.$$(selector);
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const element = elements[i];
              const isVisible = await element.isVisible();
              const boundingBox = await element.boundingBox();
              const tagName = await element.evaluate(el => el.tagName);
              
              const elementInfo = {
                selector,
                index: i,
                isVisible,
                boundingBox,
                tagName,
                id: await element.evaluate(el => el.id || ''),
                className: await element.evaluate(el => el.className || '')
              };

              // iframe인 경우 추가 정보
              if (tagName === 'IFRAME') {
                elementInfo.src = await element.evaluate(el => el.src || '');
                elementInfo.title = await element.evaluate(el => el.title || '');
                analysis.elements.iframes.push(elementInfo);
                analysis.summary.hasIframe = true;
                analysis.summary.editorType = 'iframe';
              } else if (selector.includes('contenteditable')) {
                analysis.summary.editorType = 'contenteditable';
              }

              analysis.elements.contentEditors.push(elementInfo);
            }
            analysis.selectors.found.push(selector);
            analysis.summary.hasEditor = true;
          } else {
            analysis.selectors.missing.push(selector);
          }
        } catch (error) {
          analysis.selectors.missing.push(selector);
        }
      }

      // 3. 버튼 요소 분석
      const buttonSelectors = [
        'button',
        'input[type="button"]',
        'input[type="submit"]',
        '.btn',
        '[role="button"]'
      ];

      for (const selector of buttonSelectors) {
        try {
          const elements = await this.page.$$(selector);
          for (let i = 0; i < Math.min(elements.length, 20); i++) { // 최대 20개만
            const element = elements[i];
            const isVisible = await element.isVisible();
            const text = await element.evaluate(el => el.textContent || el.value || '').catch(() => '');
            
            if (text.trim()) {
              analysis.elements.buttons.push({
                selector,
                index: i,
                text: text.trim(),
                isVisible,
                tagName: await element.evaluate(el => el.tagName),
                className: await element.evaluate(el => el.className || '')
              });
            }
          }
        } catch (error) {
          // 버튼 분석 실패는 무시
        }
      }

      // 4. 폼 요소 분석
      try {
        const forms = await this.page.$$('form');
        for (let i = 0; i < forms.length; i++) {
          const form = forms[i];
          analysis.elements.forms.push({
            index: i,
            action: await form.evaluate(el => el.action || ''),
            method: await form.evaluate(el => el.method || ''),
            id: await form.evaluate(el => el.id || ''),
            className: await form.evaluate(el => el.className || '')
          });
        }
      } catch (error) {
        // 폼 분석 실패는 무시
      }

      // 5. 주요 컨테이너 분석
      const containerSelectors = [
        '#wrap',
        'body',
        '.se-main-container',
        '.editor-container',
        'main',
        '.content',
        '.write-container'
      ];

      for (const selector of containerSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            const boundingBox = await element.boundingBox();
            
            analysis.elements.containers.push({
              selector,
              isVisible,
              boundingBox,
              tagName: await element.evaluate(el => el.tagName),
              id: await element.evaluate(el => el.id || ''),
              className: await element.evaluate(el => el.className || '')
            });
          }
        } catch (error) {
          // 컨테이너 분석 실패는 무시
        }
      }

      // 6. 요약 정보 계산
      analysis.summary.totalElements = 
        analysis.elements.titleInputs.length +
        analysis.elements.contentEditors.length +
        analysis.elements.buttons.length +
        analysis.elements.iframes.length +
        analysis.elements.forms.length +
        analysis.elements.containers.length;

      console.log('✅ 페이지 구조 분석 완료');
      console.log(`📊 분석 결과: 총 ${analysis.summary.totalElements}개 요소 발견`);
      console.log(`📝 제목 입력: ${analysis.summary.hasTitleInput ? '발견' : '없음'}`);
      console.log(`📄 에디터: ${analysis.summary.hasEditor ? `발견 (${analysis.summary.editorType})` : '없음'}`);

      return analysis;

    } catch (error) {
      console.error('❌ 페이지 구조 분석 실패:', error.message);
      throw new WriteError('페이지 구조 분석 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 페이지 구조 분석 결과를 파일로 저장
   * @param {string} fileName - 저장할 파일명 (기본값: 자동 생성)
   * @returns {Promise<string>} 저장된 파일 경로
   */
  async savePageAnalysis(fileName = null) {
    try {
      const analysis = await this.analyzeWritePageStructure();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const finalFileName = fileName || `page-analysis-${timestamp}.json`;
      
      // analysis 디렉토리 생성
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const analysisDir = './analysis';
      try {
        await fs.mkdir(analysisDir, { recursive: true });
      } catch (error) {
        // 디렉토리가 이미 존재하는 경우 무시
      }
      
      const filePath = path.join(analysisDir, finalFileName);
      
      // JSON 형태로 저장
      await fs.writeFile(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
      
      console.log(`💾 페이지 분석 결과 저장됨: ${filePath}`);
      return filePath;
      
    } catch (error) {
      console.error('❌ 페이지 분석 결과 저장 실패:', error.message);
      throw new WriteError('페이지 분석 결과 저장 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * 페이지 HTML과 구조 분석을 모두 수행하고 저장
   * @param {string} baseFileName - 기본 파일명 (기본값: 자동 생성)
   * @returns {Promise<Object>} 저장된 파일 경로들
   */
  async analyzeAndSavePageStructure(baseFileName = null) {
    try {
      console.log('🔍 페이지 전체 구조 분석 및 저장 시작...');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = baseFileName || `write-page-${timestamp}`;

      // 1. HTML 전체 저장
      const htmlContent = await this.getPageHTML();
      const htmlFileName = `${baseName}.html`;
      
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const analysisDir = './analysis';
      try {
        await fs.mkdir(analysisDir, { recursive: true });
      } catch (error) {
        // 디렉토리가 이미 존재하는 경우 무시
      }
      
      const htmlFilePath = path.join(analysisDir, htmlFileName);
      await fs.writeFile(htmlFilePath, htmlContent, 'utf-8');
      console.log(`💾 HTML 파일 저장됨: ${htmlFilePath}`);

      // 2. 구조 분석 결과 저장
      const analysisFilePath = await this.savePageAnalysis(`${baseName}-analysis.json`);

      // 3. 스크린샷도 함께 저장
      const screenshotPath = await this.captureScreenshot(`${baseName}-screenshot`);

      const result = {
        htmlFile: htmlFilePath,
        analysisFile: analysisFilePath,
        screenshotFile: screenshotPath,
        timestamp: new Date().toISOString()
      };

      console.log('🎉 페이지 구조 분석 및 저장 완료!');
      console.log(`📄 HTML: ${result.htmlFile}`);
      console.log(`📊 분석: ${result.analysisFile}`);
      console.log(`📸 스크린샷: ${result.screenshotFile}`);

      return result;

    } catch (error) {
      console.error('❌ 페이지 구조 분석 및 저장 실패:', error.message);
      throw new WriteError('페이지 구조 분석 및 저장 중 오류가 발생했습니다.', error);
    }
  }

  /**
   * iframe 내부로 전환하여 실제 에디터에 접근
   * @returns {Promise<boolean>} iframe 전환 성공 여부
   */
  async switchToEditorFrame() {
    try {
      console.log('🔍 iframe 에디터 프레임 찾는 중...');
      
      // mainFrame iframe 확인
      const mainFrame = await this.page.frameLocator('#mainFrame').first();
      if (mainFrame) {
        console.log('✅ mainFrame iframe 발견');
        this.editorFrame = mainFrame;
        return true;
      }
      
      // 다른 iframe들 확인
      const iframes = await this.page.locator('iframe').all();
      console.log(`📍 총 ${iframes.length}개 iframe 발견`);
      
      for (let i = 0; i < iframes.length; i++) {
        const iframe = iframes[i];
        const src = await iframe.getAttribute('src');
        console.log(`📍 iframe ${i + 1}: ${src}`);
        
        if (src && src.includes('PostWriteForm')) {
          console.log('✅ 글쓰기 iframe 발견');
          this.editorFrame = this.page.frameLocator(`iframe[src*="PostWriteForm"]`).first();
          return true;
        }
      }
      
      console.log('⚠️ 글쓰기 iframe을 찾을 수 없습니다.');
      return false;
      
    } catch (error) {
      console.error('❌ iframe 전환 중 오류:', error.message);
      return false;
    }
  }

  /**
   * 에디터 도구바 분석
   * @returns {Promise<Object>} 도구바 분석 결과
   */
  async analyzeEditorToolbar() {
    try {
      console.log('🔍 에디터 도구바 분석 시작...');
      
      await this.page.waitForSelector('#mainFrame', { timeout: 10000 });
      const frameHandle = await this.page.$('#mainFrame');
      const frame = await frameHandle.contentFrame();

      const toolbarInfo = {
        buttons: [],
        dropdowns: [],
        styleElements: [],
        formatButtons: {
          bold: [],
          underline: [],
          italic: [],
          heading: []
        }
      };

      // 툴바 버튼들 분석
      const buttonSelectors = [
        'button[title*="굵게"], button[title*="Bold"]',
        'button[title*="밑줄"], button[title*="Underline"]', 
        'button[title*="기울임"], button[title*="Italic"]',
        'button[title*="제목"], button[title*="소제목"]',
        '.se-toolbar button',
        '.se-toolbar-group button'
      ];

      for (const selector of buttonSelectors) {
        try {
          const elements = await frame.$$(selector);
          for (const element of elements) {
            const info = await frame.evaluate(el => ({
              title: el.title || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              className: el.className || '',
              textContent: el.textContent?.trim() || '',
              id: el.id || ''
            }), element);

            toolbarInfo.buttons.push({ selector, ...info });

            // 서식 버튼 분류
            if (info.title.includes('굵게') || info.title.includes('Bold')) {
              toolbarInfo.formatButtons.bold.push(selector);
            }
            if (info.title.includes('밑줄') || info.title.includes('Underline')) {
              toolbarInfo.formatButtons.underline.push(selector);
            }
            if (info.title.includes('기울임') || info.title.includes('Italic')) {
              toolbarInfo.formatButtons.italic.push(selector);
            }
            if (info.title.includes('제목') || info.title.includes('소제목')) {
              toolbarInfo.formatButtons.heading.push(selector);
            }
          }
        } catch (error) {
          console.log(`❌ 버튼 분석 실패: ${selector}`);
        }
      }

      // 드롭다운 요소들 분석
      const dropdownSelectors = [
        'select[title*="글꼴"]',
        'select[title*="크기"]',
        '.se-text-style-dropdown',
        '.se-style-select'
      ];

      for (const selector of dropdownSelectors) {
        try {
          const elements = await frame.$$(selector);
          for (const element of elements) {
            const info = await frame.evaluate(el => ({
              title: el.title || '',
              className: el.className || '',
              tagName: el.tagName || '',
              id: el.id || ''
            }), element);

            toolbarInfo.dropdowns.push({ selector, ...info });
          }
        } catch (error) {
          console.log(`❌ 드롭다운 분석 실패: ${selector}`);
        }
      }

      console.log('✅ 에디터 도구바 분석 완료');
      console.log(`📊 버튼: ${toolbarInfo.buttons.length}개, 드롭다운: ${toolbarInfo.dropdowns.length}개`);
      
      return toolbarInfo;

    } catch (error) {
      console.error('❌ 에디터 도구바 분석 실패:', error.message);
      throw new EditorError('에디터 도구바 분석 중 오류가 발생했습니다.', error);
    }
  }

  // findAndSelectText method removed - conflicts with Agent_blog_upload style

  // applyBold method removed - conflicts with Agent_blog_upload style

  // applyUnderline method removed - conflicts with Agent_blog_upload style

  // applyBoldUnderline method removed - conflicts with Agent_blog_upload style

  // applyHeadingStyle method removed - conflicts with Agent_blog_upload style

  // applyBulkFormatting method removed - relied on deleted drag-to-select methods

  async waitForEditorLoading() {
    console.log('📝 에디터 로딩 대기 중...');
    
    // 기존 작성 중인 글 확인
    try {
      console.log('🔍 기존 작성 중인 글 확인...');
      const existingContent = await this.page.locator('button:has-text("새 글쓰기")').first();
      const isVisible = await existingContent.isVisible({ timeout: 3000 });
      if (isVisible) {
        await existingContent.click();
        console.log('🔄 새 글쓰기 버튼 클릭');
        await this.page.waitForTimeout(2000);
      }
    } catch (error) {
      console.log('🔍 새 글쓰기 버튼 확인...');
    }
    
    // 방해 요소 제거
    await this._closeInterruptiveElements();
    
    // 에디터 요소 확인 프로세스 삭제 (사용자 요청)
    
    console.log('✅ 에디터 로딩 완료');
    return true;
  }

} 