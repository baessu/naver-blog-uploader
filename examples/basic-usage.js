import { NaverLoginAutomation } from '../src/index.js';

/**
 * 기본 사용 예제
 * 네이버 로그인 자동화의 기본적인 사용법을 보여줍니다.
 */
async function basicUsageExample() {
  const automation = new NaverLoginAutomation();
  
  try {
    console.log('=== 기본 사용 예제 시작 ===');
    
    // 1. 브라우저 초기화 (브라우저 화면 표시, 천천히 실행)
    await automation.initialize({
      headless: false,
      slowMo: 500
    });
    
    // 2. 환경변수에서 로그인 정보 로드하여 로그인
    const success = await automation.login();
    
    if (success) {
      console.log('✅ 로그인 성공!');
      
      // 3. 로그인 후 추가 작업 예시
      console.log('📋 로그인 후 5초간 대기...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 4. 스크린샷 캡처 (성공 기념)
      const screenshotPath = await automation.captureScreenshot('login-success');
      console.log(`📸 성공 스크린샷 저장: ${screenshotPath}`);
      
    } else {
      console.log('❌ 로그인 실패');
    }
    
  } catch (error) {
    console.error('💥 오류 발생:', error.message);
    
    // 에러 발생 시 스크린샷 캡처
    try {
      const errorScreenshot = await automation.captureScreenshot('error-example');
      console.log(`📸 에러 스크린샷 저장: ${errorScreenshot}`);
    } catch (screenshotError) {
      console.error('스크린샷 캡처 실패:', screenshotError.message);
    }
    
  } finally {
    // 5. 리소스 정리 (항상 실행)
    await automation.cleanup();
    console.log('=== 기본 사용 예제 완료 ===');
  }
}

// 직접 실행된 경우에만 예제 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  basicUsageExample().catch(error => {
    console.error('예제 실행 실패:', error);
    process.exit(1);
  });
} 