#!/usr/bin/env node

/**
 * Exact replication of Agent_blog_upload logic
 * Multi-account blog automation with real-time logging
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Use global fetch if available, otherwise fallback
const fetch = globalThis.fetch || (async () => {
    throw new Error('fetch not available');
});

import { chromium } from 'playwright';
import dotenv from 'dotenv';

// 현재 작업 디렉토리의 .env 파일을 로드 (없으면 조용히 패스)
dotenv.config();

/**
 * Exact replication of MarkdownToBlogOptimized class from Agent_blog_upload
 */
class AgentBlogUploadReplication {
    constructor(contentMappings = null) {
        this.page = null;
        this.frame = null;
        this.currentFormats = new Set(); // Format state tracking (exact from Agent_blog_upload)
        this.appliedElements = new Set(); // 중복 방지
        this.browser = null;
        this.contentMappings = contentMappings; // Store user's account assignments
        
        // 로그인 성공 감지를 위한 공통 셀렉터들
        this.LOGIN_SUCCESS_SELECTORS = [
            '.gnb_header',
            '#gnb_my',
            '.service_area',
            '.my_area',
            'button.btn_talk'
        ];
        
        // 환경변수 기반 멀티 계정 구성 (NAVER_USERNAME, NAVER_USERNAME_2 ~ _9)
        this.accounts = this.buildAccountsFromEnv();
        
        this.currentAccountIndex = 0;
        this.currentAccountPostCount = 0;
        this.totalProcessedPosts = 0;
        this.totalSuccessfulPosts = 0;
        this.totalFailedPosts = 0;
        this.accountStats = [];
        this.currentFolderPath = null;
    }

    // Fast race: URL change or success elements within given ms
    async waitForNavigationOrSuccess(timeoutMs = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const url = this.page.url();
                if (url.includes('naver.com') && !url.includes('nidlogin')) return true;
                const successSelectors = ['.gnb_header', '#gnb_my', '.service_area', '.my_area'];
                for (const sel of successSelectors) {
                    const el = await this.page.$(sel);
                    if (el) return true;
                }
            } catch {}
            await this.page.waitForTimeout(300);
        }
        return false;
    }
    async closeWritePagePopups() {
        try {
            this.log('🧹 글쓰기 페이지 팝업 정리 시작...');
            // ESC로 닫히는 오버레이 우선 처리
            for (let i = 0; i < 2; i++) {
                try { await this.page.keyboard.press('Escape'); } catch {}
                await this.page.waitForTimeout(150);
            }

            const contexts = [this.page, this.frame].filter(Boolean);

            // 0) 고정/정확 셀렉터 우선 처리 (사용자 제공)
            const fixedSelectors = [
                'button.se-popup-button.se-popup-button-cancel',
                '.se-popup-button.se-popup-button-cancel',
                'button.se-help-panel-close-button',
                '.se-help-panel-close-button'
            ];
            for (const ctx of contexts) {
                for (const sel of fixedSelectors) {
                    try {
                        const btns = await ctx.$$(sel);
                        if (btns && btns.length > 0) {
                            for (const b of btns) {
                                try { await b.click({ delay: 10 }); } catch {}
                            }
                            this.log(`  ✅ 고정 셀렉터 클릭: ${sel} (총 ${btns.length}개)`);
                            await this.page.waitForTimeout(120);
                        }
                    } catch {}
                }
            }

            // 1) 사용자 제공 정확 셀렉터 우선 클릭 (임시작성글 팝업 취소)
            const exactCancelSelector = '#SE-4dbbd810-825a-44c8-a9af-09f1cbe3783e > div.se-wrap.se-dnd-wrap > div > div.se-popup.__se-sentry.se-popup-alert.se-popup-alert-confirm > div.se-popup-container.__se-pop-layer > div.se-popup-button-container > button.se-popup-button.se-popup-button-cancel';
            for (const ctx of contexts) {
                try {
                    const btn = await ctx.$(exactCancelSelector);
                    if (btn) {
                        await btn.click();
                        this.log('  ✅ 임시작성글 팝업 취소 버튼 클릭 (정확 셀렉터)');
                        await this.page.waitForTimeout(150);
                    }
                } catch {}
            }

            // 요청에 따라 컨테이너 스캔 기반 정리는 제거

            // 에디터 영역 포커스 복구
            try {
                await this.page.click('.se-component, .se-main-container, .se_editArea', { timeout: 1500 });
                await this.page.waitForTimeout(150);
            } catch {}
            this.log('✅ 팝업 정리 완료');
        } catch (e) {
            this.log(`⚠️ 팝업 정리 중 오류: ${e.message}`);
        }
    }
    async ensureReadyContentExists(contentId) {
        try {
            const actualName = contentId.startsWith('review_') ? contentId.replace('review_', '') : contentId;
            const readyPath = path.join('files/ready', actualName);
            try {
                await fs.access(readyPath);
                this.log(`📁 ready 폴더에 이미 준비됨: ${actualName}`);
                return actualName;
            } catch {}

            // Try to locate in review tree and copy to ready
            const sourcePath = await this.findContentInDateBasedStructure(actualName);
            if (sourcePath) {
                this.log(`📋 review → ready 복사: ${actualName}`);
                await this.copyReviewToReady(actualName, sourcePath, readyPath);
                return actualName;
            }

            this.log(`❌ review 트리에서 콘텐츠를 찾지 못했습니다: ${actualName}`);
            return null;
        } catch (err) {
            this.log(`❌ 콘텐츠 준비 중 오류: ${err.message}`);
            return null;
        }
    }
    /**
     * 환경변수로부터 계정 목록을 구성
     *   NAVER_USERNAME / NAVER_PASSWORD                → account_1
     *   NAVER_USERNAME_2 ~ _9 / NAVER_PASSWORD_2 ~ _9   → account_2 ~ _9
     *   NAVER_BLOG_URL   / NAVER_BLOG_URL_2 ~ _9        → 각 계정의 글쓰기 URL (선택)
     */
    buildAccountsFromEnv() {
        const accounts = [];
        const makeBlogUrl = (id) =>
            id ? `https://blog.naver.com/${id}?Redirect=Write&` : undefined;

        const first = {
            id: process.env.NAVER_USERNAME || process.env.NAVER_ID_1,
            password: process.env.NAVER_PASSWORD || process.env.NAVER_PASSWORD_1,
        };
        if (first.id && first.password) {
            accounts.push({
                ...first,
                blogUrl: process.env.NAVER_BLOG_URL || makeBlogUrl(first.id),
                maxPosts: parseInt(process.env.POSTS_PER_ACCOUNT || '7'),
                name: '계정 1',
                displayName: first.id,
                accountId: 'account_1',
            });
        }

        for (let i = 2; i <= 9; i++) {
            const id = process.env[`NAVER_USERNAME_${i}`] || process.env[`NAVER_ID_${i}`];
            const password = process.env[`NAVER_PASSWORD_${i}`];
            if (!id || !password) continue;
            accounts.push({
                id,
                password,
                blogUrl: process.env[`NAVER_BLOG_URL_${i}`] || makeBlogUrl(id),
                maxPosts: parseInt(process.env.POSTS_PER_ACCOUNT || '7'),
                name: `계정 ${i}`,
                displayName: id,
                accountId: `account_${i}`,
            });
        }

        return accounts;
    }

    /**
     * 웹 UI 매핑에서 전달된 식별자로 계정을 찾음.
     * 허용되는 식별자: accountId(`account_1`, `account_2` …), 네이버 로그인 ID, displayName
     */
    resolveAccount(identifier) {
        if (!identifier) return null;
        const id = String(identifier).trim().toLowerCase();

        for (const acc of this.accounts) {
            const candidates = [acc.accountId, acc.id, acc.displayName, acc.name]
                .filter(Boolean)
                .map(v => String(v).trim().toLowerCase());
            if (candidates.includes(id)) return acc;
        }

        return null;
    }

    // Real-time logging function
    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
        
        // Send to webpage via HTTP POST
        this.sendLogToWebUI(message, type, timestamp);
    }

    async sendLogToWebUI(message, type = 'info', timestamp = null) {
        try {
            const logData = {
                message,
                type,
                timestamp: timestamp || new Date().toISOString()
            };

            // Send to local dashboard
            await fetch('http://localhost:3000/api/upload/logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(logData)
            }).catch(error => {
                // Silently fail if dashboard is not available
                console.log(`[DEBUG] Failed to send log to UI: ${error.message}`);
            });
        } catch (error) {
            // Silently fail - don't interrupt the main process
        }
    }

    async run() {
        this.log('📝 마크다운 → 블로그 멀티계정 최적화 업로드 시작...', 'start');
        
        try {
            this.browser = await chromium.launch({
                headless: false,
                slowMo: 100,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });
            
            this.page = await this.browser.newPage({
                viewport: { width: 1280, height: 720 },
                locale: 'ko-KR',
                timezoneId: 'Asia/Seoul'
            });

            // Set user agent
            await this.page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            // Check if we have specific content mappings from user selection
            if (this.contentMappings && this.contentMappings.length > 0) {
                this.log(`📋 사용자 지정 계정 할당 모드: ${this.contentMappings.length}개 항목`);
                
                // Group content by account
                const accountGroups = new Map();
                this.contentMappings.forEach(mapping => {
                    if (!accountGroups.has(mapping.account_id)) {
                        accountGroups.set(mapping.account_id, []);
                    }
                    accountGroups.get(mapping.account_id).push(mapping.content_id);
                });
                
                // Process each account group
                for (const [accountId, contentIds] of accountGroups) {
                    const account = this.resolveAccount(accountId);
                    if (!account) {
                        this.log(`❌ 계정을 찾을 수 없음: ${accountId}`);
                        continue;
                    }
                    
                    this.log(`🔄 ${account.name}으로 ${contentIds.length}개 콘텐츠 업로드 시작...`);
                    this.currentAccountIndex = this.accounts.indexOf(account);
                    this.currentAccountPostCount = 0;
                    
                    await this.processWithSpecificContent(account, contentIds);
                    
                    this.accountStats.push({
                        name: account.name,
                        id: account.id,
                        postsCount: this.currentAccountPostCount,
                        maxPosts: account.maxPosts
                    });
                    
                    this.totalProcessedPosts += this.currentAccountPostCount;
                    this.log(`✅ ${account.name} 처리 완료 (${this.currentAccountPostCount}개 글 작성)`);
                }
            } else {
                // Fallback to original logic if no content mappings provided
                const allFolders = await this.getAllReadyFolders();
                if (allFolders.length === 0) {
                    this.log('📁 처리할 폴더가 없습니다.');
                    await this.browser.close();
                    return;
                }
                
                this.log(`📂 총 ${allFolders.length}개 폴더 발견`);
                this.log(`👥 ${this.accounts.length}개 계정으로 분산 업로드 예정`);
                
                // Process each account sequentially (exact Agent_blog_upload logic)
                for (let accountIndex = 0; accountIndex < this.accounts.length; accountIndex++) {
                    const account = this.accounts[accountIndex];
                    this.currentAccountIndex = accountIndex;
                    this.currentAccountPostCount = 0;
                    
                    // Check remaining folders
                    const remainingFolders = await this.getAllReadyFolders();
                    if (remainingFolders.length === 0) {
                        this.log(`✅ 모든 폴더 처리 완료!`);
                        break;
                    }
                    
                    this.log(`🔄 ${account.name} 계정으로 전환...`);
                    
                    // Process with account
                    await this.processWithAccount(account, Math.min(account.maxPosts, remainingFolders.length));
                    
                    // Account stats
                    this.accountStats.push({
                        name: account.name,
                        id: account.id,
                        postsCount: this.currentAccountPostCount,
                        maxPosts: account.maxPosts
                    });
                    
                    this.totalProcessedPosts += this.currentAccountPostCount;
                    this.log(`✅ ${account.name} 처리 완료 (${this.currentAccountPostCount}개 글 작성)`);
                }
            }
            
            // Final statistics
            if (this.totalSuccessfulPosts > 0) {
                this.log('🎉 블로그 글 작성이 완료되었습니다!');
                this.log(`📝 총 ${this.totalProcessedPosts}개 글 처리, 성공 ${this.totalSuccessfulPosts}개, 실패 ${this.totalFailedPosts}개`);
            } else {
                this.log('🔚 모든 계정 처리 종료');
                this.log(`📊 처리 결과: 성공 0개, 실패 ${this.totalFailedPosts}개`);
            }
            
            this.accountStats.forEach((stat, index) => {
                const percentage = Math.round((stat.postsCount / stat.maxPosts) * 100);
                this.log(`  ${index + 1}. ${stat.name}: ${stat.postsCount}/${stat.maxPosts}개 (${percentage}%)`);
            });
            
            this.log('📱 브라우저를 10초 후 종료합니다...');
            await this.page.waitForTimeout(10000);
            
            await this.browser.close();
            
        } catch (error) {
            this.log(`❌ 전체 프로세스 중 오류: ${error.message}`, 'error');
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    async processWithAccount(account, maxPostsForThisAccount) {
        try {
            // Use built-in login method instead of external service
            this.log(`🔐 ${account.name} 로그인 중...`);
            await this.performNaverLogin(account.id, account.password);
            
            // Setup iframe after login
            await this.setupIframe();
            
            // Process folders for this account - pass null for blogService
            await this.processAllReadyFoldersForAccount(null, account, maxPostsForThisAccount);
            
            // Logout for next account
            if (this.currentAccountIndex < this.accounts.length - 1) {
                await this.logoutCurrentAccount();
            }
            
        } catch (error) {
            this.log(`❌ ${account.name} 처리 중 오류: ${error.message}`, 'error');
        }
    }

    async logoutCurrentAccount() {
        try {
            this.log('🚪 현재 계정 로그아웃 중...');
            
            // Safe logout processing - create new context
            this.log('🔄 새로운 브라우저 컨텍스트로 세션 초기화...');
            
            // Close existing page safely
            try {
                if (this.page && !this.page.isClosed()) {
                    await this.page.close();
                }
            } catch (closeError) {
                this.log(`⚠️ 기존 페이지 닫기 시 오류 (무시): ${closeError.message}`);
            }
            
            // Create new page
            this.page = await this.browser.newPage({
                viewport: { width: 1280, height: 720 },
                locale: 'ko-KR'
            });
            
            // Navigate to Naver main page to verify session state
            await this.page.goto('https://www.naver.com', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            await this.page.waitForTimeout(2000);
            
            this.log('✅ 새로운 세션으로 초기화 완료');
            
        } catch (error) {
            this.log(`⚠️ 계정 전환 실패: ${error.message}`);
            
            // Last resort: create completely new page
            try {
                this.page = await this.browser.newPage({
                    viewport: { width: 1280, height: 720 },
                    locale: 'ko-KR'
                });
                this.log('✅ 응급 페이지 생성 완료');
            } catch (emergencyError) {
                this.log(`❌ 응급 페이지 생성도 실패: ${emergencyError.message}`, 'error');
                throw emergencyError;
            }
        }
    }

    async processWithSpecificContent(account, contentIds) {
        try {
            // Use built-in login method instead of external service
            this.log(`🔐 ${account.name} 로그인 중...`);
            await this.performNaverLogin(account.id, account.password);
            
            // Setup iframe after login
            await this.setupIframe();
            
            // Process specific content IDs for this account - pass null for blogService
            await this.processSpecificContentForAccount(null, account, contentIds);
            
        } catch (error) {
            this.log(`❌ ${account.name} 처리 중 오류: ${error.message}`, 'error');
        }
    }

    async performNaverLogin(username, password) {
        try {
            this.log('🌐 네이버 로그인 페이지로 이동...');
            await this.page.goto('https://nid.naver.com/nidlogin.login');
            await this.page.waitForTimeout(2000);

            this.log('📝 아이디 입력...');
            await this.page.fill('#id', username);
            await this.page.waitForTimeout(1000);

            this.log('🔑 비밀번호 입력...');
            await this.page.fill('#pw', password);
            await this.page.waitForTimeout(1000);

            // 1) 첫 화면은 캡차가 없다고 가정 → 즉시 로그인 버튼 클릭
            this.log('🔘 로그인 버튼 클릭...');
            const loginButtonSelectors = ['#log\\.login', 'button#log\\.login', '.btn_login'];
            let clicked = false;
            for (const sel of loginButtonSelectors) {
                try {
                    await this.page.click(sel, { timeout: 1200 });
                    this.log(`✅ 로그인 버튼 클릭 성공 (${sel})`);
                    clicked = true;
                    break;
                } catch {}
            }
            if (!clicked) {
                // 최후: form submit
                try { await this.page.keyboard.press('Enter'); this.log('↩️ Enter로 로그인 시도'); } catch {}
            }
            await this.page.waitForTimeout(1000);

            // 2) 다음 화면에서 캡차 유무 재검사
            const captchaDetected = await this.handleCaptchaIfPresent();

            if (captchaDetected) {
                // 캡차 입력 후 동일 버튼 클릭하면 즉시 성공 판정 단계로
                this.log('👆 캡차 입력 후 다시 로그인 버튼을 클릭해주세요...');
                this.log('⏰ 로그인 버튼 클릭을 60초 동안 대기합니다...');
                await this.waitForUserLoginClick();
                await this.waitForNavigationOrSuccess(12000);
            } else {
                // 캡차가 없으면 즉시 성공 판정으로
                await this.waitForNavigationOrSuccess(8000);
            }

            // 로그인 후 추가 캡차 또는 인증 처리
            await this.handlePostLoginVerification();

            // Wait for login completion - 더 유연한 URL 패턴 사용
            this.log('⏳ 로그인 완료 대기...');
            // URL 패턴 매칭은 건너뛰고 바로 성공 지표로 판단
            await this.waitForLoginSuccess();
            
            // 추가 안정화 대기시간
            this.log('⏳ 로그인 후 안정화 대기...');
            await this.page.waitForTimeout(500); // 0.5초로 추가 단축
            
            this.log('✅ 네이버 로그인 완료!');
        } catch (error) {
            this.log(`❌ 네이버 로그인 실패: ${error.message}`, 'error');
            throw error;
        }
    }

    async handleCaptchaIfPresent() {
        try {
            this.log('🔍 캡차 존재 여부 확인 중...');
            
            // 정확한 캡차 판단: message_text 엘리먼트 확인
            let captchaFound = false;
            
            try {
                const messageElement = await this.page.$('span.message_text');
                if (messageElement) {
                    const messageText = await messageElement.textContent();
                    this.log(`📝 메시지 텍스트 확인: "${messageText}"`);
                    
                    // "자동입력 방지 문자를 잘못 입력했습니다" 메시지 확인
                    if (messageText && messageText.includes('자동입력 방지 문자')) {
                        captchaFound = true;
                        this.log('🛡️ 캡차 오류 메시지 감지! 캡차 입력이 필요합니다.');
                    }
                }
            } catch (e) {
                this.log('📝 message_text 엘리먼트 없음 (정상)');
            }

            // 추가 캡차 요소 확인 (백업 방법)
            if (!captchaFound) {
                const captchaSelectors = [
                    '#captcha_img',
                    '.captcha_img', 
                    '#captcha',
                    '.captcha',
                    'img[src*="captcha"]',
                    'input[name="captcha"]',
                    'input[placeholder*="자동입력방지"]',
                    'input[placeholder*="보안문자"]',
                    'input[id*="captcha"]',
                    'input[class*="captcha"]'
                ];

                for (const selector of captchaSelectors) {
                    const element = await this.page.$(selector);
                    if (element) {
                        captchaFound = true;
                        this.log(`🛡️ 캡차 요소 감지! (셀렉터: ${selector})`);
                        break;
                    }
                }
            }

            if (captchaFound) {
                this.log('⏰ 캡차를 수동으로 입력해주세요...');
                this.log('📌 캡차 입력 완료 후 준비가 되면 다음 단계로 진행합니다.');
                this.log('🖼️ 브라우저 창을 확인하여 캡차 이미지를 보고 입력하세요.');
                
                // 캡차 입력을 위한 시간 제공 (60초)
                await this.page.waitForTimeout(60000);
                
                this.log('✅ 캡차 입력 시간 완료');
            } else {
                this.log('✅ 캡차가 감지되지 않았습니다.');
            }

            return captchaFound;
        } catch (error) {
            this.log(`⚠️ 캡차 확인 중 오류 (무시됨): ${error.message}`);
            return false;
        }
    }

    async waitForUserLoginClick() {
        try {
            this.log('🎯 로그인 버튼 클릭 감지 대기 중...');
            
            // 로그인 버튼 클릭을 감지하기 위한 여러 방법
            let loginClicked = false;
            let attempts = 0;
            const maxAttempts = 5; // 30초 대기 (1초씩 30번 체크로 단축)

            while (!loginClicked && attempts < maxAttempts) {
                try {
                    // 방법 1: URL 변경 감지
                    const currentUrl = this.page.url();
                    if (!currentUrl.includes('nidlogin.login')) {
                        loginClicked = true;
                        this.log('✅ 로그인 버튼 클릭 감지됨! (URL 변경)');
                        break;
                    }

                    // 방법 2: 로딩 스피너나 로그인 중 상태 감지
                    const loadingSelectors = [
                        '.loading',
                        '.spinner',
                        '[class*="loading"]',
                        '[class*="spinner"]'
                    ];

                    for (const selector of loadingSelectors) {
                        const element = await this.page.$(selector);
                        if (element) {
                            loginClicked = true;
                            this.log('✅ 로그인 버튼 클릭 감지됨! (로딩 상태 감지)');
                            break;
                        }
                    }

                    // 방법 3: 로그인 성공 요소 감지
                    for (const selector of this.LOGIN_SUCCESS_SELECTORS) {
                        const element = await this.page.$(selector);
                        if (element) {
                            // btn_talk인 경우 내부 텍스트가 "톡"인지 확인해 신뢰도 강화
                            if (selector === 'button.btn_talk') {
                                const blind = await this.page.$('button.btn_talk .blind');
                                const txt = blind ? (await blind.textContent() || '').trim() : '';
                                if (txt !== '톡') continue;
                            }
                            loginClicked = true;
                            this.log('✅ 로그인 성공 감지됨!');
                            break;
                        }
                    }

                } catch (e) {
                    // 개별 체크 실패는 무시
                }

                if (!loginClicked) {
                    await this.page.waitForTimeout(1000);
                    attempts++;
                    
                    // 5초마다 안내 메시지 출력
                    if (attempts % 5 === 0) {
                        this.log(`⏰ 로그인 버튼 클릭 대기 중... (${attempts}초 경과)`);
                    }
                }
            }

            if (!loginClicked) {
                this.log('⚠️ 로그인 버튼 클릭을 감지하지 못했습니다. 계속 진행합니다...');
            }

        } catch (error) {
            this.log(`⚠️ 로그인 버튼 클릭 대기 중 오류: ${error.message}`);
        }
    }

    async handlePostLoginVerification() {
        try {
            // 로그인 후 추가 인증 요소들 확인
            const verificationSelectors = [
                '#new_captcha_img',
                '.verification_code',
                '#sms_confirm',
                '#email_confirm',
                'input[placeholder*="인증"]',
                'input[placeholder*="확인"]',
                'input[placeholder*="보안문자"]'
            ];

            let verificationFound = false;
            for (const selector of verificationSelectors) {
                const element = await this.page.$(selector);
                if (element) {
                    verificationFound = true;
                    this.log('🔐 추가 인증이 필요합니다!');
                    break;
                }
            }

            if (verificationFound) {
                this.log('⏰ 추가 인증을 완료해주세요. 10초 동안 대기합니다...');
                await this.page.waitForTimeout(10000);
                this.log('✅ 추가 인증 대기 완료');
            }
        } catch (error) {
            this.log(`⚠️ 추가 인증 확인 중 오류 (무시됨): ${error.message}`);
        }
    }

    async waitForLoginSuccess() {
        try {
            // 로그인 성공을 나타내는 여러 지표 확인
            this.log('🔍 로그인 성공 지표 확인 중...');
            
            let loginSuccess = false;
            let attempts = 0;
            const maxAttempts = 6; // 더 과감히 단축

            while (!loginSuccess && attempts < maxAttempts) {
                try {
                    const currentUrl = this.page.url();
                    
                    // URL 기반 성공 확인
                    if (currentUrl.includes('naver.com') && !currentUrl.includes('nidlogin')) {
                        loginSuccess = true;
                        this.log('✅ 로그인 성공 확인됨! (URL 변경 감지)');
                        break;
                    }
                    
            // DOM 요소 기반 성공 확인
            for (const selector of this.LOGIN_SUCCESS_SELECTORS) {
                const element = await this.page.$(selector);
                if (element) {
                    if (selector === 'button.btn_talk') {
                        const blind = await this.page.$('button.btn_talk .blind');
                        const txt = blind ? (await blind.textContent() || '').trim() : '';
                        if (txt !== '톡') continue;
                    }
                    loginSuccess = true;
                    this.log('✅ 로그인 성공 확인됨! (헤더/톡 버튼 감지)');
                    break;
                }
                    }
                } catch (e) {
                    // 개별 지표 확인 실패는 무시
                }
                
                if (!loginSuccess) {
                    await this.page.waitForTimeout(250); // 체크 주기 추가 단축
                    attempts++;
                    this.log(`🔄 로그인 확인 재시도 (${attempts}/${maxAttempts})`);
                }
            }

            if (!loginSuccess) {
                throw new Error('로그인 성공을 확인할 수 없습니다');
            }
        } catch (error) {
            this.log(`⚠️ 로그인 성공 확인 실패: ${error.message}`);
            throw error;
        }
    }

    async processSpecificContentForAccount(blogService, account, contentIds) {
        try {
            this.log(`📂 ${account.name}이 처리할 ${contentIds.length}개 콘텐츠: ${contentIds.join(', ')}`);
            
            for (let i = 0; i < contentIds.length; i++) {
                const contentId = contentIds[i];
                this.log(`🚀 [${i + 1}/${contentIds.length}] "${contentId}" 콘텐츠 처리 시작...`);
                // Ensure content is prepared in files/ready
                const preparedName = await this.ensureReadyContentExists(contentId);
                if (!preparedName) {
                    this.log(`❌ 콘텐츠 준비 실패: ${contentId}`);
                    continue;
                }

                // Navigate to write page (first post) or create new post
                if (i === 0) {
                    await this.goToWritePage(account.blogUrl);
                } else {
                    await this.createNewPost();
                }
                
                // Process single content - pass blogService
                const success = await this.processSingleFolder(preparedName, blogService);
                
                if (success) {
                    // Move completed folder to done
                    await this.moveCompletedFolder(contentId);
                    this.currentAccountPostCount++;
                    this.totalSuccessfulPosts++;
                    this.log(`✅ [${i + 1}/${contentIds.length}] "${contentId}" 처리 완료 및 done 폴더로 이동`);
                } else {
                    this.totalFailedPosts++;
                    this.log(`❌ [${i + 1}/${contentIds.length}] "${contentId}" 처리 실패`);
                }
                
                // Wait before next post
                if (i < contentIds.length - 1) {
                    this.log('⏳ 다음 글 작성을 위해 3초 대기...');
                    await this.page.waitForTimeout(3000);
                }
            }
            
        } catch (error) {
            this.log(`❌ ${account.name} 콘텐츠 처리 중 오류: ${error.message}`, 'error');
        }
    }

    async processAllReadyFoldersForAccount(blogService, account, maxPosts) {
        try {
            // Get all ready folders (limited by max posts)
            const allReadyFolders = await this.getAllReadyFolders();
            const readyFolders = allReadyFolders.slice(0, maxPosts);
            
            if (readyFolders.length === 0) {
                this.log('📁 현재 계정이 처리할 폴더가 없습니다.');
                return;
            }
            
            this.log(`📂 ${account.name}이 처리할 ${readyFolders.length}개 폴더: ${readyFolders.join(', ')}`);
            
            for (let i = 0; i < readyFolders.length; i++) {
                const folderName = readyFolders[i];
                this.log(`🚀 [${i + 1}/${readyFolders.length}] "${folderName}" 폴더 처리 시작...`);
                
                // Navigate to write page (first post) or create new post
                if (i === 0) {
                    await this.goToWritePage(account.blogUrl);
                } else {
                    await this.createNewPost();
                }
                
                // Process single folder - pass blogService
                const success = await this.processSingleFolder(folderName, blogService);
                
                if (success) {
                    // Move completed folder to done
                    await this.moveCompletedFolder(folderName);
                    this.currentAccountPostCount++;
                    this.log(`✅ [${i + 1}/${readyFolders.length}] "${folderName}" 처리 완료 및 done 폴더로 이동`);
                } else {
                    this.log(`❌ [${i + 1}/${readyFolders.length}] "${folderName}" 처리 실패`);
                }
                
                // Wait before next post
                if (i < readyFolders.length - 1) {
                    this.log('⏳ 다음 글 작성을 위해 3초 대기...');
                    await this.page.waitForTimeout(3000);
                }
            }
            
        } catch (error) {
            this.log(`❌ ${account.name} 폴더 처리 중 오류: ${error.message}`, 'error');
        }
    }

    async goToWritePage(blogUrl = null) {
        try {
            // Use current account's blog URL
            const targetUrl = blogUrl || this.accounts[this.currentAccountIndex].blogUrl;
            this.log(`📝 글쓰기 페이지로 이동... (${targetUrl})`);
            
            await this.page.goto(targetUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            await this.setupIframe();
            // 글쓰기 진입 팝업/도움말 닫기
            await this.closeWritePagePopups();
            
        } catch (error) {
            this.log(`❌ 글쓰기 페이지 이동 실패: ${error.message}`, 'error');
            throw error;
        }
    }

    async setupIframe() {
        try {
            // iframe setup
            const mainFrame = await this.page.$('#mainFrame');
            if (mainFrame) {
                this.frame = await mainFrame.contentFrame();
                this.log('✅ iframe 에디터 감지');
            } else {
                this.frame = this.page;
                this.log('✅ 메인 페이지 에디터 감지');
            }

            await this.page.waitForTimeout(2000);
            
        } catch (error) {
            this.log(`❌ iframe 설정 실패: ${error.message}`, 'error');
            throw error;
        }
    }

    async getAllReadyFolders() {
        try {
            const readyDir = 'files/ready';
            const folders = await fs.readdir(readyDir, { withFileTypes: true })
                .then(dirents => dirents.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name));
            
            return folders;
        } catch (error) {
            this.log(`❌ ready 폴더 확인 실패: ${error.message}`, 'error');
            return [];
        }
    }

    async processSingleFolder(folderName, blogService) {
        try {
            // Handle content with review_ prefix
            let actualFolderName = folderName;
            let sourcePath = 'files/ready';
            
            if (folderName.startsWith('review_')) {
                // Content from review folder - need to prepare it first
                actualFolderName = folderName.replace('review_', '');
                
                // Check if already copied to ready folder
                const readyPath = path.join('files/ready', actualFolderName);
                
                // Find content in date-based structure
                const reviewPath = await this.findContentInDateBasedStructure(actualFolderName);
                
                if (!reviewPath) {
                    this.log(`❌ 키워드 "${actualFolderName}"에 대한 콘텐츠를 찾을 수 없습니다.`);
                    return false;
                }
                
                try {
                    await fs.access(readyPath);
                    this.log(`📁 콘텐츠가 이미 ready 폴더에 준비됨: ${actualFolderName}`);
                } catch {
                    // Need to copy from review to ready
                    this.log(`📋 review 폴더에서 ready 폴더로 콘텐츠 복사 중: ${actualFolderName}`);
                    this.log(`📂 원본 경로: ${reviewPath}`);
                    await this.copyReviewToReady(actualFolderName, reviewPath, readyPath);
                }
            }
            
            // Save current folder path for image processing
            this.currentFolderPath = path.join('files/ready', actualFolderName);
            this.log(`📂 현재 폴더 경로 설정: ${this.currentFolderPath}`);
            // Reset uploaded image tracking per post
            this.uploadedImageSet = new Set();
            
            // Read and parse markdown file
            this.log(`📖 "${actualFolderName}" 폴더의 마크다운 파일 감지...`);
            const markdownPath = await this.findMarkdownFileInFolder(actualFolderName);
            const content = await this.readMarkdownFile(markdownPath);
            
            if (!content) {
                this.log('❌ 마크다운 파일을 읽을 수 없습니다.');
                return false;
            }

            // Extract title and enter
            const { title, bodyContent } = this.extractTitleAndContent(content);
            this.log(`📝 제목: "${title}"`);
            
            // CRITICAL FIX: Use blogService.enterTitle like Agent_blog_upload
            if (blogService && blogService.enterTitle) {
                await blogService.enterTitle(title);
            } else {
                // Fallback to built-in method if no blogService
                await this.enterTitle(title);
            }
            await this.page.waitForTimeout(1000);
            
            // Focus content area
            await this.focusContentArea();
            
            // Clear existing content before entering new content
            await this.clearExistingContent();
            
            // Parse and upload markup
            this.log('⚡ 마크업 파싱 및 최적화 업로드...');
            await this.parseAndUploadContent(bodyContent);
            
            // Save content (exact Agent_blog_upload logic)
            this.log('💾 콘텐츠 저장 중...');
            const saveSuccess = await this.saveBlogContent();
            
            if (saveSuccess) {
                this.log('✅ 글 작성 및 저장 완료!');
                return true;
            } else {
                this.log('❌ 글 저장 실패!');
                return false;
            }
            
        } catch (error) {
            this.log(`❌ "${folderName}" 폴더 처리 중 오류: ${error.message}`, 'error');
            return false;
        }
    }

    async saveBlogContent() {
        try {
            this.log('💾 블로그 콘텐츠 저장 시작...');
            
            // Save button selectors (exact from Agent_blog_upload)
            const saveSelectors = [
                'button.save_btn__bzc5B',  // Main selector from Agent_blog_upload
                '.save_btn__bzc5B',
                'button[class*="save_btn"]',
                'button:has-text("저장")',
                'button[type="button"]:has-text("저장")',
                '.se-save-button',
                '[data-name="save"]',
                'button[aria-label="저장"]'
            ];
            
            let saveButtonClicked = false;

            // Save button is in MAIN page (outside iframe), so try main page first
            for (const selector of saveSelectors) {
                // Try main page first (save button lives in #root > header)
                try {
                    await this.page.click(selector, { timeout: 4000 });
                    this.log(`✅ 메인 페이지에서 저장 버튼 클릭 성공 (셀렉터: ${selector})`);
                    saveButtonClicked = true;
                    break;
                } catch (e) {
                    this.log(`⚠️ 메인 페이지 저장 버튼 실패: ${selector}`);
                }

                // Fallback to iframe
                if (this.frame) {
                    try {
                        await this.frame.click(selector, { timeout: 2000 });
                        this.log(`✅ iframe에서 저장 버튼 클릭 성공 (셀렉터: ${selector})`);
                        saveButtonClicked = true;
                        break;
                    } catch (e) {
                        this.log(`⚠️ iframe 저장 버튼 실패: ${selector}`);
                    }
                }
            }

            // Force click fallback if all selectors failed
            if (!saveButtonClicked) {
                try {
                    this.log('🔨 force click 폴백 시도: button.save_btn__bzc5B');
                    await this.page.click('button.save_btn__bzc5B', { timeout: 5000, force: true });
                    this.log(`✅ force click 성공`);
                    saveButtonClicked = true;
                } catch (e) {
                    this.log(`⚠️ force click 실패: ${e.message}`);
                }
            }
            
            if (!saveButtonClicked) {
                this.log('❌ 모든 저장 버튼 셀렉터 실패');
                this.log('💡 수동으로 저장해주세요: Ctrl+S 또는 저장 버튼을 클릭하세요.');
                this.log('⏳ 수동 저장을 위해 10초 대기...');
                await this.page.waitForTimeout(10000);
                return false;  // 실패 반환
            }
            
            // Wait for save processing (짧게 대기)
            this.log('⏳ 저장 처리 중...');
            await this.page.waitForTimeout(1200);
            
            // Verify save completion (버튼 클릭 성공 시 즉시 성공 간주 옵션)
            let saveSuccess = true;
            if (!saveButtonClicked) {
                saveSuccess = await this.verifySaveCompletion();
            }
            if (saveSuccess) {
                this.log('✅ 블로그 콘텐츠 저장 완료!');
                
                // Try to capture blog URL
                const blogUrl = await this.captureBlogUrl();
                if (blogUrl) {
                    this.log(`🔗 블로그 URL 캡처됨: ${blogUrl}`);
                    await this.saveBlogUrlToStatus(blogUrl);
                }
                return true;  // 성공 반환
            } else {
                this.log('⚠️ 저장 상태 확인 불가, 수동으로 저장 상태를 확인해주세요.');
                // 폴백: Ctrl+S 시도 후 재검증
                try {
                    const modifierKey = process.platform === 'darwin' ? 'Meta' : 'Control';
                    await this.page.keyboard.down(modifierKey);
                    await this.page.keyboard.press('KeyS');
                    await this.page.keyboard.up(modifierKey);
                    this.log('⌨️ 단축키 저장(Ctrl+S) 시도');
                    await this.page.waitForTimeout(2000);
                } catch {}
                const recheck = await this.verifySaveCompletion();
                if (recheck) {
                    this.log('✅ 블로그 콘텐츠 저장 완료!(Ctrl+S 폴백)');
                    const blogUrl = await this.captureBlogUrl();
                    if (blogUrl) {
                        this.log(`🔗 블로그 URL 캡처됨: ${blogUrl}`);
                        await this.saveBlogUrlToStatus(blogUrl);
                    }
                    return true;
                }
                return false;  // 실패 반환
            }
            
        } catch (error) {
            this.log(`❌ 저장 처리 실패: ${error.message}`, 'error');
            this.log('💡 수동으로 저장해주세요: Ctrl+S 또는 저장 버튼을 클릭하세요.');
            return false;  // 실패 반환
        }
    }

    async verifySaveCompletion() {
        try {
            this.log('🔍 저장 완료 상태 확인 중...');
            
            // 최대 15초간 저장 완료 신호를 기다림
            const maxWaitTime = 15000;
            const checkInterval = 400;
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
                // 1. URL 변화 확인 (저장 후 리다이렉트)
                const currentUrl = this.page.url();
                if (currentUrl.includes('blog.naver.com') && !currentUrl.includes('Write') && !currentUrl.includes('write')) {
                    this.log(`✅ 저장 완료 - URL 변화 감지: ${currentUrl}`);
                    return true;
                }
                
                // 2. 저장 완료 메시지 확인
                const saveMessages = [
                    '저장되었습니다',
                    '저장 완료',
                    '게시글이 저장되었습니다',
                    '발행되었습니다',
                    '임시저장이 완료되었습니다'
                ];
                
                for (const message of saveMessages) {
                    try {
                        const el1 = await this.page.$(`text=${message}`);
                        const el2 = this.frame ? await this.frame.$(`text=${message}`) : null;
                        if (el1 || el2) {
                            this.log(`✅ 저장 완료 - 메시지 확인: ${message}`);
                            return true;
                        }
                    } catch (e) {
                        // Continue checking
                    }
                }
                
                // 3. 저장 버튼 상태 변화 확인
                const buttonStates = [
                    'button[disabled]:has-text("저장")',
                    'button.saved',
                    '.save_btn__bzc5B[disabled]',
                    'button:has-text("저장")[aria-disabled="true"]',
                    '.btn_complete',
                    '.toast.complete',
                    '.LayerToast',
                    '.se-notice[aria-live="polite"]'
                ];
                
                for (const state of buttonStates) {
                    try {
                        const element = await this.page.$(state);
                        if (element) {
                            this.log(`✅ 저장 완료 - 버튼 상태 확인: ${state}`);
                            return true;
                        }
                    } catch (e) {
                        // Continue checking
                    }
                }
                
                // 4. 에디터/페이지 상태 변화 확인
                try {
                    const editorElement = this.frame ? await this.frame.$('.se-viewer, .se_editor, .se-main-container') : await this.page.$('.se-main-container');
                    if (editorElement) {
                        const className = await editorElement.getAttribute('class');
                        if (className && (className.includes('saved') || className.includes('readonly'))) {
                            this.log(`✅ 저장 완료 - 에디터 상태 확인`);
                            return true;
                        }
                    }
                } catch (e) {
                    // Continue checking
                }

                // 5. 저장 후 이동 감지 (목록/글보기)
                const url2 = this.page.url();
                if (url2.includes('/PostList.naver') || url2.includes('/PostView.naver') || url2.includes('/PostRead.naver')) {
                    this.log(`✅ 저장 완료 - 글 목록/글보기 이동 감지: ${url2}`);
                    return true;
                }
                
                await this.page.waitForTimeout(checkInterval);
            }
            
            this.log('⚠️ 저장 완료 신호를 찾을 수 없음 - 수동 확인 필요');
            return false;
            
        } catch (error) {
            this.log(`❌ 저장 완료 확인 실패: ${error.message}`, 'error');
            return false;
        }
    }

    async captureBlogUrl() {
        try {
            this.log('🔗 블로그 URL 캡처 시도...');
            
            // Wait for potential redirect after save
            await this.page.waitForTimeout(2000);
            
            // Get current URL
            const currentUrl = this.page.url();
            this.log(`🌐 현재 페이지 URL: ${currentUrl}`);
            
            // Check if we're on a blog post page
            if (currentUrl.includes('blog.naver.com') && !currentUrl.includes('Write')) {
                return currentUrl;
            }
            
            // Try to find blog post link in current page
            const blogLinkSelectors = [
                'a[href*="blog.naver.com"][href*="PostView"]',
                'a[href*="blog.naver.com"][href*="PostRead"]',
                '.blog-post-link',
                '.post-link'
            ];
            
            for (const selector of blogLinkSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        const href = await element.getAttribute('href');
                        if (href) {
                            this.log(`🔗 블로그 링크 발견: ${href}`);
                            return href;
                        }
                    }
                } catch (e) {
                    // Continue if element not found
                }
            }
            
            return null;
        } catch (error) {
            this.log(`❌ 블로그 URL 캡처 실패: ${error.message}`, 'error');
            return null;
        }
    }

    async saveBlogUrlToStatus(blogUrl) {
        try {
            const statusFilePath = path.join(process.cwd(), 'upload_status.json');
            let status = {
                pending_uploads: [],
                completed_uploads: [],
                failed_uploads: [],
                last_updated: new Date().toISOString()
            };
            
            // Load existing status
            if (await fs.access(statusFilePath).then(() => true).catch(() => false)) {
                const existingStatus = await fs.readFile(statusFilePath, 'utf-8');
                status = JSON.parse(existingStatus);
            }
            
            // Update the most recent completed upload with blog URL
            if (status.completed_uploads.length > 0) {
                const lastUpload = status.completed_uploads[status.completed_uploads.length - 1];
                if (lastUpload && this.currentFolderPath) {
                    const folderName = path.basename(this.currentFolderPath);
                    if (lastUpload.content_id === folderName) {
                        lastUpload.blog_url = blogUrl;
                        status.last_updated = new Date().toISOString();
                        
                        await fs.writeFile(statusFilePath, JSON.stringify(status, null, 2));
                        this.log(`✅ 블로그 URL 저장 완료: ${blogUrl}`);
                    }
                }
            }
        } catch (error) {
            this.log(`❌ 블로그 URL 저장 실패: ${error.message}`, 'error');
        }
    }

    // Additional helper methods (simplified for brevity)
    async findMarkdownFileInFolder(folderName) {
        try {
            const folderPath = path.join('files/ready', folderName);
            const files = await fs.readdir(folderPath);
            const mdFiles = files.filter(file => file.endsWith('.md'));
            
            if (mdFiles.length > 0) {
                const markdownPath = path.join(folderPath, mdFiles[0]);
                this.log(`📁 처리 중인 폴더: ${folderName}`);
                this.log(`📄 발견된 파일: ${mdFiles[0]}`);
                return markdownPath;
            }
            
            throw new Error(`폴더 "${folderName}"에서 마크다운 파일을 찾을 수 없습니다.`);
        } catch (error) {
            this.log(`❌ 파일 감지 실패: ${error.message}`, 'error');
            return null;
        }
    }

    async readMarkdownFile(filePath) {
        try {
            if (!filePath) {
                throw new Error('파일 경로가 제공되지 않았습니다.');
            }
            
            const fullPath = path.resolve(filePath);
            let content = await fs.readFile(fullPath, 'utf8');
            
            // CRITICAL FIX: Check if content was pre-converted and restore original markdown
            const conversionLogPath = filePath.replace('.md', '_conversion_log.txt');
            try {
                const conversionLog = await fs.readFile(conversionLogPath, 'utf8');
                if (conversionLog.includes('=== 원본 마크다운 ===')) {
                    this.log(`⚠️ 변환된 콘텐츠 감지 - 원본 마크다운 복원 중`);
                    
                    // Extract original markdown from conversion log
                    const originalStart = conversionLog.indexOf('=== 원본 마크다운 ===');
                    const originalEnd = conversionLog.indexOf('=== 네이버 블로그 형식 변환 ===');
                    
                    if (originalStart !== -1 && originalEnd !== -1) {
                        const originalContent = conversionLog.substring(originalStart, originalEnd)
                            .replace('=== 원본 마크다운 ===', '')
                            .trim();
                        
                        if (originalContent.length > 100) {
                            content = originalContent;
                            this.log(`✅ 원본 마크다운 복원 성공: ${content.length}자`);
                        }
                    }
                }
            } catch (e) {
                // No conversion log found, use original content
                this.log(`ℹ️ 변환 로그 없음 - 원본 콘텐츠 사용`);
            }
            
            // Apply pre-upload formatting rules
            content = this.applyPreUploadFormatting(content);
            
            this.log(`✅ 파일 읽기 성공: ${content.length}자`);
            return content;
        } catch (error) {
            this.log(`❌ 파일 읽기 실패: ${error.message}`, 'error');
            return null;
        }
    }

    // Exact Agent_blog_upload content parsing functions
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
            this.log('❌ MD 파일 파싱 중 오류: ' + error.message, 'error');
            return {
                title: '파싱 오류',
                content: markdownContent
            };
        }
    }

    extractTitleAndContent(content) {
        const lines = content.split('\n');
        let title = '';
        let bodyStart = 0;
        
        // 첫 번째 제목 찾기 - Naver blog format (##Title##) 또는 Markdown format (# Title)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check for Naver blog format title
            if (line.startsWith('##') && line.endsWith('##')) {
                title = line.substring(2, line.length - 2).trim();
                bodyStart = i + 1;
                break;
            }
            // Check for markdown format title
            else if (line.startsWith('# ')) {
                title = line.substring(2).trim();
                bodyStart = i + 1;
                break;
            }
        }
        
        // If no title found, use filename or default
        if (!title) {
            title = '제목 없음';
        }
        
        // 본문에서도 동일한 제목이 있으면 제거 (처음 몇 줄에서)
        const bodyLines = lines.slice(bodyStart);
        const cleanedBodyLines = [];
        
        for (let i = 0; i < bodyLines.length; i++) {
            const line = bodyLines[i].trim();
            // Skip duplicate title in body (check first 10 lines)
            if (i < 10) {
                // Skip if it's the same title in any format
                if (line === `# ${title}` || 
                    line === `##${title}##` ||
                    (line.startsWith('##') && line.endsWith('##') && 
                     line.substring(2, line.length - 2).trim() === title)) {
                    continue;
                }
            }
            cleanedBodyLines.push(bodyLines[i]);
        }
        
        const bodyContent = cleanedBodyLines.join('\n').trim();
        return { title, bodyContent };
    }

    // Apply pre-upload formatting rules
    applyPreUploadFormatting(content) {
        try {
            this.log(`🔧 사전 서식 규칙 적용 중...`);
            
            let formattedContent = content;
            
            // Rule 1: Insert line break after every sentence
            // Match sentences ending with period, exclamation, or question mark followed by space or end of line
            // BUT exclude numbered lists (1., 2., etc.) and numbered headings
            formattedContent = formattedContent.replace(/(?<!\d)([.!?])\s+/g, '$1\n');
            
            // Rule 2: Remove number text before number emojis
            // Match patterns like "1 1️⃣", "2 2️⃣", etc. and keep only the emoji
            formattedContent = formattedContent.replace(/\b(\d+)\s*([\d️⃣])/g, '$2');
            
            // Also handle Korean number patterns like "1. 1️⃣" or "첫 번째 1️⃣"
            formattedContent = formattedContent.replace(/\b\d+\.\s*([\d️⃣])/g, '$1');
            formattedContent = formattedContent.replace(/첫\s*번째\s*([1️⃣])/g, '$1');
            formattedContent = formattedContent.replace(/두\s*번째\s*([2️⃣])/g, '$1');
            formattedContent = formattedContent.replace(/세\s*번째\s*([3️⃣])/g, '$1');
            formattedContent = formattedContent.replace(/네\s*번째\s*([4️⃣])/g, '$1');
            formattedContent = formattedContent.replace(/다섯\s*번째\s*([5️⃣])/g, '$1');
            
            // Clean up multiple consecutive line breaks
            formattedContent = formattedContent.replace(/\n{3,}/g, '\n\n');
            
            // Trim whitespace from each line
            formattedContent = formattedContent.split('\n').map(line => line.trim()).join('\n');
            
            this.log(`✅ 사전 서식 규칙 적용 완료`);
            this.log(`  📝 문장 뒤 줄바꿈 추가`);
            this.log(`  🔢 숫자 텍스트 + 이모지 → 이모지만 유지`);
            
            return formattedContent;
            
        } catch (error) {
            this.log(`❌ 사전 서식 규칙 적용 실패: ${error.message}`, 'error');
            return content; // Return original content if formatting fails
        }
    }

    // Advanced markup parsing with priority handling (exact from Agent_blog_upload)
    parseMarkupElements(content) {
        const elements = [];
        
        // 정규식 패턴들 (우선순위 순서: 더 구체적인 것부터)
        // CRITICAL FIX: Updated patterns to handle all markdown formatting
        const patterns = [
            { type: 'image', regex: /!\[([^\]]*)\]\(([^)]+)\)/g, format: [] }, // 이미지: ![alt](filename)
            
            // 소제목 패턴들 (더 구체적인 것부터)
            { type: 'subtitle', regex: /##([^#\n]+?)##/g, format: [] }, // Naver format: ##text##
            { type: 'subtitle', regex: /^#{1,6} (.+)$/gm, format: [] }, // Standard markdown: # ## ### #### ##### ######
            
            // 인용구
            { type: 'quote', regex: />>([^>\n]+?)<</g, format: [] }, // Naver format: >>텍스트<<
            { type: 'quote', regex: /^> (.+)$/gm, format: [] }, // Standard markdown: > text
            
            // 하이라이트
            { type: 'highlight', regex: /==([^=\n]+?)==/g, format: ['highlight'] }, // 하이라이트: ==텍스트==
            
            // 볼드 패턴들 (더 구체적인 것부터)
            { type: 'bold', regex: /【([^】]+?)】/g, format: ['bold'] }, // Korean brackets: 【텍스트】
            { type: 'bold_underline', regex: /\*\*__([^*_\n]+?)__\*\*/g, format: ['bold', 'underline'] },
            { type: 'underline_bold', regex: /__\*\*([^*_\n]+?)\*\*__/g, format: ['bold', 'underline'] },
            { type: 'bold', regex: /\*\*([^*\n]+?)\*\*/g, format: ['bold'] },
            
            // 언더라인과 이탤릭
            { type: 'underline', regex: /__([^_\n]+?)__/g, format: ['underline'] },
            { type: 'italic', regex: /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, format: ['italic'] }
        ];
        
        // 모든 매치를 수집
        const allMatches = [];
        
        patterns.forEach(pattern => {
            let match;
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            
            while ((match = regex.exec(content)) !== null) {
                // 이미지의 경우 alt와 filename을 모두 저장
                if (pattern.type === 'image') {
                    allMatches.push({
                        type: pattern.type,
                        format: pattern.format,
                        text: match[1], // alt text
                        filename: match[2], // filename
                        fullMatch: match[0],
                        start: match.index,
                        end: match.index + match[0].length
                    });
                } else {
                    allMatches.push({
                        type: pattern.type,
                        format: pattern.format,
                        text: match[1],
                        fullMatch: match[0],
                        start: match.index,
                        end: match.index + match[0].length
                    });
                }
            }
        });
        
        // 위치별 정렬
        allMatches.sort((a, b) => a.start - b.start);
        
        // 중복 제거: 겹치는 영역이 있으면 더 구체적인(먼저 나온) 매치만 유지
        const filteredMatches = [];
        
        allMatches.forEach(match => {
            const hasOverlap = filteredMatches.some(existing => 
                (match.start >= existing.start && match.start < existing.end) ||
                (match.end > existing.start && match.end <= existing.end) ||
                (match.start <= existing.start && match.end >= existing.end)
            );
            
            if (!hasOverlap) {
                filteredMatches.push(match);
            }
        });
        
        // 텍스트 분할 및 요소 생성
        let lastIndex = 0;
        
        filteredMatches.forEach(match => {
            // 매치 이전의 일반 텍스트 추가
            if (match.start > lastIndex) {
                const plainText = content.substring(lastIndex, match.start).trim();
                if (plainText) {
                    elements.push({
                        type: 'text',
                        format: [],
                        text: plainText
                    });
                }
            }
            
            // 매치된 요소 추가
            if (match.type === 'image') {
                elements.push({
                    type: match.type,
                    format: match.format,
                    text: match.text, // alt text
                    filename: match.filename
                });
            } else {
                elements.push({
                    type: match.type,
                    format: match.format,
                    text: match.text
                });
            }
            
            lastIndex = match.end;
        });
        
        // 마지막 남은 텍스트 추가
        if (lastIndex < content.length) {
            const plainText = content.substring(lastIndex).trim();
            if (plainText) {
                elements.push({
                    type: 'text',
                    format: [],
                    text: plainText
                });
            }
        }
        
        return elements;
    }

    // Calculate statistics for processed elements
    calculateStats(elements) {
        const stats = {
            bold: 0,
            underline: 0,
            italic: 0,
            combined: 0,
            subtitle: 0,
            quote: 0,
            highlight: 0,
            image: 0
        };
        
        elements.forEach(element => {
            switch (element.type) {
                case 'bold':
                    stats.bold++;
                    break;
                case 'underline':
                    stats.underline++;
                    break;
                case 'italic':
                    stats.italic++;
                    break;
                case 'bold_underline':
                    stats.combined++;
                    break;
                case 'subtitle':
                    stats.subtitle++;
                    break;
                case 'quote':
                    stats.quote++;
                    break;
                case 'highlight':
                    stats.highlight++;
                    break;
                case 'image':
                    stats.image++;
                    break;
            }
        });
        
        return stats;
    }

    async focusContentArea() {
        try {
            await this.ensureContentAreaFocus();
            this.log('✅ 본문 영역 포커스 완료');
        } catch (error) {
            this.log(`❌ 포커스 오류: ${error.message}`, 'error');
        }
    }
    
    // NEW: Dedicated function to ensure content area focus
    async ensureContentAreaFocus() {
        try {
            // 브라우저 상태 확인
            if (!this.page || this.page.isClosed()) {
                this.log('❌ 브라우저가 닫혀있습니다. 포커스 불가능.');
                return false;
            }

            // CRITICAL FIX: Try iframe first, then main page
            let focusSuccess = false;
            
            if (this.frame) {
                try {
                    // iframe 상태 확인
                    await this.frame.evaluate(() => true); // iframe 접근 가능 여부 테스트
                    
                    await this.frame.evaluate(() => {
                        const selectors = [
                            '.se-text-paragraph',
                            '.se-content', 
                            '.se-main-container',
                            '[contenteditable="true"]',
                            '.se-component'
                        ];
                        
                        for (const selector of selectors) {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.click();
                                element.focus();
                                // Ensure cursor is positioned
                                const range = document.createRange();
                                const selection = window.getSelection();
                                range.selectNodeContents(element);
                                range.collapse(false); // Move cursor to end
                                selection.removeAllRanges();
                                selection.addRange(range);
                                return true;
                            }
                        }
                        return false;
                    });
                    focusSuccess = true;
                } catch (error) {
                    this.log(`  ⚠️ iframe 포커스 실패: ${error.message}`);
                    // iframe이 닫힌 경우 null로 설정
                    if (error.message.includes('Target page, context or browser has been closed')) {
                        this.frame = null;
                    }
                }
            }
            
            // Fallback to main page if iframe fails
            if (!focusSuccess) {
                this.log(`  🔄 메인 페이지 포커스로 전환`);
                try {
                    const selectors = [
                        '.se-component',
                        '.se-text-paragraph',
                        '.se-content', 
                        '.se-main-container',
                        '[contenteditable="true"]'
                    ];
                    
                    for (const selector of selectors) {
                        try {
                            await this.page.click(selector, { timeout: 1000 });
                            await this.page.waitForTimeout(100);
                            focusSuccess = true;
                            this.log(`  ✅ 메인 페이지 포커스 성공: ${selector}`);
                            break;
                        } catch (e) {
                            this.log(`  ⚠️ 메인 페이지 셀렉터 실패: ${selector}`);
                        }
                    }
                } catch (error) {
                    this.log(`  ❌ 메인 페이지 포커스 실패: ${error.message}`);
                }
            }
            
            await this.page.waitForTimeout(200);
            
            if (!focusSuccess) {
                this.log(`  ❌ 모든 포커스 시도 실패`);
            }
            
        } catch (error) {
            this.log(`❌ 포커스 오류: ${error.message}`, 'error');
        }
    }

    async parseAndUploadContent(content) {
        try {
            // Advanced markup parsing and formatting (exact from Agent_blog_upload)
            this.log(`⚡ 마크업 파싱 및 최적화 업로드 시작...`);
            
            // Parse content into elements
            const elements = this.parseMarkupElements(content);
            const stats = this.calculateStats(elements);
            
            this.log(`📊 서식 통계: 볼드 ${stats.bold}개, 언더라인 ${stats.underline}개, 이탤릭 ${stats.italic}개, 조합 ${stats.combined}개, 소제목 ${stats.subtitle}개, 인용구 ${stats.quote}개, 하이라이트 ${stats.highlight}개, 이미지 ${stats.image}개`);
            
            // CRITICAL DEBUG: If no formatting detected, log the content for analysis
            if (stats.subtitle === 0 && stats.bold === 0 && stats.image === 0) {
                this.log(`⚠️ 서식 감지 실패 - 콘텐츠 분석:`);
                this.log(`콘텐츠 시작: "${content.substring(0, 200)}..."`);
                this.log(`제목 패턴 검사: ${content.match(/^#{1,6} /gm) ? '✅ 발견' : '❌ 없음'}`);
                this.log(`볼드 패턴 검사: ${content.match(/\*\*.*?\*\*/g) ? '✅ 발견' : '❌ 없음'}`);
                this.log(`이미지 패턴 검사: ${content.match(/!\[.*?\]\(.*?\)/g) ? '✅ 발견' : '❌ 없음'}`);
            }
            
            // Separate processing approach to avoid formatting/image conflicts
            // Step 1: Process all text-based content first (maintains formatting state)
            const textElements = elements.filter(e => e.type !== 'image');
            const imageElements = elements.filter(e => e.type === 'image');
            
            this.log(`🔄 처리 방식: 텍스트 ${textElements.length}개 → 이미지 ${imageElements.length}개`);
            
            // CRITICAL DEBUG: Log all text elements before processing
            this.log(`🔍 텍스트 요소 목록:`);
            textElements.forEach((el, idx) => {
                this.log(`  ${idx + 1}. ${el.type}: "${el.text?.substring(0, 50)}${el.text?.length > 50 ? '...' : ''}"`);
            });
            
            // Process text elements first to maintain formatting context
            for (let i = 0; i < textElements.length; i++) {
                const element = textElements[i];
                this.log(`\n📝 텍스트 ${i + 1}/${textElements.length}: ${element.type}`);
                this.log(`  내용: "${element.text?.substring(0, 50)}${element.text?.length > 50 ? '...' : ''}"`);
                this.log(`  서식: [${element.format?.join(', ') || 'none'}]`);
                
                try {
                    // CRITICAL FIX: Always ensure focus and verify content area is ready
                    this.log(`  🎯 콘텐츠 영역 포커스 확인 중...`);
                    await this.ensureContentAreaFocus();
                    
                    // Verify iframe is still available
                    if (!this.frame) {
                        this.log(`  ❌ iframe 컸텍스트 손실 - 재설정 중`);
                        await this.setupIframe();
                    }
                    
                    this.log(`  ▶️ 요소 처리 시작`);
                    await this.processElement(element);
                    this.log(`  ✅ 요소 처리 완료`);
                    
                    await this.page.waitForTimeout(50); // EXACT Agent_blog_upload timing
                    
                    // EXACT Agent_blog_upload: Add horizontal lines AFTER processing element
                    if (this.shouldAddHorizontalLineBeforeSubtitle(element, textElements, i)) {
                        this.log(`  📏 구분선 추가 중...`);
                        await this.addHorizontalLine();
                    }
                } catch (error) {
                    this.log(`  ❌ 텍스트 요소 처리 실패 (${element.type}): ${error.message}`, 'error');
                    this.log(`  🔄 폴백 전략: 직접 텍스트 입력`);
                    
                    // Fallback: ensure focus and type text directly
                    await this.ensureContentAreaFocus();
                    if (element.text) {
                        await this.optimizedTypeText(element.text);
                        this.log(`  ✅ 폴백 텍스트 입력 완료`);
                    }
                }
            }
            
            // Process images separately at the end to avoid formatting conflicts
            await this.processAllImages(imageElements);
            
            // Clear all formats at the end (exact from Agent_blog_upload)
            await this.clearAllFormats();
            
            // 최종 결과 확인
            const uploadSuccess = await this.verifyResult(stats, content);
            
            if (!uploadSuccess) {
                this.log('❌ 콘텐츠 업로드 실패 - 예상 콘텐츠가 입력되지 않음');
                throw new Error('콘텐츠 업로드 실패');
            }
            
            this.log('✅ 마크업 파싱 및 업로드 완료');
            
        } catch (error) {
            this.log(`❌ 마크업 파싱 실패: ${error.message}`, 'error');
            // Don't add content again as it may cause duplication
            this.log(`⚠️ 마크업 파싱 실패 - 이미 입력된 내용 유지`);
        }
    }

    // Exact Agent_blog_upload element processing logic
    async processElement(element) {
        try {
            // 이미지는 특별 처리
            if (element.type === 'image') {
                await this.processImage(element.filename, element.text);
                return;
            }
            
            // 소제목은 특별 처리
            if (element.type === 'subtitle') {
                await this.processSubtitle(element.text);
                return;
            }
            
            // 인용구는 특별 처리
            if (element.type === 'quote') {
                await this.processQuote(element.text);
                return;
            }
            
            // EXACT AGENT_BLOG_UPLOAD LOGIC: Space → Format → Type → Format continues
            this.log(`  🔍 processElement - type: ${element.type}, format: [${element.format?.join(', ') || 'none'}]`);
            
            // 1. Add space BEFORE formatting (if element has formatting) - EXACT Agent_blog_upload logic
            if (element.format && element.format.length > 0 && element.type !== 'text') {
                await this.page.keyboard.type(' ');
            }
            
            // 2. Apply formatting BEFORE typing (Agent_blog_upload style)
            await this.optimizedFormatManagement(element.format);
            
            // 추가 대기시간으로 서식 적용 안정화
            if (element.format && element.format.length > 0) {
                await this.page.waitForTimeout(100);
                this.log(`  ⏱️ 서식 적용 후 안정화 대기 완료`);
            }
            
            // 3. Type text WITH formatting applied
            await this.optimizedTypeText(element.text);
            
            // 4. Handle highlight auto-removal after typing (from Agent_blog_upload)
            if (element.format && element.format.includes('highlight')) {
                this.log(`  🔄 하이라이트 텍스트 입력 완료, 자동 해제 중...`);
                await this.page.waitForTimeout(200);
                
                try {
                    // 1. 하이라이트 적용 버튼 클릭
                    await this.frame.click('.se-background-color-toolbar-button', { timeout: 1000 });
                    await this.page.waitForTimeout(300);
                    
                    // 2. 색상 없음 클릭
                    await this.frame.click('button.se-color-palette-no-color', { timeout: 1000 });
                    await this.page.waitForTimeout(200);
                    
                    this.log(`  ✅ 하이라이트 자동 해제 완료`);
                } catch (error) {
                    this.log(`  ⚠️ 하이라이트 자동 해제 실패: ${error.message}`);
                }
                
                this.currentFormats.delete('highlight');
            }
            
            // 5. Next text will be typed directly without additional space (Agent_blog_upload behavior)
            
        } catch (error) {
            this.log(`  ❌ 요소 처리 실패: ${error.message}`, 'error');
        }
    }

    // EXACT Agent_blog_upload optimizedFormatManagement logic
    async optimizedFormatManagement(targetFormats) {
        try {
            const currentFormats = Array.from(this.currentFormats);
            const targetSet = new Set(targetFormats || []);
            
            // Deactivate formats not in target
            const toDeactivate = currentFormats.filter(format => !targetSet.has(format));
            
            // Activate formats in target
            const toActivate = (targetFormats || []).filter(format => !this.currentFormats.has(format));
            
            // Use parallel processing (from Agent_blog_upload)
            const promises = [];
            
            for (const format of toDeactivate) {
                promises.push(this.toggleFormat(format));
                this.currentFormats.delete(format);
            }
            
            for (const format of toActivate) {
                promises.push(this.toggleFormat(format));
                this.currentFormats.add(format);
            }
            
            if (promises.length > 0) {
                await Promise.all(promises);
                this.log(`  🎨 서식 변경: [${toDeactivate.join(',')}] 해제, [${toActivate.join(',')}] 활성화`);
            }
            
        } catch (error) {
            this.log(`  ❌ 서식 관리 오류: ${error.message}`, 'error');
        }
    }

    // EXACT Agent_blog_upload toggleFormat method
    async toggleFormat(format) {
        try {
            // 하이라이트는 특별 처리
            if (format === 'highlight') {
                await this.toggleHighlight();
                return;
            }
            
            // Agent_blog_upload verified key mapping method
            const keyMappings = {
                bold: 'KeyB',
                italic: 'KeyI',
                underline: 'KeyU'
            };
            
            const key = keyMappings[format];
            if (!key) return;
            
            // Windows/Linux에서는 Control, Mac에서는 Meta 사용
            const modifierKey = process.platform === 'darwin' ? 'Meta' : 'Control';
            await this.page.keyboard.down(modifierKey);
            await this.page.keyboard.press(key);
            await this.page.keyboard.up(modifierKey);
            
            await this.page.waitForTimeout(100); // 서식 적용 안정화 대기 증가
            
        } catch (error) {
            this.log(`  ❌ ${format} 토글 실패: ${error.message}`);
        }
    }

    // Toggle highlight function (exact from Agent_blog_upload)
    async toggleHighlight() {
        try {
            if (!this.currentFormats.has('highlight')) {
                this.log(`  🎨 하이라이트 적용 시도`);
                
                // 1. 하이라이트 적용 버튼 클릭
                await this.frame.click('.se-background-color-toolbar-button', { timeout: 1000 });
                await this.page.waitForTimeout(300);
                this.log(`  📂 하이라이트 색상 팔레트 열기 완료`);
                
                // 2. 노란색 색상 클릭
                await this.frame.click('button.se-color-palette[data-color="#ffef34"]', { timeout: 1000 });
                await this.page.waitForTimeout(200);
                this.log(`  🟡 노란색 하이라이트 색상 선택 완료`);
                
            } else {
                this.log(`  🎨 하이라이트 해제 시도`);
                
                // 1. 하이라이트 적용 버튼 클릭
                await this.frame.click('.se-background-color-toolbar-button', { timeout: 1000 });
                await this.page.waitForTimeout(300);
                this.log(`  📂 하이라이트 색상 팔레트 열기 완료`);
                
                // 2. 색상 없음 클릭
                await this.frame.click('button.se-color-palette-no-color', { timeout: 1000 });
                await this.page.waitForTimeout(200);
                this.log(`  ⚪ 하이라이트 색상 제거 완료`);
            }
            
        } catch (error) {
            this.log(`  ❌ 하이라이트 토글 실패: ${error.message}`, 'error');
        }
    }

    // EXACT Agent_blog_upload clearAllFormats method
    async clearAllFormats() {
        try {
            this.log('\n🔄 모든 서식 해제...');
            
            const promises = Array.from(this.currentFormats).map(format => 
                this.toggleFormat(format)
            );
            
            if (promises.length > 0) {
                await Promise.all(promises);
                this.currentFormats.clear();
                this.log('✅ 모든 서식 해제 완료');
            }
            
        } catch (error) {
            this.log(`❌ 서식 해제 오류: ${error.message}`);
        }
    }

    async clearExistingContent() {
        try {
            this.log('🧹 기존 콘텐츠 정리 중...');
            
            // Try to select all and delete existing content
            await this.ensureContentAreaFocus();
            await this.page.keyboard.press('Control+a');
            await this.page.waitForTimeout(200);
            await this.page.keyboard.press('Delete');
            await this.page.waitForTimeout(200);
            
            this.log('✅ 기존 콘텐츠 정리 완료');
            
        } catch (error) {
            this.log(`❌ 기존 콘텐츠 정리 실패: ${error.message}`, 'error');
        }
    }

    async processAllImages(markdownImageElements) {
        try {
            this.log('📸 이미지 처리 시작...');
            
            // Get all images from the folder
            const allImageFiles = this.getAllImagesFromFolder();
            
            // Track which images have been processed to avoid duplication
            const processedImages = new Set();
            // 게시물 처리 단위 중복 방지: 클래스 레벨 집합
            if (!this.uploadedImageSet) this.uploadedImageSet = new Set();
            
            // First, process images from markdown
            if (markdownImageElements.length > 0) {
                this.log(`📝 마크다운 이미지 처리: ${markdownImageElements.length}개`);
                await this.page.waitForTimeout(200);
                
                for (let i = 0; i < markdownImageElements.length; i++) {
                    const element = markdownImageElements[i];
                    if (this.uploadedImageSet.has(element.filename)) {
                        this.log(`⏭️ 마크다운 중복 이미지 스킵: ${element.filename}`);
                        continue;
                    }
                    this.log(`📸 마크다운 이미지 ${i + 1}/${markdownImageElements.length}: ${element.filename}`);
                    
                    try {
                        // Find the actual image file
                        const actualImageFile = this.findSimilarImageFile(element.filename);
                        if (actualImageFile) {
                            await this.processElement(element);
                            processedImages.add(actualImageFile);
                            this.uploadedImageSet.add(element.filename);
                            this.log(`✅ 마크다운 이미지 처리 완료: ${actualImageFile}`);
                        } else {
                            this.log(`❌ 마크다운 이미지 파일을 찾을 수 없음: ${element.filename}`);
                        }
                        await this.page.waitForTimeout(100);
                    } catch (error) {
                        this.log(`❌ 마크다운 이미지 처리 실패: ${error.message}`, 'error');
                    }
                }
            }
            
            // Then, process remaining images from the folder
            const remainingImages = allImageFiles.filter(file => !processedImages.has(file));
            if (remainingImages.length > 0) {
                this.log(`📁 폴더 내 추가 이미지 처리: ${remainingImages.length}개`);
                
                for (let i = 0; i < remainingImages.length; i++) {
                    const imageFile = remainingImages[i];
                    if (this.uploadedImageSet.has(imageFile)) {
                        this.log(`⏭️ 추가 이미지 중복 스킵: ${imageFile}`);
                        continue;
                    }
                    this.log(`📸 추가 이미지 ${i + 1}/${remainingImages.length}: ${imageFile}`);
                    
                    try {
                        await this.processImage(imageFile, `추가 이미지 ${i + 1}`);
                        processedImages.add(imageFile);
                        this.uploadedImageSet.add(imageFile);
                        this.log(`✅ 추가 이미지 처리 완료: ${imageFile}`);
                        await this.page.waitForTimeout(100);
                    } catch (error) {
                        this.log(`❌ 추가 이미지 처리 실패: ${error.message}`, 'error');
                    }
                }
            }
            
            this.log(`🎉 이미지 처리 완료: 총 ${processedImages.size}개 이미지 업로드`);
            
        } catch (error) {
            this.log(`❌ 이미지 처리 중 오류: ${error.message}`, 'error');
        }
    }



    async processSubtitle(text) {
        try {
            this.log(`  🎨 소제목 처리: "${text}"`);
            
            // 줄바꿈 후 소제목 입력
            await this.page.keyboard.press('Enter');
            
            // 소제목 텍스트 입력
            await this.page.keyboard.type(text, { delay: 20 });
            
            // 텍스트 선택 (전체 줄 선택)
            await this.page.keyboard.press('Home');
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('End');
            await this.page.keyboard.up('Shift');
            
            // 잠시 대기 후 소제목 스타일 적용 시도
            await this.page.waitForTimeout(300);
            
            try {
                // 텍스트 포맷 드롭다운 버튼 클릭
                await this.frame.click('.se-text-format-toolbar-button', { timeout: 2000 });
                await this.page.waitForTimeout(500);
                
                // 실제 소제목 옵션 클릭
                const subtitleSelectors = [
                    'button[data-value="sectionTitle"]',
                    '.se-toolbar-option-text-format-sectionTitle-button',
                    'button.se-toolbar-option-text-format-sectionTitle-button',
                    '[data-value="sectionTitle"][data-name="text-format"]'
                ];
                
                let subtitleApplied = false;
                for (const selector of subtitleSelectors) {
                    try {
                        await this.frame.click(selector, { timeout: 1000 });
                        this.log(`  ✅ 소제목 스타일 적용 성공 (셀렉터: ${selector})`);
                        subtitleApplied = true;
                        break;
                    } catch (e) {
                        this.log(`  ⚠️ 셀렉터 실패: ${selector}`);
                    }
                }
                
                if (!subtitleApplied) {
                    this.log(`  ❌ 모든 소제목 셀렉터 실패`);
                }
                
            } catch (error) {
                this.log(`  ⚠️ 소제목 스타일 적용 실패, 일반 텍스트로 유지`);
            }
            
            // 선택 해제 및 커서를 줄 끝으로 이동
            await this.page.keyboard.press('ArrowRight');
            await this.page.keyboard.press('Enter');
            
        } catch (error) {
            this.log(`  ❌ 소제목 처리 실패: ${error.message}`, 'error');
        }
    }

    async processQuote(text) {
        try {
            this.log(`  💬 인용구 처리: "${text}"`);
            
            // 줄바꿈 후 인용구 텍스트 입력
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.press('Enter');
            
            // 인용구 텍스트 입력
            await this.page.keyboard.type(text, { delay: 20 });
            
            // 텍스트 선택 (전체 줄 선택)
            await this.page.keyboard.press('Home');
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('End');
            await this.page.keyboard.up('Shift');
            
            // 잠시 대기 후 인용구 스타일 적용 시도
            await this.page.waitForTimeout(300);
            
            try {
                // 인용구 툴바 버튼 클릭
                const quoteSelectors = [
                    '.se-to-quotation-toolbar-button',
                    'button[data-name="to-quotation"]',
                    '.se-contents-toolbar-basic-button[data-name="to-quotation"]',
                    '[data-group="contentsToolbar"][data-name="to-quotation"]'
                ];
                
                let quoteApplied = false;
                for (const selector of quoteSelectors) {
                    try {
                        await this.frame.click(selector, { timeout: 1000 });
                        this.log(`  ✅ 인용구 스타일 적용 성공 (셀렉터: ${selector})`);
                        quoteApplied = true;
                        break;
                    } catch (e) {
                        this.log(`  ⚠️ 셀렉터 실패: ${selector}`);
                    }
                }
                
            } catch (error) {
                this.log(`  ⚠️ 인용구 스타일 적용 실패, 일반 텍스트로 유지`);
            }
            
            // 선택 해제 및 커서를 줄 끝으로 이동
            await this.page.keyboard.press('ArrowRight');
            
            // 인용구에서 빠져나오기
            this.log(`  🔄 인용구에서 빠져나오기 시도...`);
            await this.page.keyboard.press('ArrowDown');
            await this.page.waitForTimeout(100);
            await this.page.keyboard.press('ArrowDown');
            await this.page.waitForTimeout(100);
            await this.page.keyboard.press('Enter');
            await this.page.waitForTimeout(200);
            this.log(`  ✅ 인용구에서 일반 텍스트 모드로 전환 완료`);
            
        } catch (error) {
            this.log(`  ❌ 인용구 처리 실패: ${error.message}`, 'error');
        }
    }

    async processImage(filename, altText) {
        try {
            this.log(`  🖼️ 이미지 처리: "${filename}" (alt: "${altText}")`);
            if (this.uploadedImageSet && this.uploadedImageSet.has(filename)) {
                this.log(`  ⏭️ 이미지 중복 스킵: ${filename}`);
                return;
            }
            
            // 파일명에서 접두사 제거 (mdc:, img:, image: 등)
            let cleanFilename = filename;
            const prefixes = ['mdc:', 'img:', 'image:', 'pic:', 'photo:'];
            for (const prefix of prefixes) {
                if (cleanFilename.startsWith(prefix)) {
                    cleanFilename = cleanFilename.substring(prefix.length);
                    this.log(`  🧹 접두사 제거: "${filename}" → "${cleanFilename}"`);
                    break;
                }
            }
            
            // CRITICAL FIX: Ensure currentFolderPath is set
            if (!this.currentFolderPath) {
                this.log(`  ❌ currentFolderPath가 설정되지 않음`);
                return;
            }
            
            // 현재 처리 중인 폴더를 기준으로 이미지 파일 경로 구성
            let imagePath = path.join(this.currentFolderPath, cleanFilename);
            this.log(`  📁 이미지 경로 구성: ${imagePath}`);
            
            // 파일 존재 확인
            const fs = await import('fs');
            if (!fs.existsSync(imagePath)) {
                this.log(`  ⚠️ 정확한 파일명으로 찾을 수 없음: ${imagePath}`);
                
                // 폴더 내 모든 이미지 파일 검색하여 유사한 파일명 찾기
                const actualImageFile = this.findSimilarImageFile(cleanFilename);
                if (actualImageFile) {
                    imagePath = path.join(this.currentFolderPath, actualImageFile);
                    this.log(`  🔍 유사한 파일 발견: "${actualImageFile}"`);
                } else {
                    this.log(`  ❌ 이미지 파일을 찾을 수 없음: ${imagePath}`);
                    return;
                }
            }
            
            this.log(`  📁 이미지 파일 경로: ${imagePath}`);
            
            // 줄바꿈 후 이미지 삽입
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.press('Enter');
            
            // 이미지 삽입 버튼 클릭 시도 (현재 Naver 블로그 UI에 맞게 업데이트)
            const imageSelectors = [
                'li.se-toolbar-item-image > button',  // 2026-04 현재 네이버 UI
                '.se-toolbar-item-image button',
                'button[data-name="photo"]',
                '.se-image-toolbar-button',
                '.se-insert-image-toolbar-button',
                '[data-group="documentToolbar"][data-name="photo"]',
                'button[aria-label="사진"]',
                '.se-toolbar-group button[title*="사진"]',
                '.se-toolbar-group button[title*="이미지"]',
                'button.se-document-toolbar-icon-button[data-name="photo"]'
            ];
            
            let imageButtonClicked = false;
            let fileChooserHandled = false;

            // 파일 선택창 자동 처리: 열리면 즉시 파일 설정
            try {
                this.page.once('filechooser', async (fc) => {
                    try {
                        await fc.setFiles(imagePath);
                        fileChooserHandled = true;
                        this.log('  ✅ 파일 선택창 자동 처리 완료');
                    } catch (e) {
                        this.log(`  ⚠️ 파일 선택창 자동 처리 실패: ${e.message}`);
                    }
                });
            } catch {}
            for (const selector of imageSelectors) {
                try {
                    await this.frame.click(selector, { timeout: 2000 });
                    this.log(`  ✅ 이미지 버튼 클릭 성공 (셀렉터: ${selector})`);
                    imageButtonClicked = true;
                    break;
                } catch (e) {
                    this.log(`  ⚠️ 이미지 버튼 셀렉터 실패: ${selector}`);
                }
            }
            
            if (!imageButtonClicked) {
                this.log(`  ❌ 모든 이미지 버튼 셀렉터 실패`);
                return;
            }
            
            await this.page.waitForTimeout(700);
            
            // 파일 업로드 처리 - 파일 선택창이 떠도 자동으로 닫히며(up) input.setInputFiles 병행
            try {
                // 파일 입력 요소를 찾아서 파일 설정 (현재 Naver 블로그 UI에 맞게 업데이트)
                const fileInputSelectors = [
                    'input[type="file"]',
                    'input[accept*="image"]',
                    '.se-file-input',
                    'input[accept="image/*"]',
                    '.se-popup input[type="file"]',
                    '.se-dialog input[type="file"]'
                ];
                
                let fileUploaded = false;
                for (const selector of fileInputSelectors) {
                    try {
                        // Try both frame and page contexts
                        const contexts = [this.frame, this.page];
                        
                        for (const context of contexts) {
                            const fileInput = await context.$(selector);
                            if (fileInput) {
                                await fileInput.setInputFiles(imagePath);
                                this.log(`  ✅ 파일 업로드 성공 (${context === this.frame ? 'iframe' : 'main'}): ${filename}`);
                                fileUploaded = true;
                                break;
                            }
                        }
                        
                        if (fileUploaded) break;
                    } catch (e) {
                        this.log(`  ⚠️ 파일 입력 셀렉터 실패: ${selector} - ${e.message}`);
                    }
                }
                
                // 파일 선택창 이벤트로 이미 처리되었으면 업로드 대기만 수행
                if (!fileUploaded && fileChooserHandled) {
                    this.log('  ℹ️ 파일 선택창 경로로 업로드 처리됨 - 표시 대기');
                    fileUploaded = true;
                }

                if (!fileUploaded) {
                    this.log(`  ❌ 모든 파일 입력 셀렉터 실패 - 이미지 업로드 불가`);
                    return;
                }
                
                // 업로드 완료 대기 및 확인
                await this.page.waitForTimeout(1500);
                
                // 업로드 완료 확인
                try {
                    const uploadComplete = await this.frame.waitForSelector('.se-component img, .se-image-container', {
                        timeout: 10000
                    });
                    
                    if (uploadComplete) {
                        this.log(`  ✅ 이미지 업로드 완료 및 표시 확인`);
                    } else {
                        this.log(`  ⚠️ 이미지 업로드 완료되었으나 표시 확인 불가`);
                    }
                } catch (error) {
                    this.log(`  ⚠️ 이미지 표시 확인 실패: ${error.message}`);
                }
                
            } catch (error) {
                this.log(`  ❌ 이미지 업로드 실패: ${error.message}`, 'error');
            }
            
        } catch (error) {
            this.log(`  ❌ 이미지 처리 실패: ${error.message}`, 'error');
        }
    }

    // Get all images from the current folder
    getAllImagesFromFolder() {
        try {
            const fs = require('fs');
            
            if (!this.currentFolderPath) {
                this.log(`  ❌ currentFolderPath가 설정되지 않음`);
                return [];
            }
            
            // 현재 폴더의 모든 파일 읽기
            const files = fs.readdirSync(this.currentFolderPath);
            
            // 이미지 파일 확장자
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
            
            // 이미지 파일만 필터링
            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return imageExtensions.includes(ext);
            });
            
            this.log(`  📁 폴더 내 이미지 파일들: ${imageFiles.join(', ')}`);
            return imageFiles;
            
        } catch (error) {
            this.log(`  ❌ 이미지 파일 스캔 실패: ${error.message}`, 'error');
            return [];
        }
    }

    // Smart image file finder
    findSimilarImageFile(targetFilename) {
        try {
            const imageFiles = this.getAllImagesFromFolder();
            
            // 1. 정확한 파일명 매치 (확장자 제외)
            const targetBase = path.parse(targetFilename).name;
            for (const file of imageFiles) {
                const fileBase = path.parse(file).name;
                if (fileBase === targetBase) {
                    this.log(`  ✅ 정확한 매치 발견: ${file}`);
                    return file;
                }
            }
            
            // 1.5 끝자리 인덱스 우선 매칭: *_<index> 형식이 있으면 동일 인덱스를 가진 파일을 선택
            const indexMatch = /_(\d+)$/.exec(targetBase);
            if (indexMatch) {
                const wantedIndex = indexMatch[1];
                const candidateByIndex = imageFiles.find(file => new RegExp(`_(?:0*)${wantedIndex}\\.[a-zA-Z0-9]+$`).test(file));
                if (candidateByIndex) {
                    this.log(`  ✅ 인덱스 기반 매치: _${wantedIndex} → ${candidateByIndex}`);
                    return candidateByIndex;
                }
            }

            // 2. 부분 매치 (파일명에 타겟이 포함되거나 타겟에 파일명이 포함)
            for (const file of imageFiles) {
                const fileBase = path.parse(file).name.toLowerCase();
                const targetBaseLower = targetBase.toLowerCase();
                
                if (fileBase.includes(targetBaseLower) || targetBaseLower.includes(fileBase)) {
                    this.log(`  🔍 부분 매치 발견: ${file}`);
                    return file;
                }
            }
            
            // 3. 숫자 매치 (보수적): 파일 끝에서 가까운 숫자 토큰 우선
            const allNums = [...targetBase.matchAll(/_(\d+)$/g)];
            if (allNums.length > 0) {
                const last = allNums[allNums.length - 1][1];
                const byLast = imageFiles.find(file => new RegExp(`_(?:0*)${last}\\.[a-zA-Z0-9]+$`).test(file));
                if (byLast) {
                    this.log(`  🔢 보수적 숫자 매치: _${last} → ${byLast}`);
                    return byLast;
                }
            }
            
            this.log(`  ❌ 유사한 파일을 찾을 수 없음`);
            return null;
            
        } catch (error) {
            this.log(`  ❌ 파일 검색 중 오류: ${error.message}`, 'error');
            return null;
        }
    }

    // Optimized text input with multiple fallback methods
    async optimizedTypeText(text) {
        try {
            if (!text) {
                this.log(`  ⚠️ 빈 텍스트 - 스킵`);
                return;
            }

            // 브라우저 상태 확인
            if (!this.page || this.page.isClosed()) {
                this.log(`  ❌ 브라우저가 닫혀있습니다. 텍스트 입력 불가능.`);
                return;
            }
            
            this.log(`  🔤 텍스트 입력 시작: "${text.substring(0, 30)}..." (${text.length}자)`);
            
            // CRITICAL FIX: Ensure content area focus before typing
            const focusResult = await this.ensureContentAreaFocus();
            if (focusResult === false) {
                this.log(`  ⚠️ 콘텐츠 영역 포커스 실패 - 입력 스킵`);
                return;
            }
            
            // Verify we have a focused editable area; typing always uses page.keyboard
            if (!this.frame) {
                this.log(`  ⚠️ iframe 미감지 - 메인 페이지로 입력 시도`);
                try {
                    await this.page.click('.se-component', { timeout: 2000 });
                    await this.page.waitForTimeout(200);
                } catch (e) {
                    this.log(`  ⚠️ 메인 페이지 콘텐츠 영역 클릭 실패 - 계속 진행`);
                }
            }
            
            // 줄바꿈 처리 - use iframe context with error handling
            if (text.includes('\n')) {
                const parts = text.split('\n');
                this.log(`  🔍 줄바꿈 처리: ${parts.length}개 부분`);
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i]) {
                        try {
                            await this.page.keyboard.type(parts[i], { delay: 3 });
                            this.log(`    - 부분 ${i + 1} 입력 완료 (${parts[i].length}자)`);
                        } catch (error) {
                            this.log(`    ❌ 부분 ${i + 1} 입력 실패: ${error.message}`);
                            await this.page.keyboard.type(parts[i], { delay: 3 });
                        }
                    }
                    if (i < parts.length - 1) {
                        try {
                            await this.page.keyboard.press('Enter');
                        } catch (error) {
                            await this.page.keyboard.press('Enter');
                        }
                    }
                }
            } else {
                try {
                    await this.page.keyboard.type(text, { delay: 3 });
                    this.log(`  ✅ iframe로 입력 완료: ${text.length}자`);
                } catch (error) {
                    this.log(`  ⚠️ iframe 입력 실패, 메인 페이지로 재시도: ${error.message}`);
                    
                    // CRITICAL FIX: Switch to main page context properly
                    try {
                        await this.page.click('.se-component', { timeout: 2000 });
                        await this.page.waitForTimeout(300);
                        this.log(`  🔄 메인 페이지 컴텍스트로 전환`);
                    } catch (e) {
                        this.log(`  ⚠️ 컴텍스트 전환 실패: ${e.message}`);
                    }
                    
                    await this.page.keyboard.type(text, { delay: 3 });
                    this.log(`  ✅ 메인 페이지로 입력 완료: ${text.length}자`);
                }
            }
            
        } catch (error) {
            this.log(`  ❌ 텍스트 입력 실패: ${error.message}`, 'error');
            
            // ULTIMATE FALLBACK: Direct DOM manipulation
            this.log(`  🆘 최종 폴백: DOM 직접 조작`);
            try {
                if (this.frame) {
                    await this.frame.evaluate((textToInsert) => {
                        const selectors = ['.se-component', '.se-text-paragraph', '.se-content'];
                        for (const selector of selectors) {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.innerHTML = textToInsert.replace(/\n/g, '<br>');
                                element.click();
                                element.focus();
                                return true;
                            }
                        }
                        return false;
                    }, text);
                    this.log(`  ✅ DOM 직접 조작 성공`);
                } else {
                    await this.page.evaluate((textToInsert) => {
                        const selectors = ['.se-component', '.se-text-paragraph', '.se-content'];
                        for (const selector of selectors) {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.innerHTML = textToInsert.replace(/\n/g, '<br>');
                                element.click();
                                element.focus();
                                return true;
                            }
                        }
                        return false;
                    }, text);
                    this.log(`  ✅ 메인 페이지 DOM 직접 조작 성공`);
                }
            } catch (domError) {
                this.log(`  ❌ DOM 직접 조작도 실패: ${domError.message}`, 'error');
            }
        }
    }


    async createNewPost() {
        try {
            this.log('📝 새 글쓰기 페이지로 직접 이동...');
            
            // Navigate to current account's blog URL
            const currentAccount = this.accounts[this.currentAccountIndex];
            const writeUrl = currentAccount.blogUrl;
            
            this.log(`🌐 URL 직접 이동: ${writeUrl}`);
            
            await this.page.goto(writeUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            // Wait for page loading
            this.log('⏳ 페이지 로딩 대기 중...');
            await this.page.waitForTimeout(3000);
            
            // Re-setup iframe
            await this.setupIframe();
            // 새 글쓰기 진입 시 팝업/도움말 닫기
            await this.closeWritePagePopups();
            
            this.log('✅ 새 글쓰기 페이지 준비 완료 (URL 직접 이동)');
            
        } catch (error) {
            this.log(`❌ 새 글쓰기 페이지 이동 실패: ${error.message}`, 'error');
            throw error;
        }
    }

    async moveCompletedFolder(folderName) {
        try {
            // Handle review_ prefix for folder names
            let actualFolderName = folderName;
            if (folderName.startsWith('review_')) {
                actualFolderName = folderName.replace('review_', '');
            }
            
            const readyPath = path.join('files/ready', actualFolderName);
            const donePath = path.join('files/done', actualFolderName);
            
            // Create done folder if it doesn't exist
            const doneDir = 'files/done';
            try {
                await fs.mkdir(doneDir, { recursive: true });
            } catch (e) {
                // Ignore if exists
            }
            
            // If target folder exists, remove it first
            try {
                await fs.rm(donePath, { recursive: true, force: true });
            } catch (e) {
                // Ignore if doesn't exist
            }
            
            // Move folder (rename)
            await fs.rename(readyPath, donePath);
            this.log(`📦 "${actualFolderName}" 폴더를 done으로 이동 완료`);
            
        } catch (error) {
            this.log(`❌ 폴더 이동 실패 (${folderName}): ${error.message}`, 'error');
        }
    }

    /**
     * Find content in date-based folder structure
     * Searches for keyword folder across all date folders
     * @param {string} keyword - The keyword to search for
     * @returns {Promise<string|null>} The path to the found content or null
     */
    async findContentInDateBasedStructure(keyword) {
        try {
            const reviewBasePath = path.resolve('../blog-content-generator/review');
            // review_brand_YYYY-MM-DD_keyword 혹은 brand_YYYY-MM-DD_keyword 형태 파싱
            // 예: review_myblog_2026-01-01_키워드, myblog_2026-01-01_키워드
            const mReview = /^review_(?<brand>[^_]+)_(?<date>\d{4}-\d{2}-\d{2})_(?<kw>.+)$/.exec(keyword);
            const mPlain = /^(?<brand>[^_]+)_(?<date>\d{4}-\d{2}-\d{2})_(?<kw>.+)$/.exec(keyword);
            const m = mReview || mPlain;
            if (m && m.groups) {
                const brand = m.groups.brand;
                const date = m.groups.date;
                const kw = m.groups.kw;
                const brandDatePath = path.join(reviewBasePath, brand, date, kw);
                try {
                    await fs.access(brandDatePath);
                    this.log(`📅 정규 경로에서 키워드 발견: ${brand}/${date}/${kw}`);
                    return brandDatePath;
                } catch {}
            }
            
            // brand/날짜/키워드 구조 순회 (최신 날짜 우선)
            const brands = await fs.readdir(reviewBasePath).catch(() => []);
            for (const brand of brands) {
                const brandPath = path.join(reviewBasePath, brand);
                const dates = await fs.readdir(brandPath).catch(() => []);
                const sortedDates = dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
                for (const date of sortedDates) {
                    const candidate = path.join(brandPath, date, keyword);
                    try {
                        await fs.access(candidate);
                        this.log(`📅 키워드 "${keyword}" 발견: ${brand}/${date}/${keyword}`);
                        return candidate;
                    } catch {}
                }
            }
            
            // If not found in date-based structure, check legacy structure
            const legacyPath = path.join(reviewBasePath, keyword);
            try {
                await fs.access(legacyPath);
                this.log(`📁 레거시 구조에서 키워드 "${keyword}" 발견: ${keyword}`);
                return legacyPath;
            } catch {
                // Not found anywhere
            }
            
            return null;
        } catch (error) {
            this.log(`❌ 날짜별 구조 검색 실패: ${error.message}`, 'error');
            return null;
        }
    }

    async copyReviewToReady(folderName, sourcePath, destPath) {
        try {
            // Ensure ready directory exists
            const readyDir = 'files/ready';
            try {
                await fs.mkdir(readyDir, { recursive: true });
            } catch (e) {
                // Ignore if exists
            }
            
            // Copy entire folder from review to ready
            await this.copyFolder(sourcePath, destPath);
            this.log(`📋 "${folderName}" 콘텐츠를 review에서 ready로 복사 완료`);
            
        } catch (error) {
            this.log(`❌ 콘텐츠 복사 실패 (${folderName}): ${error.message}`, 'error');
            throw error;
        }
    }

    async copyFolder(src, dest) {
        try {
            try {
                await fs.mkdir(dest, { recursive: true });
            } catch (e) {
                // Ignore if exists
            }
            
            const items = await fs.readdir(src);
            
            for (const item of items) {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);
                const stat = await fs.stat(srcPath);
                
                if (stat.isDirectory()) {
                    await this.copyFolder(srcPath, destPath);
                } else {
                    await fs.copyFile(srcPath, destPath);
                }
            }
        } catch (error) {
            this.log(`❌ 폴더 복사 중 오류: ${error.message}`, 'error');
            throw error;
        }
    }

    // Helper functions from main.js reference implementation
    shouldAddHorizontalLineBeforeSubtitle(currentElement, elements, currentIndex) {
        // 다음 요소가 소제목이면서 첫 번째 소제목이 아닌 경우에 구분선 추가
        const nextElement = elements[currentIndex + 1];
        
        if (!nextElement || nextElement.type !== 'subtitle') {
            return false;
        }
        
        // 첫 번째 소제목 앞에는 구분선을 추가하지 않음
        const isFirstSubtitle = elements.slice(0, currentIndex + 1).every(el => el.type !== 'subtitle');
        
        return !isFirstSubtitle;
    }

    async addHorizontalLine() {
        try {
            this.log(`  📏 구분선 추가`);
            
            // 구분선 버튼 클릭
            const horizontalLineSelectors = [
                '.se-insert-horizontal-line-default-toolbar-button',
                'button[data-name="horizontal-line"]',
                '.se-document-toolbar-icon-select-button[data-name="horizontal-line"]',
                '[data-group="documentToolbar"][data-name="horizontal-line"]'
            ];
            
            let lineAdded = false;
            for (const selector of horizontalLineSelectors) {
                try {
                    await this.frame.click(selector, { timeout: 1000 });
                    this.log(`  ✅ 구분선 추가 성공 (셀렉터: ${selector})`);
                    lineAdded = true;
                    break;
                } catch (e) {
                    this.log(`  ⚠️ 셀렉터 실패: ${selector} - ${e.message}`);
                }
            }
            
            if (!lineAdded) {
                this.log(`  ❌ 모든 구분선 셀렉터 실패`);
            }
            
            await this.page.waitForTimeout(200);
            
        } catch (error) {
            this.log(`  ❌ 구분선 추가 실패: ${error.message}`, 'error');
        }
    }

    // Enhanced title entry method with iframe support
    async enterTitle(title) {
        try {
            this.log(`📝 제목 입력: "${title}"`);
            
            // Try iframe context first (exact Agent_blog_upload approach)
            if (this.frame) {
                this.log(`  🌐 iframe 컨텍스트에서 제목 입력 시도`);
                
                // Try the exact selector from NaverBlogService first
                const naverSelector = '.se-text-paragraph:has-text("제목")';
                try {
                    const titleElement = await this.frame.$(naverSelector);
                    if (titleElement) {
                        this.log(`  ✅ 네이버 블로그 제목 요소 발견`);
                        
                        // Exact NaverBlogService approach
                        await titleElement.scrollIntoViewIfNeeded();
                        await titleElement.click({ position: { x: 300, y: 24 } });
                        await this.page.waitForTimeout(200);
                        
                        // Select all and type
                        await this.page.keyboard.press('Control+a');
                        await this.page.waitForTimeout(100);
                        await this.page.keyboard.type(title, { delay: 5 });
                        
                        // Move to content area
                        this.log(`  📝 제목 입력 완료, 본문 영역으로 이동`);
                        await this.page.keyboard.press('Tab');
                        await this.page.waitForTimeout(300);
                        await this.page.keyboard.press('Enter');
                        await this.page.waitForTimeout(200);
                        
                        this.log(`  ✅ 제목 입력 및 본문 이동 완료`);
                        return true;
                    }
                } catch (error) {
                    this.log(`  ⚠️ 네이버 셀렉터 실패: ${error.message}`);
                }
                
                // Try other iframe selectors
                const iframeSelectors = [
                    'input[placeholder*="제목"]',
                    'textarea[placeholder*="제목"]',
                    '.se-title-text',
                    '.se-component-content .se-text-paragraph:first-child',
                    '#title'
                ];
                
                for (const selector of iframeSelectors) {
                    try {
                        const element = await this.frame.$(selector);
                        if (element) {
                            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                            
                            if (tagName === 'input' || tagName === 'textarea') {
                                await element.fill(title);
                            } else {
                                await element.click();
                                await this.page.keyboard.type(title, { delay: 5 });
                            }
                            
                            this.log(`  ✅ iframe 제목 입력 성공: ${selector}`);
                            return true;
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
            
            // Fallback to main page context
            this.log(`  🔄 메인 페이지 컨텍스트로 전환`);
            const mainPageSelectors = [
                'input[placeholder*="제목"]',
                '.se-title-input',
                '#title',
                'input[type="text"]'
            ];
            
            for (const selector of mainPageSelectors) {
                try {
                    const titleInput = await this.page.$(selector);
                    if (titleInput) {
                        await titleInput.fill(title);
                        this.log(`  ✅ 메인 페이지 제목 입력 완료: ${selector}`);
                        return true;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            this.log(`❌ 제목 입력 필드를 찾을 수 없음`);
            return false;
            
        } catch (error) {
            this.log(`❌ 제목 입력 실패: ${error.message}`, 'error');
            return false;
        }
    }

    async verifyResult(expectedStats, expectedContent) {
        try {
            this.log('\n🔍 최종 결과 검증...');
            
            const result = await this.frame.evaluate((expectedText) => {
                const contentArea = document.querySelector('.se-main-container') ||
                                  document.querySelector('.se-content') ||
                                  document.body;
                
                if (contentArea) {
                    const fullText = contentArea.textContent.trim();
                    const textElements = contentArea.querySelectorAll('*');
                    const formattedElements = [];
                    
                    textElements.forEach(el => {
                        if (el.textContent && el.textContent.trim()) {
                            const style = window.getComputedStyle(el);
                            const isBlockquote = el.tagName === 'BLOCKQUOTE' || 
                                                 el.classList.contains('se-quotation') ||
                                                 el.classList.contains('blockquote') ||
                                                 el.closest('blockquote') ||
                                                 el.closest('.se-quotation');
                            
                            const hasFormatting = 
                                style.fontWeight === 'bold' || 
                                style.fontWeight === '700' ||
                                style.fontStyle === 'italic' ||
                                style.textDecoration.includes('underline') ||
                                (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
                                isBlockquote;
                            
                            if (hasFormatting) {
                                formattedElements.push({
                                    text: el.textContent.trim().substring(0, 30),
                                    bold: style.fontWeight === 'bold' || style.fontWeight === '700',
                                    italic: style.fontStyle === 'italic',
                                    underline: style.textDecoration.includes('underline'),
                                    highlight: style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent',
                                    blockquote: isBlockquote
                                });
                            }
                        }
                    });
                    
                    // CRITICAL FIX: Verify actual expected content is present
                    const expectedKeywords = [
                        '아킬레스건통증', '발뒤꿈치', '통증', '머른', 
                        '조건', '안녕하세요', '발등통증'
                    ];
                    
                    const hasKeywords = expectedKeywords.some(keyword => fullText.includes(keyword));
                    const hasMinimumContent = fullText.length > 200; // Increased minimum
                    
                    return {
                        success: true,
                        totalLength: fullText.length,
                        formattedCount: formattedElements.length,
                        formattedElements: formattedElements,
                        hasExpectedText: hasKeywords && hasMinimumContent,
                        actualContent: fullText.substring(0, 200) + '...', // For debugging
                        keywordsFound: hasKeywords
                    };
                }
                
                return { success: false, error: '콘텐츠 영역을 찾을 수 없음' };
            }, expectedContent);
            
            if (result.success) {
                this.log(`📊 전체 콘텐츠: ${result.totalLength}자`);
                this.log(`🎨 실제 서식 적용: ${result.formattedCount}개`);
                this.log(`📝 예상 텍스트 포함: ${result.hasExpectedText ? '✅' : '❌'}`);
                
                // 예상 vs 실제 비교
                const totalExpected = expectedStats.bold + expectedStats.underline + expectedStats.italic + expectedStats.combined + expectedStats.highlight + expectedStats.quote;
                const efficiency = totalExpected > 0 ? Math.round((result.formattedCount / totalExpected) * 100) : 0;
                
                this.log(`\n📈 서식 적용 효율성: ${efficiency}% (${result.formattedCount}/${totalExpected})`);
                
                if (result.formattedElements.length > 0) {
                    this.log('\n📋 적용된 서식 요소들 (일부):');
                    result.formattedElements.slice(0, 5).forEach((el, index) => {
                        const formats = [];
                        if (el.bold) formats.push('볼드');
                        if (el.italic) formats.push('이탤릭');
                        if (el.underline) formats.push('언더라인');
                        if (el.highlight) formats.push('하이라이트');
                        if (el.blockquote) formats.push('인용구');
                        
                        this.log(`  ${index + 1}. "${el.text}" - ${formats.join(', ')}`);
                    });
                }
                
                // CRITICAL FIX: Strict success validation
                if (result.hasExpectedText && result.keywordsFound && result.totalLength > 200) {
                    this.log('\n🎉 마크다운 업로드 성공! 텍스트와 서식이 모두 적용되었습니다.');
                    return true; // Actually successful
                } else {
                    this.log(`\n❌ 업로드 실패: 키워드=${result.keywordsFound}, 길이=${result.totalLength}, 예상텍스트=${result.hasExpectedText}`);
                    this.log(`📝 실제 콘텐츠: ${result.actualContent}`);
                    return false; // Actually failed
                }
                
            } else {
                this.log(`❌ 결과 확인 실패: ${result.error}`);
            }
            
        } catch (error) {
            this.log(`❌ 결과 검증 오류: ${error.message}`, 'error');
        }
    }
}

// Main execution
async function main() {
    // Send initial startup log
    console.log('🚀 Agent Blog Upload 시스템 시작...');
    
    // Parse command line arguments for content mappings
    let contentMappings = null;
    
    // Check for Base64 encoded mappings (safer for shell)
    const base64Index = process.argv.indexOf('--mappings-base64');
    if (base64Index !== -1 && process.argv[base64Index + 1]) {
        try {
            const base64Data = process.argv[base64Index + 1];
            const jsonData = Buffer.from(base64Data, 'base64').toString('utf-8');
            contentMappings = JSON.parse(jsonData);
            console.log(`📋 Content mappings received (Base64): ${contentMappings.length} items`);
        } catch (error) {
            console.log(`⚠️ Invalid Base64 content mappings: ${error.message}`);
        }
    }
    // Legacy: Try parsing first argument as JSON (fallback)
    else if (process.argv.length > 2) {
        try {
            contentMappings = JSON.parse(process.argv[2]);
            console.log(`📋 Content mappings received (JSON): ${JSON.stringify(contentMappings)}`);
        } catch (error) {
            console.log(`⚠️ Invalid content mappings argument: ${error.message}`);
        }
    }
    
    const automation = new AgentBlogUploadReplication(contentMappings);
    
    try {
        await automation.run();
        
        // 실제 성공/실패 통계를 기반으로 결과 판단
        const hasSuccessfulUploads = automation.totalSuccessfulPosts > 0;
        const hasOnlyFailures = automation.totalFailedPosts > 0 && automation.totalSuccessfulPosts === 0;
        
        console.log(`📊 업로드 결과: 성공 ${automation.totalSuccessfulPosts}개, 실패 ${automation.totalFailedPosts}개`);
        
        if (hasOnlyFailures) {
            return {
                success: false,
                message: `모든 업로드 실패 (${automation.totalFailedPosts}개)`,
                totalPosts: automation.totalProcessedPosts,
                successfulPosts: automation.totalSuccessfulPosts,
                failedPosts: automation.totalFailedPosts,
                accountStats: automation.accountStats
            };
        } else if (hasSuccessfulUploads) {
            return {
                success: true,
                message: `업로드 완료: 성공 ${automation.totalSuccessfulPosts}개, 실패 ${automation.totalFailedPosts}개`,
                totalPosts: automation.totalProcessedPosts,
                successfulPosts: automation.totalSuccessfulPosts,
                failedPosts: automation.totalFailedPosts,
                accountStats: automation.accountStats
            };
        } else {
            return {
                success: false,
                message: '처리된 콘텐츠가 없습니다',
                totalPosts: 0,
                successfulPosts: 0,
                failedPosts: 0,
                accountStats: automation.accountStats
            };
        }
        
    } catch (error) {
        console.error(`❌ Upload process failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            totalPosts: 0,
            successfulPosts: 0,
            failedPosts: 0
        };
    }
}

// CLI execution - only run when called from web interface
// ES modules에서는 import.meta.url을 사용하여 main module 체크
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;
// DEBUG removed
if (isMainModule) {
    // Check if this is being called from the web interface
    const isWebInterface = process.env.WEB_INTERFACE === 'true' || process.argv.includes('--web-interface');
    
    if (isWebInterface) {
        console.log('🌐 네이버 블로그 자동화가 웹 인터페이스에서 시작되었습니다.');
        console.log('🔍 업로드 시스템 초기화 중...');
        main()
            .then(result => {
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.success ? 0 : 1);
            })
            .catch(error => {
                console.error(`Unexpected error: ${error.message}`);
                console.log(JSON.stringify({ success: false, error: error.message }));
                process.exit(1);
            });
    } else {
        console.log('⚠️  이 스크립트는 웹 인터페이스를 통해 실행되어야 합니다.');
        console.log('🌐 웹 대시보드에서 "Start" 버튼을 클릭하여 실행하세요.');
        console.log('📍 또는 --web-interface 플래그를 사용하여 직접 실행할 수 있습니다.');
        process.exit(1);
    }
}

export { AgentBlogUploadReplication };