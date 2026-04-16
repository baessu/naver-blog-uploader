import { NaverLoginAutomation } from '../src/index.js';

/**
 * 블로그 워크플로우 예제
 * 로그인부터 블로그 글쓰기까지의 전체 프로세스를 보여줍니다.
 */
async function blogWorkflowExample() {
  const automation = new NaverLoginAutomation();
  
  try {
    console.log('=== 네이버 블로그 워크플로우 예제 시작 ===');
    
    // 1. 브라우저 초기화 (화면 표시, 느린 실행)
    await automation.initialize({
      headless: false,
      slowMo: 800
    });
    
    // 2. 전체 워크플로우 실행 (로그인 + 블로그 이동)
    console.log('🚀 전체 워크플로우 실행 중...');
    const workflowSuccess = await automation.loginAndNavigateToBlog(null, null, {
      login: {
        timeout: 30000,
        waitForNavigation: true
      },
      blog: {
        timeout: 30000,
        waitForEditor: true
      }
    });
    
    if (workflowSuccess) {
      console.log('✅ 워크플로우 성공! 블로그 글쓰기 페이지에 도착했습니다.');
      
      // 3. 현재 페이지 정보 확인
      const pageInfo = automation.getCurrentPageInfo();
      console.log('📋 현재 페이지 정보:', pageInfo);
      
      // 4. 예시 글 제목 입력
      const exampleTitles = [
        '자동화로 만든 첫 번째 글',
        `오늘의 일기 - ${new Date().toLocaleDateString('ko-KR')}`,
        'Playwright와 함께하는 블로그 자동화',
        '기술 블로그 시작하기'
      ];
      
      const selectedTitle = exampleTitles[Math.floor(Math.random() * exampleTitles.length)];
      
      console.log(`📝 제목 입력 시도: "${selectedTitle}"`);
      
      try {
        const titleSuccess = await automation.enterBlogTitle(selectedTitle);
        
        if (titleSuccess) {
          console.log('✅ 제목 입력 성공!');
          
          // 성공 스크린샷 캡처
          const screenshotPath = await automation.captureScreenshot('blog-title-success');
          console.log(`📸 성공 스크린샷 저장: ${screenshotPath}`);
          
        } else {
          console.log('❌ 제목 입력 실패');
        }
        
      } catch (titleError) {
        console.error('제목 입력 중 오류:', titleError.message);
        
        // 에러 스크린샷 캡처
        try {
          const errorScreenshot = await automation.captureScreenshot('blog-title-error');
          console.log(`📸 에러 스크린샷 저장: ${errorScreenshot}`);
        } catch (screenshotError) {
          console.error('스크린샷 캡처 실패:', screenshotError.message);
        }
      }
      
      // 5. 사용자 확인을 위한 대기
      console.log('🕐 결과 확인을 위해 15초간 대기합니다...');
      console.log('💡 이 시간 동안 브라우저에서 결과를 확인해보세요!');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
    } else {
      console.log('❌ 워크플로우 실패');
    }
    
  } catch (error) {
    console.error('💥 워크플로우 실행 중 오류:', error.message);
    
    // 에러 타입별 맞춤 안내
    if (error.message.includes('로그인')) {
      console.error('💡 해결 방법:');
      console.error('   - .env 파일에 올바른 네이버 계정 정보가 설정되어 있는지 확인하세요');
      console.error('   - 2단계 인증이 활성화되어 있다면 일시적으로 비활성화 해보세요');
      console.error('   - 캡차가 나타나는 경우 잠시 후 다시 시도해보세요');
    } else if (error.message.includes('블로그')) {
      console.error('💡 해결 방법:');
      console.error('   - 네이버 블로그 서비스가 활성화되어 있는지 확인하세요');
      console.error('   - 페이지 구조가 변경되었을 수 있으니 셀렉터를 업데이트해보세요');
    }
    
    // 에러 발생 시 스크린샷 캡처
    try {
      const errorScreenshot = await automation.captureScreenshot('workflow-error');
      console.log(`📸 에러 스크린샷 저장: ${errorScreenshot}`);
    } catch (screenshotError) {
      console.error('스크린샷 캡처 실패:', screenshotError.message);
    }
    
  } finally {
    // 6. 리소스 정리
    await automation.cleanup();
    console.log('=== 블로그 워크플로우 예제 완료 ===');
  }
}

/**
 * 단계별 블로그 워크플로우 예제
 * 각 단계를 분리하여 더 세밀한 제어를 보여줍니다.
 */
async function stepByStepBlogExample() {
  const automation = new NaverLoginAutomation();
  
  try {
    console.log('=== 단계별 블로그 워크플로우 예제 시작 ===');
    
    // 단계 1: 브라우저 초기화
    console.log('1️⃣ 브라우저 초기화');
    await automation.initialize({
      headless: false,
      slowMo: 500
    });
    
    // 단계 2: 로그인
    console.log('2️⃣ 네이버 로그인');
    const loginSuccess = await automation.login();
    
    if (!loginSuccess) {
      throw new Error('로그인 실패로 워크플로우를 중단합니다.');
    }
    
    console.log('✅ 로그인 성공, 5초 대기...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 단계 3: 블로그 글쓰기 페이지 이동
    console.log('3️⃣ 블로그 글쓰기 페이지 이동');
    const blogSuccess = await automation.navigateToBlogWrite({
      timeout: 30000,
      waitForEditor: true
    });
    
    if (!blogSuccess) {
      throw new Error('블로그 페이지 이동 실패');
    }
    
    console.log('✅ 블로그 페이지 이동 성공, 3초 대기...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 단계 4: 제목 입력
    console.log('4️⃣ 블로그 글 제목 입력');
    const timestamp = new Date().toLocaleString('ko-KR');
    const title = `단계별 워크플로우 테스트 - ${timestamp}`;
    
    const titleSuccess = await automation.enterBlogTitle(title);
    
    if (titleSuccess) {
      console.log('✅ 제목 입력 성공!');
    } else {
      console.log('⚠️ 제목 입력 완료하지 못함');
    }
    
    // 단계 5: 최종 결과 확인
    console.log('5️⃣ 최종 결과 확인');
    const finalPageInfo = automation.getCurrentPageInfo();
    console.log('📋 최종 페이지 정보:', finalPageInfo);
    
    // 최종 스크린샷
    const finalScreenshot = await automation.captureScreenshot('final-result');
    console.log(`📸 최종 스크린샷: ${finalScreenshot}`);
    
    console.log('🎉 모든 단계 완료!');
    console.log('⏳ 10초 후 브라우저를 종료합니다...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('💥 단계별 워크플로우 실행 중 오류:', error.message);
    throw error;
    
  } finally {
    await automation.cleanup();
    console.log('=== 단계별 블로그 워크플로우 예제 완료 ===');
  }
}

// 직접 실행된 경우 예제 선택
if (import.meta.url === `file://${process.argv[1]}`) {
  const exampleType = process.argv[2] || 'full';
  
  if (exampleType === 'step') {
    stepByStepBlogExample().catch(error => {
      console.error('단계별 예제 실행 실패:', error);
      process.exit(1);
    });
  } else {
    blogWorkflowExample().catch(error => {
      console.error('전체 워크플로우 예제 실행 실패:', error);
      process.exit(1);
    });
  }
} 