import { writeFile, readFile } from 'fs/promises';
import path from 'path';

/**
 * AI 비전 서비스 - 스크린샷을 분석하여 다음 액션을 결정
 */
export class AIVisionService {
  constructor(page) {
    this.page = page;
    this.screenshotDir = './screenshots/vision';
    this.actionHistory = [];
    this.currentGoal = null;
  }

  /**
   * 현재 화면을 캡처하고 분석하여 다음 액션 결정
   * @param {string} goal - 달성하고자 하는 목표
   * @param {Object} context - 현재 컨텍스트 정보
   * @returns {Promise<Object>} 다음 액션 정보
   */
  async analyzeScreenAndDecideAction(goal, context = {}) {
    try {
      console.log('🔍 화면 분석 및 액션 결정 시작...');
      
      // 1. 현재 화면 캡처
      const screenshot = await this.captureCurrentScreen();
      
      // 2. DOM 정보 수집
      const domInfo = await this.extractDOMInfo();
      
      // 3. 화면 분석 및 액션 결정
      const analysis = await this.analyzeScreenshot(screenshot, goal, context, domInfo);
      
      // 4. 액션 실행 계획 생성
      const actionPlan = await this.createActionPlan(analysis, goal);
      
      // 5. 히스토리 업데이트
      this.actionHistory.push({
        timestamp: new Date().toISOString(),
        screenshot: screenshot.path,
        analysis,
        actionPlan,
        goal,
        context
      });
      
      console.log('✅ 화면 분석 완료:', actionPlan.action);
      return actionPlan;
      
    } catch (error) {
      console.error('❌ 화면 분석 중 오류:', error.message);
      throw error;
    }
  }

  /**
   * 현재 화면 캡처
   * @private
   */
  async captureCurrentScreen() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vision-${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    
    // 디렉토리 생성
    try {
      await import('fs').then(fs => fs.promises.mkdir(this.screenshotDir, { recursive: true }));
    } catch (error) {
      // 이미 존재하는 경우 무시
    }
    
    // 스크린샷 캡처
    await this.page.screenshot({ 
      path: filepath, 
      fullPage: true,
      type: 'png'
    });
    
    return {
      path: filepath,
      filename,
      timestamp
    };
  }

  /**
   * DOM 정보 추출
   * @private
   */
  async extractDOMInfo() {
    try {
      const domInfo = await this.page.evaluate(() => {
        // 모든 클릭 가능한 요소들 찾기
        const clickableElements = [];
        const selectors = [
          'button', 'a', 'input[type="button"]', 'input[type="submit"]',
          '[role="button"]', '[onclick]', '.btn', '.button'
        ];
        
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              clickableElements.push({
                tagName: el.tagName,
                text: el.textContent?.trim() || '',
                className: el.className,
                id: el.id,
                type: el.type || '',
                placeholder: el.placeholder || '',
                href: el.href || '',
                position: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                },
                selector: `${selector}:nth-child(${index + 1})`
              });
            }
          });
        });

        // 입력 필드들 찾기
        const inputElements = [];
        document.querySelectorAll('input, textarea, [contenteditable="true"]').forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            inputElements.push({
              tagName: el.tagName,
              type: el.type || '',
              placeholder: el.placeholder || '',
              value: el.value || '',
              className: el.className,
              id: el.id,
              position: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            });
          }
        });

        return {
          url: window.location.href,
          title: document.title,
          clickableElements,
          inputElements,
          bodyText: document.body.textContent?.substring(0, 1000) || ''
        };
      });
      
      return domInfo;
    } catch (error) {
      console.error('DOM 정보 추출 실패:', error.message);
      return {};
    }
  }

  /**
   * 스크린샷 분석 (여기서는 간단한 규칙 기반, 실제로는 AI 모델 사용)
   * @private
   */
  async analyzeScreenshot(screenshot, goal, context, domInfo) {
    // 실제 구현에서는 OpenAI Vision API, Google Vision API 등을 사용
    // 여기서는 간단한 규칙 기반 분석 예시
    
    const analysis = {
      currentPage: domInfo.url,
      pageTitle: domInfo.title,
      availableActions: [],
      recommendations: [],
      confidence: 0.8
    };

    // 목표에 따른 분석
    if (goal.includes('로그인')) {
      analysis.availableActions = this.findLoginElements(domInfo);
      analysis.recommendations.push('로그인 관련 요소들을 찾았습니다.');
    } else if (goal.includes('글쓰기') || goal.includes('제목') || goal.includes('본문')) {
      analysis.availableActions = this.findWritingElements(domInfo);
      analysis.recommendations.push('글쓰기 관련 요소들을 찾았습니다.');
    } else if (goal.includes('버튼') || goal.includes('클릭')) {
      analysis.availableActions = this.findClickableElements(domInfo);
      analysis.recommendations.push('클릭 가능한 요소들을 찾았습니다.');
    }

    return analysis;
  }

  /**
   * 로그인 관련 요소 찾기
   * @private
   */
  findLoginElements(domInfo) {
    const actions = [];
    
    domInfo.inputElements?.forEach(el => {
      if (el.type === 'email' || el.type === 'text' || el.placeholder?.includes('아이디') || el.placeholder?.includes('이메일')) {
        actions.push({
          type: 'input',
          element: el,
          action: 'fill_username',
          description: '사용자명/이메일 입력 필드'
        });
      }
      if (el.type === 'password' || el.placeholder?.includes('비밀번호')) {
        actions.push({
          type: 'input',
          element: el,
          action: 'fill_password',
          description: '비밀번호 입력 필드'
        });
      }
    });

    domInfo.clickableElements?.forEach(el => {
      if (el.text?.includes('로그인') || el.text?.includes('Login') || el.type === 'submit') {
        actions.push({
          type: 'click',
          element: el,
          action: 'login_submit',
          description: '로그인 버튼'
        });
      }
    });

    return actions;
  }

  /**
   * 글쓰기 관련 요소 찾기
   * @private
   */
  findWritingElements(domInfo) {
    const actions = [];
    
    domInfo.inputElements?.forEach(el => {
      if (el.placeholder?.includes('제목') || el.id?.includes('title')) {
        actions.push({
          type: 'input',
          element: el,
          action: 'fill_title',
          description: '제목 입력 필드'
        });
      }
      if (el.tagName === 'TEXTAREA' || el.placeholder?.includes('내용') || el.className?.includes('editor')) {
        actions.push({
          type: 'input',
          element: el,
          action: 'fill_content',
          description: '본문 입력 필드'
        });
      }
    });

    domInfo.clickableElements?.forEach(el => {
      if (el.text?.includes('글쓰기') || el.text?.includes('작성') || el.text?.includes('Write')) {
        actions.push({
          type: 'click',
          element: el,
          action: 'start_writing',
          description: '글쓰기 시작 버튼'
        });
      }
      if (el.text?.includes('발행') || el.text?.includes('게시') || el.text?.includes('Publish')) {
        actions.push({
          type: 'click',
          element: el,
          action: 'publish',
          description: '발행 버튼'
        });
      }
    });

    return actions;
  }

  /**
   * 클릭 가능한 요소들 찾기
   * @private
   */
  findClickableElements(domInfo) {
    return domInfo.clickableElements?.map(el => ({
      type: 'click',
      element: el,
      action: 'click',
      description: `클릭 가능: ${el.text || el.tagName}`
    })) || [];
  }

  /**
   * 액션 실행 계획 생성
   * @private
   */
  async createActionPlan(analysis, goal) {
    if (analysis.availableActions.length === 0) {
      return {
        action: 'wait_and_analyze',
        description: '적절한 액션을 찾지 못했습니다. 잠시 후 다시 분석합니다.',
        confidence: 0.3,
        nextStep: 'analyze_again'
      };
    }

    // 가장 적절한 액션 선택 (간단한 우선순위 기반)
    const prioritizedAction = this.selectBestAction(analysis.availableActions, goal);
    
    return {
      action: prioritizedAction.action,
      element: prioritizedAction.element,
      description: prioritizedAction.description,
      confidence: analysis.confidence,
      nextStep: 'execute_action'
    };
  }

  /**
   * 최적의 액션 선택
   * @private
   */
  selectBestAction(actions, goal) {
    // 목표에 따른 우선순위 점수 계산
    const scoredActions = actions.map(action => {
      let score = 0;
      
      if (goal.includes('로그인')) {
        if (action.action === 'fill_username') score += 10;
        if (action.action === 'fill_password') score += 9;
        if (action.action === 'login_submit') score += 8;
      } else if (goal.includes('글쓰기')) {
        if (action.action === 'start_writing') score += 10;
        if (action.action === 'fill_title') score += 9;
        if (action.action === 'fill_content') score += 8;
      }
      
      return { ...action, score };
    });

    // 가장 높은 점수의 액션 반환
    return scoredActions.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * 액션 실행
   * @param {Object} actionPlan - 실행할 액션 계획
   * @param {string} data - 입력할 데이터 (필요한 경우)
   */
  async executeAction(actionPlan, data = '') {
    try {
      console.log(`🎯 액션 실행: ${actionPlan.description}`);
      
      switch (actionPlan.action) {
        case 'fill_username':
        case 'fill_password':
        case 'fill_title':
        case 'fill_content':
          await this.executeInputAction(actionPlan.element, data);
          break;
          
        case 'click':
        case 'login_submit':
        case 'start_writing':
        case 'publish':
          await this.executeClickAction(actionPlan.element);
          break;
          
        case 'wait_and_analyze':
          await this.page.waitForTimeout(2000);
          break;
          
        default:
          console.log('⚠️ 알 수 없는 액션:', actionPlan.action);
      }
      
      // 액션 실행 후 잠시 대기
      await this.page.waitForTimeout(1000);
      
      console.log('✅ 액션 실행 완료');
      return true;
      
    } catch (error) {
      console.error('❌ 액션 실행 실패:', error.message);
      return false;
    }
  }

  /**
   * 입력 액션 실행
   * @private
   */
  async executeInputAction(element, data) {
    const selector = this.createSelector(element);
    const locator = this.page.locator(selector).first();
    
    await locator.click();
    await locator.clear();
    await locator.fill(data);
  }

  /**
   * 클릭 액션 실행
   * @private
   */
  async executeClickAction(element) {
    const selector = this.createSelector(element);
    const locator = this.page.locator(selector).first();
    
    await locator.click();
  }

  /**
   * 요소에서 CSS 셀렉터 생성
   * @private
   */
  createSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    if (element.className) {
      return `.${element.className.split(' ')[0]}`;
    }
    if (element.text) {
      return `${element.tagName.toLowerCase()}:has-text("${element.text}")`;
    }
    return element.tagName.toLowerCase();
  }

  /**
   * 연속적인 자동 실행 모드
   * @param {string} goal - 최종 목표
   * @param {Object} config - 설정
   */
  async runAutonomousMode(goal, config = {}) {
    const { 
      maxIterations = 20, 
      delayBetweenActions = 2000,
      data = {} 
    } = config;
    
    console.log(`🤖 자율 실행 모드 시작: ${goal}`);
    
    for (let i = 0; i < maxIterations; i++) {
      console.log(`\n🔄 반복 ${i + 1}/${maxIterations}`);
      
      try {
        // 현재 화면 분석 및 액션 결정
        const actionPlan = await this.analyzeScreenAndDecideAction(goal, { iteration: i });
        
        // 목표 달성 여부 확인
        if (actionPlan.action === 'goal_achieved') {
          console.log('🎉 목표 달성!');
          break;
        }
        
        // 액션 실행
        const actionData = this.getActionData(actionPlan.action, data);
        const success = await this.executeAction(actionPlan, actionData);
        
        if (!success) {
          console.log('⚠️ 액션 실행 실패, 다시 시도합니다.');
        }
        
        // 다음 액션까지 대기
        await this.page.waitForTimeout(delayBetweenActions);
        
      } catch (error) {
        console.error(`❌ 반복 ${i + 1} 실행 중 오류:`, error.message);
        await this.page.waitForTimeout(delayBetweenActions);
      }
    }
    
    console.log('🏁 자율 실행 모드 종료');
    return this.actionHistory;
  }

  /**
   * 액션에 필요한 데이터 가져오기
   * @private
   */
  getActionData(action, data) {
    const dataMap = {
      'fill_username': data.username || process.env.NAVER_ID || '',
      'fill_password': data.password || process.env.NAVER_PASSWORD || '',
      'fill_title': data.title || '제목 없음',
      'fill_content': data.content || '내용 없음'
    };
    
    return dataMap[action] || '';
  }

  /**
   * 실행 히스토리 저장
   */
  async saveHistory(filename = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = filename || `./logs/vision-history-${timestamp}.json`;
    
    await writeFile(filepath, JSON.stringify(this.actionHistory, null, 2), 'utf-8');
    console.log(`📄 실행 히스토리 저장됨: ${filepath}`);
    
    return filepath;
  }
} 