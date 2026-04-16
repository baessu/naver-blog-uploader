import { AIVisionService } from './AIVisionService.js';
import { NaverBlogService } from './NaverBlogService.js';
import { NaverLoginService } from './NaverLoginService.js';

/**
 * 자율 에이전트 - AI 비전과 기존 서비스를 통합하여 자동으로 작업 수행
 */
export class AutonomousAgent {
  constructor(page) {
    this.page = page;
    this.visionService = new AIVisionService(page);
    this.blogService = new NaverBlogService(page);
    this.loginService = new NaverLoginService(page);
    this.currentMode = 'manual'; // 'manual' | 'autonomous' | 'hybrid'
    this.isRunning = false;
  }

  /**
   * 자율 모드로 블로그 콘텐츠 업로드
   * @param {Object} config - 설정
   */
  async autonomousBlogUpload(config = {}) {
    const {
      contentPath = './files/ready',
      maxAttempts = 3,
      enableVision = true,
      fallbackToManual = true
    } = config;

    console.log('🤖 자율 블로그 업로드 시작...');
    this.isRunning = true;
    this.currentMode = enableVision ? 'autonomous' : 'manual';

    try {
      // 1. 콘텐츠 준비
      const content = await this.prepareContent(contentPath);
      
      // 2. 로그인 (자율 모드)
      if (enableVision) {
        await this.autonomousLogin();
      } else {
        await this.manualLogin();
      }

      // 3. 글쓰기 페이지로 이동 (자율 모드)
      if (enableVision) {
        await this.autonomousNavigateToWrite();
      } else {
        await this.manualNavigateToWrite();
      }

      // 4. 콘텐츠 입력 (하이브리드 모드)
      await this.hybridContentInput(content);

      // 5. 포맷팅 (자율 모드)
      if (enableVision) {
        await this.autonomousFormatting();
      }

      console.log('🎉 자율 블로그 업로드 완료!');
      return true;

    } catch (error) {
      console.error('❌ 자율 업로드 실패:', error.message);
      
      if (fallbackToManual) {
        console.log('🔄 수동 모드로 전환하여 재시도...');
        return await this.fallbackToManualMode(config);
      }
      
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 자율 로그인
   * @private
   */
  async autonomousLogin() {
    console.log('🔐 자율 로그인 시작...');
    
    const goal = '네이버 로그인을 완료하여 메인 페이지에 도달';
    const data = {
      username: process.env.NAVER_ID,
      password: process.env.NAVER_PASSWORD
    };

    const history = await this.visionService.runAutonomousMode(goal, {
      maxIterations: 10,
      delayBetweenActions: 3000,
      data
    });

    // 로그인 성공 여부 확인
    const currentUrl = this.page.url();
    if (currentUrl.includes('naver.com') && !currentUrl.includes('login')) {
      console.log('✅ 자율 로그인 성공');
      return true;
    } else {
      throw new Error('자율 로그인 실패');
    }
  }

  /**
   * 수동 로그인 (기존 방식)
   * @private
   */
  async manualLogin() {
    console.log('🔐 수동 로그인 시작...');
    return await this.loginService.login();
  }

  /**
   * 자율 글쓰기 페이지 이동
   * @private
   */
  async autonomousNavigateToWrite() {
    console.log('📝 자율 글쓰기 페이지 이동 시작...');
    
    const goal = '블로그 글쓰기 페이지로 이동하여 에디터가 로딩될 때까지 대기';
    
    const history = await this.visionService.runAutonomousMode(goal, {
      maxIterations: 15,
      delayBetweenActions: 2000
    });

    // 글쓰기 페이지 도달 확인
    const currentUrl = this.page.url();
    if (currentUrl.includes('blog.naver.com') && 
        (currentUrl.includes('Write') || currentUrl.includes('write'))) {
      console.log('✅ 자율 글쓰기 페이지 이동 성공');
      return true;
    } else {
      throw new Error('자율 글쓰기 페이지 이동 실패');
    }
  }

  /**
   * 수동 글쓰기 페이지 이동 (기존 방식)
   * @private
   */
  async manualNavigateToWrite() {
    console.log('📝 수동 글쓰기 페이지 이동 시작...');
    return await this.blogService.navigateToWritePage();
  }

  /**
   * 하이브리드 콘텐츠 입력 (비전 + 기존 방식 조합)
   * @private
   */
  async hybridContentInput(content) {
    console.log('✍️ 하이브리드 콘텐츠 입력 시작...');
    
    try {
      // 1. 먼저 비전으로 입력 필드 찾기
      const actionPlan = await this.visionService.analyzeScreenAndDecideAction(
        '제목과 본문 입력 필드를 찾아 콘텐츠 입력'
      );

      if (actionPlan.action !== 'wait_and_analyze') {
        // 2. 비전으로 찾은 필드에 콘텐츠 입력
        await this.visionService.executeAction(actionPlan, content.title);
        
        // 본문 입력을 위한 추가 분석
        const contentActionPlan = await this.visionService.analyzeScreenAndDecideAction(
          '본문 입력 필드에 콘텐츠 입력'
        );
        
        if (contentActionPlan.action !== 'wait_and_analyze') {
          await this.visionService.executeAction(contentActionPlan, content.content);
        } else {
          throw new Error('본문 입력 필드를 찾을 수 없음');
        }
      } else {
        throw new Error('입력 필드를 찾을 수 없음');
      }

    } catch (error) {
      console.log('⚠️ 비전 입력 실패, 기존 방식으로 시도:', error.message);
      
      // 3. 실패 시 기존 방식으로 폴백
      await this.blogService.enterTitle(content.title);
      await this.blogService.enterContent(content.content);
    }

    console.log('✅ 콘텐츠 입력 완료');
  }

  /**
   * 자율 포맷팅
   * @private
   */
  async autonomousFormatting() {
    console.log('🎨 자율 포맷팅 시작...');
    
    const goal = '본문의 소제목을 찾아 스타일 적용하고 중요한 텍스트에 볼드 처리';
    
    const history = await this.visionService.runAutonomousMode(goal, {
      maxIterations: 10,
      delayBetweenActions: 1500
    });

    console.log('✅ 자율 포맷팅 완료');
  }

  /**
   * 콘텐츠 준비
   * @private
   */
  async prepareContent(contentPath) {
    console.log('📂 콘텐츠 준비 중...');
    
    // 기존 로직 재사용
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const folders = await fs.readdir(contentPath);
      const firstFolder = folders.sort()[0];
      
      if (!firstFolder) {
        throw new Error('준비된 콘텐츠 폴더가 없습니다.');
      }
      
      const folderPath = path.join(contentPath, firstFolder);
      const files = await fs.readdir(folderPath);
      
      const mdFile = files.find(f => f.endsWith('.md'));
      const pngFiles = files.filter(f => f.endsWith('.png'));
      
      if (!mdFile) {
        throw new Error('MD 파일을 찾을 수 없습니다.');
      }
      
      const mdContent = await fs.readFile(path.join(folderPath, mdFile), 'utf-8');
      const parsedContent = this.parseMarkdownContent(mdContent);
      
      console.log(`✅ 콘텐츠 준비 완료: ${parsedContent.title}`);
      
      return {
        ...parsedContent,
        images: pngFiles.map(f => path.join(folderPath, f)),
        folderPath
      };
      
    } catch (error) {
      console.error('❌ 콘텐츠 준비 실패:', error.message);
      throw error;
    }
  }

  /**
   * 마크다운 콘텐츠 파싱
   * @private
   */
  parseMarkdownContent(markdownContent) {
    const lines = markdownContent.split('\n');
    let title = '';
    let content = '';
    let foundTitle = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!foundTitle && line.startsWith('# ')) {
        title = line.substring(2).trim();
        foundTitle = true;
        continue;
      }
      
      if (foundTitle) {
        if (!line.startsWith('![') || !line.includes('](')) {
          content += lines[i] + '\n';
        }
      }
    }

    return {
      title: title || '제목 없음',
      content: content.trim() || '내용 없음'
    };
  }

  /**
   * 수동 모드로 폴백
   * @private
   */
  async fallbackToManualMode(config) {
    console.log('🔄 수동 모드로 폴백 실행...');
    this.currentMode = 'manual';
    
    // 기존 index.js의 main 함수 로직 사용
    const content = await this.prepareContent(config.contentPath || './files/ready');
    
    try {
      await this.manualLogin();
      await this.manualNavigateToWrite();
      await this.blogService.enterTitle(content.title);
      await this.blogService.enterContent(content.content);
      
      console.log('✅ 수동 모드 폴백 성공');
      return true;
    } catch (error) {
      console.error('❌ 수동 모드 폴백도 실패:', error.message);
      throw error;
    }
  }

  /**
   * 실시간 모니터링 모드
   * @param {string} goal - 목표
   * @param {Object} config - 설정
   */
  async startRealtimeMonitoring(goal, config = {}) {
    const { 
      monitoringInterval = 5000,
      maxDuration = 300000, // 5분
      enableAutoAction = false 
    } = config;

    console.log('👁️ 실시간 모니터링 시작...');
    this.isRunning = true;
    
    const startTime = Date.now();
    
    while (this.isRunning && (Date.now() - startTime) < maxDuration) {
      try {
        // 현재 화면 분석
        const actionPlan = await this.visionService.analyzeScreenAndDecideAction(goal);
        
        console.log(`📊 분석 결과: ${actionPlan.description} (신뢰도: ${actionPlan.confidence})`);
        
        // 자동 액션 실행 (옵션)
        if (enableAutoAction && actionPlan.confidence > 0.7) {
          console.log('🎯 자동 액션 실행...');
          await this.visionService.executeAction(actionPlan);
        }
        
        // 다음 모니터링까지 대기
        await this.page.waitForTimeout(monitoringInterval);
        
      } catch (error) {
        console.error('❌ 모니터링 중 오류:', error.message);
        await this.page.waitForTimeout(monitoringInterval);
      }
    }
    
    console.log('🏁 실시간 모니터링 종료');
    await this.visionService.saveHistory();
  }

  /**
   * 모니터링 중단
   */
  stopMonitoring() {
    console.log('⏹️ 모니터링 중단 요청');
    this.isRunning = false;
  }

  /**
   * 현재 상태 반환
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.currentMode,
      actionHistory: this.visionService.actionHistory.length,
      currentUrl: this.page.url()
    };
  }
} 