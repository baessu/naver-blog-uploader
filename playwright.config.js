import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

/**
 * Playwright 테스트 설정
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* 각 테스트의 최대 실행 시간 */
  timeout: 30 * 1000,
  expect: {
    /* 각 expect()의 최대 대기 시간 */
    timeout: 5000
  },
  /* 병렬 실행 설정 */
  fullyParallel: true,
  /* CI에서 실패 시 재시도 방지 */
  forbidOnly: !!process.env.CI,
  /* CI에서 재시도 횟수 */
  retries: process.env.CI ? 2 : 0,
  /* 병렬 워커 수 */
  workers: process.env.CI ? 1 : undefined,
  /* 리포터 설정 */
  reporter: 'html',
  /* 모든 프로젝트에 공통으로 적용되는 설정 */
  use: {
    /* 네트워크 활동 추적 */
    trace: 'on-first-retry',
    /* 스크린샷 설정 */
    screenshot: 'only-on-failure',
    /* 비디오 녹화 설정 */
    video: 'retain-on-failure',
    /* 브라우저 컨텍스트 설정 */
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul'
  },

  /* 다양한 브라우저 환경에서 테스트 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }
  ],

  /* 로컬 개발 서버 설정 (필요한 경우) */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
}); 