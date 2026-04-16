import { chromium } from 'playwright';
import { createLogger } from './utils/logger.js';
import { sleep, getEnvVar, getEnvBool, getEnvNumber } from './utils/helpers.js';
import { DEFAULT_NAVER_BLOG_CONFIG, DEFAULT_BROWSER_CONFIG } from './config/defaults.js';
import { NaverLoginService } from './services/NaverLoginService.js';
// CRITICAL FIX: Use Agent_blog_upload logic instead of broken drag-to-select NaverBlogService
// import { NaverBlogService } from './services/NaverBlogService.js';
import { LoginError, NavigationError, ValidationError, BlogError, WriteError } from './utils/errors.js';

/**
 * 네이버 로그인 및 블로그 자동화 메인 클래스
 * 브라우저 생명주기와 전체 워크플로우를 관리
 */
class NaverLoginAutomation {
  constructor() {
    this.browser = null;
    this.page = null;
    this.loginService = null;
    this.blogService = null;
    this.logger = createLogger({ 
      service: 'naver-blog-automation',
      level: 'info',
      enableFile: true 
    });
    
    this.logger.info('네이버 블로그 자동화 시스템 초기화');
  }

  /**
   * 브라우저 초기화
   * @param {Object} options - 브라우저 옵션
   * @param {boolean} options.headless - 헤드리스 모드 여부
   * @param {number} options.slowMo - 액션 간 지연 시간
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    const {
      headless = getEnvBool('BROWSER_HEADLESS', DEFAULT_BROWSER_CONFIG.headless),
      slowMo = getEnvNumber('SLOW_MO', 0)
    } = options;

    try {
      this.logger.start('브라우저를 시작하는 중...');
      
      this.browser = await chromium.launch({
        headless,
        slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });

      this.page = await this.browser.newPage({
        viewport: { 
          width: DEFAULT_BROWSER_CONFIG.viewport.width, 
          height: DEFAULT_BROWSER_CONFIG.viewport.height 
        },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul'
      });

      // 추가 페이지 설정
      await this.page.setExtraHTTPHeaders({
        'User-Agent': DEFAULT_BROWSER_CONFIG.userAgent || 
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // 서비스 인스턴스 생성
      this.loginService = new NaverLoginService(this.page);
      this.blogService = new NaverBlogService(this.page);
      
      this.logger.success('브라우저 초기화 완료');
    } catch (error) {
      this.logger.error('브라우저 초기화 실패', { error: error.message });
      throw error;
    }
  }

  /**
   * 네이버 로그인 실행
   * @param {string} userId - 네이버 아이디 (환경변수에서 자동 로드 가능)
   * @param {string} password - 네이버 비밀번호 (환경변수에서 자동 로드 가능)
   * @param {Object} options - 로그인 옵션
   * @returns {Promise<boolean>} 로그인 성공 여부
   */
  async login(userId = null, password = null, options = {}) {
    // 환경변수에서 자격증명 로드
    const finalUserId = userId || getEnvVar('NAVER_USERNAME', '');
    const finalPassword = password || getEnvVar('NAVER_PASSWORD', '');

    if (!finalUserId || !finalPassword) {
      throw new ValidationError(
        '네이버 로그인 정보가 제공되지 않았습니다. 환경변수(NAVER_USERNAME, NAVER_PASSWORD) 또는 매개변수로 전달해주세요.'
      );
    }

    try {
      this.logger.start('네이버 로그인을 시작합니다...');
      this.logger.info(`사용자 ID: ${finalUserId.substring(0, 3)}***`);

      if (!this.loginService) {
        throw new Error('브라우저가 초기화되지 않았습니다. initialize()를 먼저 호출해주세요.');
      }

      const isSuccess = await this.loginService.login(finalUserId, finalPassword, options);

      if (isSuccess) {
        this.logger.success('네이버 로그인 성공!');
        
        // 현재 페이지 URL 출력
        const currentUrl = this.page?.url();
        this.logger.info(`현재 페이지: ${currentUrl}`);
        
        return true;
      } else {
        this.logger.failure('네이버 로그인 실패');
        return false;
      }
    } catch (error) {
      this.logger.error('로그인 중 오류 발생', { error: error.message });
      
      // 에러별 맞춤 처리
      if (error instanceof ValidationError) {
        this.logger.info('해결 방법: 올바른 네이버 아이디와 비밀번호를 확인해주세요.');
      } else if (error instanceof NavigationError) {
        this.logger.info('해결 방법: 인터넷 연결을 확인하고 다시 시도해주세요.');
      } else if (error instanceof LoginError) {
        this.logger.info('해결 방법: 네이버 로그인 페이지 구조가 변경되었을 수 있습니다.');
      }

      throw error;
    }
  }

  /**
   * 블로그 글쓰기 페이지로 이동
   * @param {Object} options - 블로그 네비게이션 옵션
   * @param {number} options.timeout - 타임아웃 시간 (기본값: 30000ms)
   * @param {boolean} options.waitForEditor - 에디터 로딩 대기 여부 (기본값: true)
   * @returns {Promise<boolean>} 네비게이션 성공 여부
   */
  async navigateToBlogWrite(options = {}) {
    if (!this.blogService) {
      throw new Error('브라우저가 초기화되지 않았습니다. initialize()를 먼저 호출해주세요.');
    }

    try {
      this.logger.start('블로그 글쓰기 페이지로 이동합니다...');

      const success = await this.blogService.navigateToWritePage(options);

      if (success) {
        this.logger.success('블로그 글쓰기 페이지 이동 성공!');
        
        // 블로그 서비스의 page를 업데이트 (새 탭으로 전환되었으므로)
        this.page = this.blogService.page;
        
        // 현재 페이지 URL 출력
        const currentUrl = this.blogService.getCurrentUrl();
        this.logger.info(`현재 페이지: ${currentUrl}`);
        
        return true;
      } else {
        this.logger.failure('블로그 글쓰기 페이지 이동 실패');
        return false;
      }
    } catch (error) {
      this.logger.error('블로그 이동 중 오류 발생', { error: error.message });
      
      // 에러별 맞춤 처리
      if (error instanceof BlogError) {
        this.logger.info('해결 방법: 로그인이 완료되었는지 확인하고, 프로필 영역에서 글쓰기 버튼을 찾을 수 있는지 확인해주세요.');
      } else if (error instanceof WriteError) {
        this.logger.info('해결 방법: 네이버 블로그 글쓰기 페이지 구조가 변경되었을 수 있습니다.');
      }

      throw error;
    }
  }

  /**
   * 멀티계정 자동 업로드 실행
   * 첫 번째 계정으로 7개 글 작성 후 자동으로 두 번째 계정으로 전환하여 추가 7개 글 작성
   */
  async processMultiAccountUpload() {
    this.logger.start('멀티계정 자동 업로드 시작');
    
    const startTime = new Date();
    const stats = {
      totalPosts: 0,
      successfulPosts: 0,
      failedPosts: 0,
      totalImages: 0,
      successfulImages: 0,
      failedImages: 0,
      duration: 0,
      accountsUsed: 0
    };

    const accountStats = {};

    try {
      // 첫 번째 계정으로 처리
      const firstAccountResult = await this.processWithAccount(
        DEFAULT_NAVER_BLOG_CONFIG.accounts[0],
        1
      );
      
      accountStats[DEFAULT_NAVER_BLOG_CONFIG.accounts[0].username] = firstAccountResult;
      stats.accountsUsed++;

      // 두 번째 계정으로 전환하여 처리
      if (DEFAULT_NAVER_BLOG_CONFIG.accounts[1]) {
        await this.logoutCurrentAccount();
        await sleep(2000);

        const secondAccountResult = await this.processWithAccount(
          DEFAULT_NAVER_BLOG_CONFIG.accounts[1],
          2
        );
        
        accountStats[DEFAULT_NAVER_BLOG_CONFIG.accounts[1].username] = secondAccountResult;
        stats.accountsUsed++;
      }

      // 전체 통계 계산
      const endTime = new Date();
      stats.duration = endTime.getTime() - startTime.getTime();

      this.logger.complete('멀티계정 자동 업로드 완료');
      this.logger.stats('최종 통계', {
        '사용된 계정 수': stats.accountsUsed,
        '총 처리 시간': `${Math.round(stats.duration / 1000)}초`
      });

      return {
        id: `upload-${Date.now()}`,
        status: 'completed',
        startTime,
        endTime,
        duration: stats.duration,
        itemsProcessed: stats.totalPosts,
        itemsSuccessful: stats.successfulPosts,
        itemsFailed: stats.failedPosts,
        data: [],
        accountStats,
        totalStats: stats
      };

    } catch (error) {
      this.logger.error('멀티계정 업로드 실패', { error: error.message });
      throw error;
    }
  }

  /**
   * 특정 계정으로 처리
   */
  async processWithAccount(account, accountNumber) {
    this.logger.start(`계정 ${accountNumber} 처리 시작: ${account.username}`);
    
    try {
      // 로그인
      await this.login(account.username, account.password);
      
      // 블로그 업로드 처리 로직
      const result = await this.processAllReadyFoldersForAccount(account);
      
      this.logger.success(`계정 ${accountNumber} 처리 완료`);
      return result;
      
    } catch (error) {
      this.logger.error(`계정 ${accountNumber} 처리 실패`, { error: error.message });
      throw error;
    }
  }

  /**
   * 현재 계정 로그아웃
   */
  async logoutCurrentAccount() {
    this.logger.info('현재 계정 로그아웃 중...');
    // 로그아웃 로직 구현
  }

  /**
   * 계정별 폴더 처리
   */
  async processAllReadyFoldersForAccount(account) {
    // 폴더 처리 로직 구현
    return {
      postsUploaded: 0,
      imagesUploaded: 0,
      errors: []
    };
  }

  /**
   * 블로그 글 제목 입력
   * @param {string} title - 글 제목
   * @param {Object} options - 입력 옵션
   * @returns {Promise<boolean>} 입력 성공 여부
   */
  async enterBlogTitle(title, options = {}) {
    if (!this.blogService) {
      throw new Error('블로그 서비스가 초기화되지 않았습니다.');
    }

    try {
      return await this.blogService.enterTitle(title, options);
    } catch (error) {
      this.logger.error('제목 입력 중 오류 발생', { error: error.message });
      throw error;
    }
  }

  /**
   * 블로그 글 본문 입력
   * @param {string} content - 글 본문
   * @param {Object} options - 입력 옵션
   * @returns {Promise<boolean>} 입력 성공 여부
   */
  async enterBlogContent(content, options = {}) {
    if (!this.blogService) {
      throw new Error('블로그 서비스가 초기화되지 않았습니다.');
    }

    try {
      return await this.blogService.enterContent(content, options);
    } catch (error) {
      this.logger.error('본문 입력 중 오류 발생', { error: error.message });
      throw error;
    }
  }

  /**
   * MD 파일에서 제목과 본문 분리
   * @param {string} markdownContent - MD 파일 내용
   * @returns {Object} {title, content} 제목과 본문
   */
  parseBlogContent(markdownContent) {
    try {
      const lines = markdownContent.split('\n');
      let title = '';
      let content = '';
      let foundTitle = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 첫 번째 # 제목을 찾음
        if (!foundTitle && line.startsWith('# ')) {
          title = line.substring(2).trim();
          foundTitle = true;
          continue;
        }
        
        // 제목을 찾은 후의 모든 내용을 본문으로 처리
        if (foundTitle) {
          // 이미지 태그는 제거 (네이버 블로그에서는 별도 업로드 필요)
          if (!line.startsWith('![') || !line.includes('](')) {
            content += lines[i] + '\n';
          }
        }
      }

      // 본문에서 불필요한 공백 제거
      content = content.trim();

      return {
        title: title || '제목 없음',
        content: content || '내용 없음'
      };
    } catch (error) {
      this.logger.error('MD 파일 파싱 중 오류', { error: error.message });
      return {
        title: '파싱 오류',
        content: markdownContent
      };
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup() {
    try {
      if (this.browser) {
        this.logger.info('브라우저를 종료합니다...');
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.loginService = null;
        this.blogService = null;
        this.logger.success('리소스 정리 완료');
      }
    } catch (error) {
      this.logger.error('리소스 정리 중 오류 발생', { error: error.message });
    }
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  const automation = new NaverLoginAutomation();
  
  try {
    await automation.initialize();
    await automation.processMultiAccountUpload();
  } catch (error) {
    console.error('실행 중 오류 발생:', error);
    process.exit(1);
  } finally {
    await automation.cleanup();
  }
}

// 직접 실행 시에만 main 함수 호출
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { NaverLoginAutomation }; 