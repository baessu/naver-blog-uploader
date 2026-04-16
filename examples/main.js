import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { NaverLoginService } from '../src/services/NaverLoginService.js';
import { NaverBlogService } from '../src/services/NaverBlogService.js';

dotenv.config();

class MarkdownToBlogOptimized {
    constructor() {
        this.page = null;
        this.frame = null;
        this.currentFormats = new Set();
        this.appliedElements = new Set(); // 중복 방지
        this.browser = null;
        
        // 멀티 계정 설정 (환경변수에서 로드)
        const username1 = process.env.NAVER_USERNAME || process.env.NAVER_ID_1;
        const username2 = process.env.NAVER_USERNAME_2 || process.env.NAVER_ID_2;
        this.accounts = [
            {
                id: username1,
                password: process.env.NAVER_PASSWORD || process.env.NAVER_PASSWORD_1,
                blogUrl: username1
                    ? `https://blog.naver.com/${username1}?Redirect=Write&`
                    : undefined,
                maxPosts: 7,
                name: '첫 번째 계정',
            },
            {
                id: username2,
                password: process.env.NAVER_PASSWORD_2,
                blogUrl: username2
                    ? `https://blog.naver.com/${username2}?Redirect=Write&`
                    : undefined,
                maxPosts: 7,
                name: '두 번째 계정',
            },
        ].filter(acc => acc.id && acc.password);
        
        this.currentAccountIndex = 0;
        this.currentAccountPostCount = 0;
        this.totalProcessedPosts = 0;
        this.accountStats = []; // 계정별 처리 통계
    }

    async run() {
        console.log('📝 마크다운 → 블로그 멀티계정 최적화 업로드 시작...\n');
        
        try {
            const { chromium } = await import('playwright');
            this.browser = await chromium.launch({
                headless: false,
                slowMo: 100
            });
            
            this.page = await this.browser.newPage({
                viewport: { width: 1280, height: 720 },
                locale: 'ko-KR'
            });

            // 전체 폴더 개수 확인
            const allFolders = await this.getAllReadyFolders();
            if (allFolders.length === 0) {
                console.log('📁 처리할 폴더가 없습니다.');
                await this.browser.close();
                return;
            }
            
            console.log(`📂 총 ${allFolders.length}개 폴더 발견`);
            console.log(`👥 ${this.accounts.length}개 계정으로 분산 업로드 예정\n`);
            
            // 각 계정별로 순차 처리
            for (let accountIndex = 0; accountIndex < this.accounts.length; accountIndex++) {
                const account = this.accounts[accountIndex];
                this.currentAccountIndex = accountIndex;
                this.currentAccountPostCount = 0;
                
                // 현재 남은 폴더 확인
                const remainingFolders = await this.getAllReadyFolders();
                if (remainingFolders.length === 0) {
                    console.log(`✅ 모든 폴더 처리 완료!`);
                    break;
                }
                
                console.log(`\n🔄 ${account.name} (${account.id}) 계정으로 전환...`);
                
                // 계정 로그인 및 처리
                await this.processWithAccount(account, Math.min(account.maxPosts, remainingFolders.length));
                
                // 계정별 통계 저장
                this.accountStats.push({
                    name: account.name,
                    id: account.id,
                    postsCount: this.currentAccountPostCount,
                    maxPosts: account.maxPosts
                });
                
                this.totalProcessedPosts += this.currentAccountPostCount;
                console.log(`✅ ${account.name} 처리 완료 (${this.currentAccountPostCount}개 글 작성)\n`);
            }
            
            // 최종 통계 출력
            console.log('\n🎉 모든 계정의 블로그 글 작성이 완료되었습니다!');
            console.log('\n📊 처리 결과 요약:');
            console.log(`📝 총 ${this.totalProcessedPosts}개 글 작성 완료`);
            console.log('👥 계정별 상세 결과:');
            
            this.accountStats.forEach((stat, index) => {
                const percentage = Math.round((stat.postsCount / stat.maxPosts) * 100);
                console.log(`  ${index + 1}. ${stat.name} (${stat.id}): ${stat.postsCount}/${stat.maxPosts}개 (${percentage}%)`);
            });
            
            console.log('\n📱 브라우저를 30초 후 종료합니다...');
            await this.page.waitForTimeout(30000);
            
            await this.browser.close();
            
        } catch (error) {
            console.error('❌ 전체 프로세스 중 오류:', error);
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    async processWithAccount(account, maxPostsForThisAccount) {
        try {
            const loginService = new NaverLoginService(this.page);
            const blogService = new NaverBlogService(this.page);
            
            // 계정 로그인
            console.log(`🔐 ${account.name} 로그인 중...`);
            await loginService.login(account.id, account.password);
            
            // 해당 계정으로 폴더 처리
            await this.processAllReadyFoldersForAccount(blogService, account, maxPostsForThisAccount);
            
            // 계정 로그아웃 (다음 계정을 위해)
            if (this.currentAccountIndex < this.accounts.length - 1) {
                await this.logoutCurrentAccount();
            }
            
        } catch (error) {
            console.error(`❌ ${account.name} 처리 중 오류:`, error);
        }
    }

    async logoutCurrentAccount() {
        try {
            console.log('🚪 현재 계정 로그아웃 중...');
            
            // 안전한 로그아웃 처리를 위해 새 컨텍스트 생성
            console.log('🔄 새로운 브라우저 컨텍스트로 세션 초기화...');
            
            // 기존 페이지 닫기 (안전하게)
            try {
                if (this.page && !this.page.isClosed()) {
                    await this.page.close();
                }
            } catch (closeError) {
                console.log(`⚠️ 기존 페이지 닫기 시 오류 (무시): ${closeError.message}`);
            }
            
            // 새 페이지 생성
            this.page = await this.browser.newPage({
                viewport: { width: 1280, height: 720 },
                locale: 'ko-KR'
            });
            
            // 네이버 메인 페이지로 이동하여 세션 상태 확인
            await this.page.goto('https://www.naver.com', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            await this.page.waitForTimeout(2000);
            
            console.log('✅ 새로운 세션으로 초기화 완료');
            
        } catch (error) {
            console.log(`⚠️ 계정 전환 실패: ${error.message}`);
            
            // 최후의 수단: 완전히 새로운 페이지 생성
            try {
                this.page = await this.browser.newPage({
                    viewport: { width: 1280, height: 720 },
                    locale: 'ko-KR'
                });
                console.log('✅ 응급 페이지 생성 완료');
            } catch (emergencyError) {
                console.log(`❌ 응급 페이지 생성도 실패: ${emergencyError.message}`);
                throw emergencyError;
            }
        }
    }

    async processAllReadyFoldersForAccount(blogService, account, maxPosts) {
        try {
            // ready 폴더의 모든 폴더 가져오기 (최대 개수 제한)
            const allReadyFolders = await this.getAllReadyFolders();
            const readyFolders = allReadyFolders.slice(0, maxPosts);
            
            if (readyFolders.length === 0) {
                console.log('📁 현재 계정이 처리할 폴더가 없습니다.');
                return;
            }
            
            console.log(`📂 ${account.name}이 처리할 ${readyFolders.length}개 폴더: ${readyFolders.join(', ')}`);
            
            for (let i = 0; i < readyFolders.length; i++) {
                const folderName = readyFolders[i];
                console.log(`\n🚀 [${i + 1}/${readyFolders.length}] "${folderName}" 폴더 처리 시작...`);
                
                // 첫 번째 글이 아니면 새 글쓰기 페이지로 이동
                if (i === 0) {
                    await this.goToWritePage(account.blogUrl);
                } else {
                    await this.createNewPost();
                }
                
                // 현재 폴더의 글 작성
                const success = await this.processSingleFolder(folderName, blogService);
                
                if (success) {
                    // 완료된 폴더를 done으로 이동
                    await this.moveCompletedFolder(folderName);
                    this.currentAccountPostCount++;
                    console.log(`✅ [${i + 1}/${readyFolders.length}] "${folderName}" 처리 완료 및 done 폴더로 이동`);
                } else {
                    console.log(`❌ [${i + 1}/${readyFolders.length}] "${folderName}" 처리 실패`);
                }
                
                // 다음 글 작성을 위한 대기
                if (i < readyFolders.length - 1) {
                    console.log('⏳ 다음 글 작성을 위해 3초 대기...');
                    await this.page.waitForTimeout(3000);
                }
            }
            
        } catch (error) {
            console.error(`❌ ${account.name} 폴더 처리 중 오류:`, error);
        }
    }

    // 멀티 계정 시스템으로 대체됨 - processAllReadyFoldersForAccount 함수 사용

    async goToWritePage(blogUrl = null) {
        try {
            // 현재 계정의 블로그 URL 사용
            const targetUrl = blogUrl || this.accounts[this.currentAccountIndex].blogUrl;
            console.log(`📝 글쓰기 페이지로 이동... (${targetUrl})`);
            
            await this.page.goto(targetUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            await this.setupIframe();
            
        } catch (error) {
            console.error('❌ 글쓰기 페이지 이동 실패:', error);
            throw error;
        }
    }

    async setupIframe() {
        try {
            // iframe 설정
            const mainFrame = await this.page.$('#mainFrame');
            if (mainFrame) {
                this.frame = await mainFrame.contentFrame();
                console.log('✅ iframe 에디터 감지');
            } else {
                this.frame = this.page;
                console.log('✅ 메인 페이지 에디터 감지');
            }

            await this.page.waitForTimeout(2000);
            
        } catch (error) {
            console.error('❌ iframe 설정 실패:', error);
            throw error;
        }
    }

    async getAllReadyFolders() {
        try {
            const readyDir = 'files/ready';
            const folders = fs.readdirSync(readyDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            return folders;
        } catch (error) {
            console.log(`❌ ready 폴더 확인 실패: ${error.message}`);
            return [];
        }
    }

    async findMarkdownFileInFolder(folderName) {
        try {
            const folderPath = path.join('files/ready', folderName);
            const files = fs.readdirSync(folderPath)
                .filter(file => file.endsWith('.md'));
            
            if (files.length > 0) {
                const markdownPath = path.join(folderPath, files[0]);
                console.log(`📁 처리 중인 폴더: ${folderName}`);
                console.log(`📄 발견된 파일: ${files[0]}`);
                return markdownPath;
            }
            
            throw new Error(`폴더 "${folderName}"에서 마크다운 파일을 찾을 수 없습니다.`);
        } catch (error) {
            console.log(`❌ 파일 감지 실패: ${error.message}`);
            return null;
        }
    }

    async processSingleFolder(folderName, blogService) {
        try {
            // 현재 폴더 경로 저장 (이미지 처리용)
            this.currentFolderPath = path.join('files/ready', folderName);
            
            // 마크다운 파일 읽기 및 파싱
            console.log(`📖 "${folderName}" 폴더의 마크다운 파일 감지...`);
            const markdownPath = await this.findMarkdownFileInFolder(folderName);
            const content = await this.readMarkdownFile(markdownPath);
            
            if (!content) {
                console.log('❌ 마크다운 파일을 읽을 수 없습니다.');
                return false;
            }

            // 제목 추출 및 입력
            const { title, bodyContent } = this.extractTitleAndContent(content);
            console.log(`📝 제목: "${title}"`);
            
            await blogService.enterTitle(title);
            await this.page.waitForTimeout(1000);
            
            // 본문 영역 포커스
            await this.focusContentArea();
            
            // 마크업 파싱 및 업로드
            console.log('⚡ 마크업 파싱 및 최적화 업로드...');
            await this.parseAndUploadContent(bodyContent);
            
            // 콘텐츠 저장
            console.log('\n💾 콘텐츠 저장 중...');
            await this.saveBlogContent();
            
            console.log('\n✅ 글 작성 및 저장 완료!');
            return true;
            
        } catch (error) {
            console.error(`❌ "${folderName}" 폴더 처리 중 오류:`, error);
            return false;
        }
    }

    async createNewPost() {
        try {
            console.log('📝 새 글쓰기 페이지로 직접 이동...');
            
            // 현재 계정의 블로그 URL로 직접 이동 (URL 방식)
            const currentAccount = this.accounts[this.currentAccountIndex];
            const writeUrl = currentAccount.blogUrl;
            
            console.log(`  🌐 URL 직접 이동: ${writeUrl}`);
            
            await this.page.goto(writeUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            // 페이지 로딩 대기
            console.log('  ⏳ 페이지 로딩 대기 중...');
            await this.page.waitForTimeout(3000);
            
            // iframe 재설정
            await this.setupIframe();
            
            console.log('✅ 새 글쓰기 페이지 준비 완료 (URL 직접 이동)');
            
        } catch (error) {
            console.error('❌ 새 글쓰기 페이지 이동 실패:', error);
            
            // 대안: 기존 메뉴 버튼 방식으로 폴백
            console.log('🔄 대안: 메뉴 버튼 방식으로 재시도...');
            try {
                await this.createNewPostWithMenu();
            } catch (fallbackError) {
                console.error('❌ 메뉴 버튼 방식도 실패:', fallbackError);
                throw error;
            }
        }
    }

    async createNewPostWithMenu() {
        // 기존 메뉴 버튼 방식 (폴백용)
        console.log('📝 메뉴 버튼으로 새 글쓰기 시도...');
        
        const menuSelectors = [
            'button.overflow_menu_btn__AzKxF[aria-haspopup="menu"]',
            '.overflow_menu_btn_area__H01D4 button.overflow_menu_btn__AzKxF',
            'button.overflow_menu_btn__AzKxF',
            '.overflow_menu_btn__AzKxF',
            'button[aria-haspopup="menu"]',
            'button[class*="overflow_menu"]',
            '.icon_btnmore__pAr9y'
        ];
        
        let menuClicked = false;
        for (const selector of menuSelectors) {
            try {
                await this.page.click(selector, { timeout: 2000 });
                console.log(`  ✅ 메뉴 버튼 클릭 성공 (셀렉터: ${selector})`);
                menuClicked = true;
                break;
            } catch (e) {
                console.log(`  ⚠️ 메뉴 버튼 셀렉터 실패: ${selector}`);
            }
        }
        
        if (!menuClicked) {
            throw new Error('메뉴 버튼을 찾을 수 없습니다.');
        }
        
        await this.page.waitForTimeout(1000);
        
        const newPostSelectors = [
            '.menu_overflowmenu__r5BdC a.link__VwXBi[href="#"]',
            'a.link__VwXBi:has-text("새 글쓰기")',
            '.link__VwXBi[href="#"]:has-text("새 글쓰기")',
            'a:has-text("새 글쓰기")',
            '.item__DACiU a[href="#"]',
            '[class*="link"]:has-text("새 글쓰기")'
        ];
        
        let newPostClicked = false;
        for (const selector of newPostSelectors) {
            try {
                await this.page.click(selector, { timeout: 2000 });
                console.log(`  ✅ 새 글쓰기 버튼 클릭 성공 (셀렉터: ${selector})`);
                newPostClicked = true;
                break;
            } catch (e) {
                console.log(`  ⚠️ 새 글쓰기 버튼 셀렉터 실패: ${selector}`);
            }
        }
        
        if (!newPostClicked) {
            throw new Error('새 글쓰기 버튼을 찾을 수 없습니다.');
        }
        
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(2000);
        await this.setupIframe();
    }

    async moveCompletedFolder(folderName) {
        try {
            const readyPath = path.join('files/ready', folderName);
            const donePath = path.join('files/done', folderName);
            
            // done 폴더가 없으면 생성
            const doneDir = 'files/done';
            if (!fs.existsSync(doneDir)) {
                fs.mkdirSync(doneDir, { recursive: true });
                console.log('📁 done 폴더가 생성되었습니다.');
            }
            
            // 폴더 이동 (이름 변경)
            fs.renameSync(readyPath, donePath);
            console.log(`📦 "${folderName}" 폴더를 done으로 이동 완료`);
            
        } catch (error) {
            console.error(`❌ 폴더 이동 실패 (${folderName}):`, error);
        }
    }

    async readMarkdownFile(filePath) {
        try {
            if (!filePath) {
                throw new Error('파일 경로가 제공되지 않았습니다.');
            }
            
            const fullPath = path.resolve(filePath);
            const content = fs.readFileSync(fullPath, 'utf8');
            console.log(`✅ 파일 읽기 성공: ${content.length}자`);
            return content;
        } catch (error) {
            console.log(`❌ 파일 읽기 실패: ${error.message}`);
            return null;
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
        
        // If no title found, use default
        if (!title) {
            title = '제목 없음';
        }
        
        const bodyContent = lines.slice(bodyStart).join('\n').trim();
        return { title, bodyContent };
    }

    async focusContentArea() {
        try {
            await this.frame.evaluate(() => {
                const selectors = [
                    '.se-text-paragraph',
                    '.se-content', 
                    '.se-main-container',
                    '[contenteditable="true"]'
                ];
                
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.click();
                        element.focus();
                        break;
                    }
                }
            });
            
            console.log('✅ 본문 영역 포커스 완료');
            await this.page.waitForTimeout(300);
            
        } catch (error) {
            console.log(`❌ 포커스 오류: ${error.message}`);
        }
    }

    async parseAndUploadContent(content) {
        try {
            // 마크업 요소들 파싱
            const elements = this.parseMarkupElements(content);
            
            console.log(`🔍 파싱 결과: 총 ${elements.length}개 요소 발견`);
            
            // 통계 출력
            const stats = this.calculateStats(elements);
            console.log(`📊 서식 통계: 볼드 ${stats.bold}개, 언더라인 ${stats.underline}개, 이탤릭 ${stats.italic}개, 조합 ${stats.combined}개, 소제목 ${stats.subtitle}개, 인용구 ${stats.quote}개, 하이라이트 ${stats.highlight}개, 이미지 ${stats.image}개`);
            
            // Separate processing to avoid formatting/image conflicts
            const textElements = elements.filter(e => e.type !== 'image');
            const imageElements = elements.filter(e => e.type === 'image');
            
            console.log(`🔄 처리 방식: 텍스트 ${textElements.length}개 → 이미지 ${imageElements.length}개`);
            
            // Process text elements first to maintain formatting context
            for (let i = 0; i < textElements.length; i++) {
                const element = textElements[i];
                console.log(`\n📝 텍스트 ${i + 1}/${textElements.length}: ${element.type} - "${element.text.substring(0, 30)}${element.text.length > 30 ? '...' : ''}"`);
                
                await this.processElement(element);
                await this.page.waitForTimeout(50);
                
                // Add horizontal lines before subtitles within text processing
                if (element.type === 'subtitle' && i > 0) {
                    await this.addHorizontalLine();
                }
            }
            
            // Process images separately at the end
            if (imageElements.length > 0) {
                console.log(`📸 이미지 처리 시작: ${imageElements.length}개`);
                await this.page.waitForTimeout(200);
                
                for (let i = 0; i < imageElements.length; i++) {
                    const element = imageElements[i];
                    console.log(`\n📸 이미지 ${i + 1}/${imageElements.length}: ${element.filename}`);
                    
                    await this.processElement(element);
                    await this.page.waitForTimeout(100);
                }
            }
            
            // 모든 서식 해제
            await this.clearAllFormats();
            
            // 최종 결과 확인
            await this.verifyResult(stats);
            
        } catch (error) {
            console.log(`❌ 파싱 및 업로드 오류: ${error.message}`);
        }
    }

    parseMarkupElements(content) {
        const elements = [];
        
        // 정규식 패턴들 (우선순위 순서: 더 구체적인 것부터)
        const patterns = [
            { type: 'image', regex: /!\[([^\]]*)\]\(([^)]+)\)/g, format: [] }, // 이미지: ![alt](filename)
            { type: 'subtitle', regex: /##([^#\n]+)##/g, format: [] },
            { type: 'quote', regex: />>([^>\n]+)<</g, format: [] }, // 인용구: >>텍스트<<
            { type: 'highlight', regex: /==([^=\n]+)==/g, format: ['highlight'] }, // 하이라이트: ==텍스트==
            { type: 'bold_underline', regex: /\*\*__([^*_\n]+)__\*\*/g, format: ['bold', 'underline'] },
            { type: 'bold', regex: /\*\*([^*\n]+)\*\*/g, format: ['bold'] },
            { type: 'underline', regex: /__([^_\n]+)__/g, format: ['underline'] },
            { type: 'italic', regex: /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, format: ['italic'] } // 개선된 이탤릭: **와 충돌 방지
        ];
        
        // 모든 매치를 수집
        const allMatches = [];
        
        patterns.forEach(pattern => {
            let match;
            const regex = new RegExp(pattern.regex.source, 'g');
            
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
            
            // 새로운 서식 적용 규칙:
            // 1. 스페이스 먼저 입력 (서식이 있는 경우)
            if (element.format && element.format.length > 0 && element.type !== 'text') {
                await this.page.keyboard.type(' ');
            }
            
            // 2. 서식 적용
            await this.optimizedFormatManagement(element.format);
            
            // 3. 텍스트 입력
            await this.optimizedTypeText(element.text);
            
            // 4. 서식 해제 (하이라이트는 특별 처리)
            if (element.format && element.format.includes('highlight')) {
                console.log(`  🔄 하이라이트 텍스트 입력 완료, 자동 해제 중...`);
                await this.page.waitForTimeout(200);
                
                // 정확한 순서로 하이라이트 해제
                try {
                    // 1. 하이라이트 적용 버튼 클릭
                    await this.frame.click('.se-background-color-toolbar-button', { timeout: 1000 });
                    await this.page.waitForTimeout(300);
                    
                    // 2. 색상 없음 클릭
                    await this.frame.click('button.se-color-palette-no-color', { timeout: 1000 });
                    await this.page.waitForTimeout(200);
                    
                    console.log(`  ✅ 하이라이트 자동 해제 완료`);
                } catch (error) {
                    console.log(`  ⚠️ 하이라이트 자동 해제 실패: ${error.message}`);
                }
                
                this.currentFormats.delete('highlight');
            }
            
            // 5. 다음 텍스트는 스페이스 없이 바로 입력됨 (기존 코드에서 제거)
            
        } catch (error) {
            console.log(`  ❌ 요소 처리 실패: ${error.message}`);
        }
    }

    async processSubtitle(text) {
        try {
            console.log(`  🎨 소제목 처리: "${text}"`);
            
            // 줄바꿈 후 소제목 입력 (구분선 후에는 한 번만)
            await this.page.keyboard.press('Enter');
            
            // 소제목 텍스트 입력
            await this.page.keyboard.type(text, { delay: 20 });
            
            // 텍스트 선택 (전체 줄 선택) - 더 안전한 방법 사용
            await this.page.keyboard.press('Home'); // 줄 시작으로 이동
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('End'); // 줄 끝까지 선택
            await this.page.keyboard.up('Shift');
            
            // 잠시 대기 후 소제목 스타일 적용 시도
            await this.page.waitForTimeout(300);
            
            try {
                // 현재 텍스트 포맷 상태 확인 후 대기
                await this.page.waitForTimeout(500);
                
                // 텍스트 포맷 드롭다운 버튼 클릭
                await this.frame.click('.se-text-format-toolbar-button', { timeout: 2000 });
                await this.page.waitForTimeout(500);
                
                // 실제 소제목 옵션 클릭 (제공받은 정확한 셀렉터 사용)
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
                        console.log(`  ✅ 소제목 스타일 적용 성공 (셀렉터: ${selector})`);
                        subtitleApplied = true;
                        break;
                    } catch (e) {
                        console.log(`  ⚠️ 셀렉터 실패: ${selector} - ${e.message}`);
                    }
                }
                
                if (!subtitleApplied) {
                    console.log(`  ❌ 모든 소제목 셀렉터 실패`);
                }
                
                // 드롭다운이 열려있을 수 있으므로 잠시 대기
                await this.page.waitForTimeout(200);
                
            } catch (error) {
                console.log(`  ⚠️ 소제목 스타일 적용 실패, 일반 텍스트로 유지: ${error.message}`);
            }
            
            // 선택 해제 및 커서를 줄 끝으로 이동 (텍스트 삭제 방지)
            await this.page.keyboard.press('ArrowRight'); // 선택 해제
            await this.page.keyboard.press('Enter'); // 다음 줄로 이동
            
        } catch (error) {
            console.log(`  ❌ 소제목 처리 실패: ${error.message}`);
        }
    }

    async processImage(filename, altText) {
        try {
            console.log(`  🖼️ 이미지 처리: "${filename}" (alt: "${altText}")`);
            
            // 파일명에서 접두사 제거 (mdc:, img:, image: 등)
            let cleanFilename = filename;
            const prefixes = ['mdc:', 'img:', 'image:', 'pic:', 'photo:'];
            for (const prefix of prefixes) {
                if (cleanFilename.startsWith(prefix)) {
                    cleanFilename = cleanFilename.substring(prefix.length);
                    console.log(`  🧹 접두사 제거: "${filename}" → "${cleanFilename}"`);
                    break;
                }
            }
            
            // 현재 처리 중인 폴더를 기준으로 이미지 파일 경로 구성
            let imagePath = path.join(this.currentFolderPath, cleanFilename);
            
            // 파일 존재 확인
            if (!fs.existsSync(imagePath)) {
                console.log(`  ⚠️ 정확한 파일명으로 찾을 수 없음: ${imagePath}`);
                
                // 폴더 내 모든 이미지 파일 검색하여 유사한 파일명 찾기
                const actualImageFile = this.findSimilarImageFile(cleanFilename);
                if (actualImageFile) {
                    imagePath = path.join(this.currentFolderPath, actualImageFile);
                    console.log(`  🔍 유사한 파일 발견: "${actualImageFile}"`);
                } else {
                    console.log(`  ❌ 이미지 파일을 찾을 수 없음: ${imagePath}`);
                    return;
                }
            }
            
            console.log(`  📁 이미지 파일 경로: ${imagePath}`);
            
            // 줄바꿈 후 이미지 삽입
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.press('Enter');
            
            // 이미지 삽입 버튼 클릭 시도
            const imageSelectors = [
                'button[data-name="photo"]',
                '.se-image-toolbar-button',
                '.se-insert-image-toolbar-button',
                '[data-group="documentToolbar"][data-name="photo"]',
                'button[aria-label="사진"]'
            ];
            
            let imageButtonClicked = false;
            for (const selector of imageSelectors) {
                try {
                    await this.frame.click(selector, { timeout: 2000 });
                    console.log(`  ✅ 이미지 버튼 클릭 성공 (셀렉터: ${selector})`);
                    imageButtonClicked = true;
                    break;
                } catch (e) {
                    console.log(`  ⚠️ 이미지 버튼 셀렉터 실패: ${selector} - ${e.message}`);
                }
            }
            
            if (!imageButtonClicked) {
                console.log(`  ❌ 모든 이미지 버튼 셀렉터 실패`);
                return;
            }
            
            await this.page.waitForTimeout(1000);
            
            // 파일 업로드 처리
            try {
                // 파일 입력 요소를 찾아서 파일 설정
                const fileInputSelectors = [
                    'input[type="file"]',
                    'input[accept*="image"]',
                    '.se-file-input'
                ];
                
                let fileUploaded = false;
                for (const selector of fileInputSelectors) {
                    try {
                        const fileInput = await this.frame.$(selector);
                        if (fileInput) {
                            await fileInput.setInputFiles(imagePath);
                            console.log(`  ✅ 파일 업로드 성공: ${filename}`);
                            fileUploaded = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`  ⚠️ 파일 입력 셀렉터 실패: ${selector} - ${e.message}`);
                    }
                }
                
                if (!fileUploaded) {
                    // 클립보드 방식 시도
                    console.log(`  🔄 클립보드 방식으로 이미지 삽입 시도...`);
                    await this.uploadImageViaClipboard(imagePath);
                    
                    // 클립보드 방식 후에도 파인더 창 닫기
                    await this.closeFinderAndRestoreFocus();
                }
                
                // 업로드 완료 대기 및 파인더 창 처리
                await this.page.waitForTimeout(2000);
                
                // 파인더 창 닫기 및 포커스 복원
                await this.closeFinderAndRestoreFocus();
                
                console.log(`  ✅ 이미지 업로드 완료`);
                
            } catch (error) {
                console.log(`  ❌ 이미지 업로드 실패: ${error.message}`);
            }
            
        } catch (error) {
            console.log(`  ❌ 이미지 처리 실패: ${error.message}`);
        }
    }

    findSimilarImageFile(targetFilename) {
        try {
            // 현재 폴더의 모든 파일 읽기
            const files = fs.readdirSync(this.currentFolderPath);
            
            // 이미지 파일 확장자
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
            
            // 이미지 파일만 필터링
            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return imageExtensions.includes(ext);
            });
            
            console.log(`  📁 폴더 내 이미지 파일들: ${imageFiles.join(', ')}`);
            
            // 1. 정확한 파일명 매치 (확장자 제외)
            const targetBase = path.parse(targetFilename).name;
            for (const file of imageFiles) {
                const fileBase = path.parse(file).name;
                if (fileBase === targetBase) {
                    console.log(`  ✅ 정확한 매치 발견: ${file}`);
                    return file;
                }
            }
            
            // 2. 부분 매치 (파일명에 타겟이 포함되거나 타겟에 파일명이 포함)
            for (const file of imageFiles) {
                const fileBase = path.parse(file).name.toLowerCase();
                const targetBaseLower = targetBase.toLowerCase();
                
                if (fileBase.includes(targetBaseLower) || targetBaseLower.includes(fileBase)) {
                    console.log(`  🔍 부분 매치 발견: ${file}`);
                    return file;
                }
            }
            
            // 3. 숫자 매치 (image_1, image_2 등을 위한 처리)
            const targetNumber = targetFilename.match(/(\d+)/);
            if (targetNumber) {
                const number = targetNumber[1];
                for (const file of imageFiles) {
                    if (file.includes(number)) {
                        console.log(`  🔢 숫자 매치 발견: ${file} (숫자: ${number})`);
                        return file;
                    }
                }
            }
            
            console.log(`  ❌ 유사한 파일을 찾을 수 없음`);
            return null;
            
        } catch (error) {
            console.log(`  ❌ 파일 검색 중 오류: ${error.message}`);
            return null;
        }
    }

    async closeFinderAndRestoreFocus() {
        try {
            console.log(`  🔄 파인더 창 닫기 및 포커스 복원 시도...`);
            
            // 다중 방법으로 파인더 창 닫기 시도
            const closingMethods = [
                async () => {
                    // 1. ESC 키로 다이얼로그 닫기
                    await this.page.keyboard.press('Escape');
                    await this.page.waitForTimeout(300);
                    console.log(`    ✓ ESC 키 시도`);
                },
                async () => {
                    // 2. Command+W로 창 닫기 (macOS)
                    await this.page.keyboard.down('Meta');
                    await this.page.keyboard.press('KeyW');
                    await this.page.keyboard.up('Meta');
                    await this.page.waitForTimeout(300);
                    console.log(`    ✓ Command+W 시도`);
                },
                async () => {
                    // 3. Enter 키로 선택 확인 (파일이 이미 선택된 경우)
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(300);
                    console.log(`    ✓ Enter 키 시도`);
                },
                async () => {
                    // 4. Command+Option+W로 모든 파인더 창 닫기
                    await this.page.keyboard.down('Meta');
                    await this.page.keyboard.down('Alt');
                    await this.page.keyboard.press('KeyW');
                    await this.page.keyboard.up('Alt');
                    await this.page.keyboard.up('Meta');
                    await this.page.waitForTimeout(300);
                    console.log(`    ✓ Command+Option+W 시도`);
                }
            ];
            
            // 각 방법을 순차적으로 시도
            for (const method of closingMethods) {
                try {
                    await method();
                } catch (methodError) {
                    console.log(`    ⚠️ 방법 실패: ${methodError.message}`);
                }
            }
            
            // 브라우저로 포커스 복원
            await this.page.bringToFront();
            await this.page.waitForTimeout(500);
            
            // 에디터 영역에 포커스 다시 설정
            await this.focusContentArea();
            
            console.log(`  ✅ 파인더 창 닫기 및 포커스 복원 완료`);
            
        } catch (error) {
            console.log(`  ⚠️ 파인더 창 닫기 실패: ${error.message}`);
            
            // 최소한 에디터 포커스는 복원 시도
            try {
                await this.page.bringToFront();
                await this.page.waitForTimeout(300);
                await this.focusContentArea();
                console.log(`  ✅ 최소한 브라우저 포커스는 복원 완료`);
            } catch (focusError) {
                console.log(`  ❌ 포커스 복원도 실패: ${focusError.message}`);
            }
        }
    }

    async uploadImageViaClipboard(imagePath) {
        try {
            // Node.js에서 이미지를 클립보드에 복사하고 붙여넣기
            // 이는 시스템 의존적이므로 대안 방법 구현
            console.log(`  📋 클립보드 방식은 현재 제한적으로 지원됩니다.`);
            
            // 드래그 앤 드롭 시뮬레이션 시도
            const dropArea = await this.frame.$('.se-main-container, .se-content, [contenteditable="true"]');
            if (dropArea) {
                // 실제 브라우저에서는 드래그 앤 드롭이 복잡하므로 
                // 여기서는 로그만 남기고 수동 처리를 안내
                console.log(`  💡 수동으로 이미지를 드래그하여 에디터에 드롭하거나, Ctrl+V로 붙여넣어 주세요.`);
                await this.page.waitForTimeout(5000); // 수동 처리 시간 제공
            }
            
        } catch (error) {
            console.log(`  ❌ 클립보드 업로드 실패: ${error.message}`);
        }
    }

    async processQuote(text) {
        try {
            console.log(`  💬 인용구 처리: "${text}"`);
            
            // 줄바꿈 후 인용구 텍스트 입력
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.press('Enter');
            
            // 인용구 텍스트 입력
            await this.page.keyboard.type(text, { delay: 20 });
            
            // 텍스트 선택 (전체 줄 선택)
            await this.page.keyboard.press('Home'); // 줄 시작으로 이동
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('End'); // 줄 끝까지 선택
            await this.page.keyboard.up('Shift');
            
            // 잠시 대기 후 인용구 스타일 적용 시도
            await this.page.waitForTimeout(300);
            
            try {
                // 인용구 적용 전 대기
                await this.page.waitForTimeout(500);
                
                // 인용구 툴바 버튼 클릭 (제공받은 정확한 셀렉터 사용)
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
                        console.log(`  ✅ 인용구 스타일 적용 성공 (셀렉터: ${selector})`);
                        quoteApplied = true;
                        break;
                    } catch (e) {
                        console.log(`  ⚠️ 셀렉터 실패: ${selector} - ${e.message}`);
                    }
                }
                
                if (!quoteApplied) {
                    console.log(`  ❌ 모든 인용구 셀렉터 실패`);
                }
                
                // 잠시 대기
                await this.page.waitForTimeout(200);
                
            } catch (error) {
                console.log(`  ⚠️ 인용구 스타일 적용 실패, 일반 텍스트로 유지: ${error.message}`);
            }
            
            // 선택 해제 및 커서를 줄 끝으로 이동 (텍스트 삭제 방지)
            await this.page.keyboard.press('ArrowRight'); // 선택 해제
            
            // 인용구에서 빠져나오기: 아래쪽 방향키 2번 + 엔터
            console.log(`  🔄 인용구에서 빠져나오기 시도...`);
            await this.page.keyboard.press('ArrowDown'); // 아래쪽 방향키 1번
            await this.page.waitForTimeout(100);
            await this.page.keyboard.press('ArrowDown'); // 아래쪽 방향키 2번
            await this.page.waitForTimeout(100);
            await this.page.keyboard.press('Enter'); // 엔터
            await this.page.waitForTimeout(200);
            console.log(`  ✅ 인용구에서 일반 텍스트 모드로 전환 완료`)
            
        } catch (error) {
            console.log(`  ❌ 인용구 처리 실패: ${error.message}`);
        }
    }

    async saveBlogContent() {
        try {
            console.log('💾 블로그 콘텐츠 저장 시작...');
            
            // 저장 버튼 셀렉터들 (커서룰에서 제공된 셀렉터와 대안들)
            const saveSelectors = [
                'button.save_btn__bzc5B',  // 커서룰에서 제공된 메인 셀렉터
                '.save_btn__bzc5B',
                'button[class*="save_btn"]',
                'button:has-text("저장")',
                'button[type="button"]:has-text("저장")',
                '.se-save-button',
                '[data-name="save"]',
                'button[aria-label="저장"]'
            ];
            
            let saveButtonClicked = false;
            
            // 메인 프레임에서 저장 버튼 찾기 시도
            for (const selector of saveSelectors) {
                try {
                    // iframe 내에서 먼저 시도
                    if (this.frame) {
                        try {
                            await this.frame.click(selector, { timeout: 2000 });
                            console.log(`  ✅ iframe에서 저장 버튼 클릭 성공 (셀렉터: ${selector})`);
                            saveButtonClicked = true;
                            break;
                        } catch (e) {
                            console.log(`  ⚠️ iframe 저장 버튼 실패: ${selector}`);
                        }
                    }
                    
                    // 메인 페이지에서 시도
                    await this.page.click(selector, { timeout: 2000 });
                    console.log(`  ✅ 메인 페이지에서 저장 버튼 클릭 성공 (셀렉터: ${selector})`);
                    saveButtonClicked = true;
                    break;
                    
                } catch (e) {
                    console.log(`  ⚠️ 저장 버튼 셀렉터 실패: ${selector} - ${e.message}`);
                }
            }
            
            if (!saveButtonClicked) {
                console.log('❌ 모든 저장 버튼 셀렉터 실패');
                
                // 수동 저장 안내
                console.log('💡 수동으로 저장해주세요: Ctrl+S 또는 저장 버튼을 클릭하세요.');
                console.log('⏳ 수동 저장을 위해 10초 대기...');
                await this.page.waitForTimeout(10000);
                return;
            }
            
            // 저장 처리 대기
            console.log('⏳ 저장 처리 중...');
            await this.page.waitForTimeout(3000);
            
            // 저장 완료 확인
            const saveSuccess = await this.verifySaveCompletion();
            if (saveSuccess) {
                console.log('✅ 블로그 콘텐츠 저장 완료!');
            } else {
                console.log('⚠️ 저장 상태 확인 불가, 수동으로 저장 상태를 확인해주세요.');
            }
            
        } catch (error) {
            console.log(`❌ 저장 처리 실패: ${error.message}`);
            console.log('💡 수동으로 저장해주세요: Ctrl+S 또는 저장 버튼을 클릭하세요.');
        }
    }

    async verifySaveCompletion() {
        try {
            // 저장 완료 메시지나 상태 확인
            const saveIndicators = [
                'text="저장되었습니다"',
                'text="저장 완료"',
                '.save-success',
                '.se-save-success',
                '[data-status="saved"]',
                '.saved-indicator'
            ];
            
            for (const indicator of saveIndicators) {
                try {
                    const element = await this.page.$(indicator);
                    if (element) {
                        console.log(`  ✅ 저장 완료 확인: ${indicator}`);
                        return true;
                    }
                } catch (e) {
                    // 요소를 찾지 못한 경우 계속 진행
                }
            }
            
            // 저장 버튼의 상태 변화로 확인
            const savedButtonStates = [
                'button[disabled]:has-text("저장")',
                'button.saved',
                '.save_btn__bzc5B[disabled]'
            ];
            
            for (const state of savedButtonStates) {
                try {
                    const element = await this.page.$(state);
                    if (element) {
                        console.log(`  ✅ 저장 버튼 상태 확인: ${state}`);
                        return true;
                    }
                } catch (e) {
                    // 요소를 찾지 못한 경우 계속 진행
                }
            }
            
            return false;
            
        } catch (error) {
            console.log(`❌ 저장 완료 확인 실패: ${error.message}`);
            return false;
        }
    }

    async optimizedFormatManagement(targetFormats) {
        try {
            const currentFormats = Array.from(this.currentFormats);
            const targetSet = new Set(targetFormats);
            
            // 해제할 서식들
            const toDeactivate = currentFormats.filter(format => !targetSet.has(format));
            
            // 활성화할 서식들
            const toActivate = targetFormats.filter(format => !this.currentFormats.has(format));
            
            // 병렬 처리
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
                console.log(`  🎨 서식 변경: [${toDeactivate.join(',')}] 해제, [${toActivate.join(',')}] 활성화`);
            }
            
        } catch (error) {
            console.log(`  ❌ 서식 관리 오류: ${error.message}`);
        }
    }

    async toggleFormat(format) {
        try {
            // 하이라이트는 특별 처리
            if (format === 'highlight') {
                await this.toggleHighlight();
                return;
            }
            
            const keyMappings = {
                bold: 'KeyB',
                italic: 'KeyI',
                underline: 'KeyU'
            };
            
            const key = keyMappings[format];
            if (!key) return;
            
            await this.page.keyboard.down('Meta');
            await this.page.keyboard.press(key);
            await this.page.keyboard.up('Meta');
            
            await this.page.waitForTimeout(30); // 매우 짧은 대기
            
        } catch (error) {
            console.log(`  ❌ ${format} 토글 실패: ${error.message}`);
        }
    }

    async toggleHighlight() {
        try {
            if (!this.currentFormats.has('highlight')) {
                console.log(`  🎨 하이라이트 적용 시도`);
                
                // 1. 하이라이트 적용 버튼 클릭
                await this.frame.click('.se-background-color-toolbar-button', { timeout: 1000 });
                await this.page.waitForTimeout(300);
                console.log(`  📂 하이라이트 색상 팔레트 열기 완료`);
                
                // 2. 노란색 색상 클릭
                await this.frame.click('button.se-color-palette[data-color="#ffef34"]', { timeout: 1000 });
                await this.page.waitForTimeout(200);
                console.log(`  🟡 노란색 하이라이트 색상 선택 완료`);
                
            } else {
                console.log(`  🎨 하이라이트 해제 시도`);
                
                // 1. 하이라이트 적용 버튼 클릭
                await this.frame.click('.se-background-color-toolbar-button', { timeout: 1000 });
                await this.page.waitForTimeout(300);
                console.log(`  📂 하이라이트 색상 팔레트 열기 완료`);
                
                // 2. 색상 없음 클릭
                await this.frame.click('button.se-color-palette-no-color', { timeout: 1000 });
                await this.page.waitForTimeout(200);
                console.log(`  ⚪ 하이라이트 색상 제거 완료`);
            }
            
        } catch (error) {
            console.log(`  ❌ 하이라이트 토글 실패: ${error.message}`);
        }
    }

    async addHorizontalLine() {
        try {
            console.log(`  📏 구분선 추가`);
            
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
                    console.log(`  ✅ 구분선 추가 성공 (셀렉터: ${selector})`);
                    lineAdded = true;
                    break;
                } catch (e) {
                    console.log(`  ⚠️ 셀렉터 실패: ${selector} - ${e.message}`);
                }
            }
            
            if (!lineAdded) {
                console.log(`  ❌ 모든 구분선 셀렉터 실패`);
            }
            
            await this.page.waitForTimeout(200);
            
        } catch (error) {
            console.log(`  ❌ 구분선 추가 실패: ${error.message}`);
        }
    }

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

    async optimizedTypeText(text) {
        try {
            if (!text) return;
            
            // 줄바꿈 처리
            if (text.includes('\n')) {
                const parts = text.split('\n');
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i]) {
                        await this.page.keyboard.type(parts[i], { delay: 15 }); // 더욱 빠르게
                    }
                    if (i < parts.length - 1) {
                        await this.page.keyboard.press('Enter');
                    }
                }
            } else {
                await this.page.keyboard.type(text, { delay: 15 }); // 더욱 빠르게
            }
            
            console.log(`  ✅ 입력 완료: ${text.length}자`);
            
        } catch (error) {
            console.log(`  ❌ 텍스트 입력 실패: ${error.message}`);
        }
    }

    async clearAllFormats() {
        try {
            console.log('\n🔄 모든 서식 해제...');
            
            const promises = Array.from(this.currentFormats).map(format => 
                this.toggleFormat(format)
            );
            
            if (promises.length > 0) {
                await Promise.all(promises);
                this.currentFormats.clear();
                console.log('✅ 모든 서식 해제 완료');
            }
            
        } catch (error) {
            console.log(`❌ 서식 해제 오류: ${error.message}`);
        }
    }

    async verifyResult(expectedStats) {
        try {
            console.log('\n🔍 최종 결과 검증...');
            
            const result = await this.frame.evaluate(() => {
                const contentArea = document.querySelector('.se-main-container') ||
                                  document.querySelector('.se-content') ||
                                  document.body;
                
                if (contentArea) {
                    const textElements = contentArea.querySelectorAll('*');
                    const formattedElements = [];
                    
                    textElements.forEach(el => {
                        if (el.textContent && el.textContent.trim()) {
                            const style = window.getComputedStyle(el);
                            const hasFormatting = 
                                style.fontWeight === 'bold' || 
                                style.fontWeight === '700' ||
                                style.fontStyle === 'italic' ||
                                style.textDecoration.includes('underline');
                            
                            if (hasFormatting) {
                                formattedElements.push({
                                    text: el.textContent.trim().substring(0, 30),
                                    bold: style.fontWeight === 'bold' || style.fontWeight === '700',
                                    italic: style.fontStyle === 'italic',
                                    underline: style.textDecoration.includes('underline')
                                });
                            }
                        }
                    });
                    
                    return {
                        success: true,
                        totalLength: contentArea.textContent.trim().length,
                        formattedCount: formattedElements.length,
                        formattedElements: formattedElements,
                        hasExpectedText: contentArea.textContent.includes('서식 마크업 시스템')
                    };
                }
                
                return { success: false, error: '콘텐츠 영역을 찾을 수 없음' };
            });
            
            if (result.success) {
                console.log(`📊 전체 콘텐츠: ${result.totalLength}자`);
                console.log(`🎨 실제 서식 적용: ${result.formattedCount}개`);
                console.log(`📝 예상 텍스트 포함: ${result.hasExpectedText ? '✅' : '❌'}`);
                
                // 예상 vs 실제 비교
                const totalExpected = expectedStats.bold + expectedStats.underline + expectedStats.italic + expectedStats.combined;
                const efficiency = totalExpected > 0 ? Math.round((result.formattedCount / totalExpected) * 100) : 0;
                
                console.log(`\n📈 서식 적용 효율성: ${efficiency}% (${result.formattedCount}/${totalExpected})`);
                
                if (result.formattedElements.length > 0) {
                    console.log('\n📋 적용된 서식 요소들 (일부):');
                    result.formattedElements.slice(0, 10).forEach((el, index) => {
                        const formats = [];
                        if (el.bold) formats.push('볼드');
                        if (el.italic) formats.push('이탤릭');
                        if (el.underline) formats.push('언더라인');
                        
                        console.log(`  ${index + 1}. "${el.text}" - ${formats.join(', ')}`);
                    });
                }
                
                // 성공 여부 판단
                if (result.hasExpectedText && result.formattedCount > 0) {
                    console.log('\n🎉 마크다운 업로드 성공! 텍스트와 서식이 모두 적용되었습니다.');
                } else {
                    console.log(`\n⚠️ 부분 성공: 텍스트=${result.hasExpectedText}, 서식=${result.formattedCount > 0}`);
                }
                
            } else {
                console.log(`❌ 결과 확인 실패: ${result.error}`);
            }
            
        } catch (error) {
            console.log(`❌ 결과 검증 오류: ${error.message}`);
        }
    }
}

const test = new MarkdownToBlogOptimized();
test.run().catch(console.error); 