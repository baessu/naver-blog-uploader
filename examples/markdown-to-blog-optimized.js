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
    }

    async run() {
        console.log('📝 마크다운 → 블로그 최적화 업로드 시작...\n');
        
        try {
            const { chromium } = await import('playwright');
            const browser = await chromium.launch({
                headless: false,
                slowMo: 100  // 더욱 빠르게 설정
            });
            
            this.page = await browser.newPage({
                viewport: { width: 1280, height: 720 },
                locale: 'ko-KR'
            });

            const loginService = new NaverLoginService(this.page);
            const blogService = new NaverBlogService(this.page);
            
            // 로그인 및 페이지 이동
            console.log('🔐 로그인...');
            const username = process.env.NAVER_USERNAME || process.env.NAVER_ID;
            await loginService.login(username, process.env.NAVER_PASSWORD);

            console.log('📝 글쓰기 페이지로 이동...');
            await this.page.goto(`https://blog.naver.com/${username}?Redirect=Write&`, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
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
            
            // 마크다운 파일 읽기 및 파싱
            console.log('\n📖 마크다운 파일 읽기...');
            const markdownPath = 'files/ready/종아리_혈자리/2025-06-23__종아리_혈자리_자극으로_통증_완화하는_법.md';
            const content = await this.readMarkdownFile(markdownPath);
            
            if (!content) {
                console.log('❌ 마크다운 파일을 읽을 수 없습니다.');
                return;
            }

            // 제목 추출 및 입력
            const { title, bodyContent } = this.extractTitleAndContent(content);
            console.log(`📝 제목: "${title}"`);
            
            await blogService.enterTitle(title);
            await this.page.waitForTimeout(1000);
            
            // 본문 영역 포커스 및 에디터 준비 확인
            await this.focusContentArea();
            await this.waitForEditorReady();
            
            // 마크업 파싱 및 업로드
            console.log('⚡ 마크업 파싱 및 최적화 업로드...');
            await this.parseAndUploadContent(bodyContent);
            
            console.log('\n📱 결과 확인을 위해 1분 대기...');
            await this.page.waitForTimeout(60000);
            
        } catch (error) {
            console.error('❌ 테스트 중 오류:', error);
        }
    }

    async readMarkdownFile(filePath) {
        try {
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
            console.log('🎯 본문 영역 포커스 시작...');
            
            // NaverBlogService에서 성공적으로 사용되는 방식 적용
            // .se-content 영역을 찾아서 직접 클릭하는 방식
            const contentArea = this.frame.locator('.se-content');
            
            if (await contentArea.isVisible({ timeout: 3000 })) {
                const box = await contentArea.boundingBox();
                if (box) {
                    // 컨텐츠 영역의 하단 부분 클릭하여 커서 위치 설정 (NaverBlogService와 동일한 방식)
                    await contentArea.click({ 
                        position: { x: box.width / 2, y: Math.max(box.height - 50, box.height * 0.8) } 
                    });
                    await this.page.waitForTimeout(300);
                    
                    // Enter로 새 문단 생성 (NaverBlogService와 동일)
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(200);
                    
                    console.log('✅ 본문 영역 포커스 완료 (.se-content 방식)');
                    return true;
                }
            }
            
            // 백업 방법 1: contenteditable 요소 직접 찾기
            try {
                console.log('🔄 contenteditable 요소로 백업 시도...');
                const editableElement = this.frame.locator('[contenteditable="true"]').first();
                if (await editableElement.isVisible({ timeout: 2000 })) {
                    await editableElement.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(300);
                    
                    await editableElement.click({ force: true });
                    await this.page.waitForTimeout(300);
                    
                    console.log('✅ contenteditable 방식으로 포커스 완료');
                    return true;
                }
            } catch (editableError) {
                console.log(`⚠️ contenteditable 백업 방법 실패: ${editableError.message}`);
            }
            
            // 백업 방법 2: Tab 키와 Enter 키 조합 (기존 방식)
            try {
                console.log('🔄 Tab + Enter 방식으로 백업 시도...');
                
                await this.page.keyboard.press('Tab');
                await this.page.waitForTimeout(300);
                
                await this.page.keyboard.press('Enter');
                await this.page.waitForTimeout(200);
                
                console.log('✅ Tab + Enter 방식으로 포커스 완료');
                return true;
                
            } catch (tabError) {
                console.log(`⚠️ Tab + Enter 방식도 실패: ${tabError.message}`);
            }
            
            console.log('❌ 모든 포커스 방법 실패');
            return false;
            
        } catch (error) {
            console.log(`❌ 포커스 전체 오류: ${error.message}`);
            return false;
        }
    }

    async waitForEditorReady() {
        try {
            console.log('⏳ 에디터 준비 상태 확인 중...');
            
            // 1. 에디터 요소들이 모두 로드되었는지 확인
            await this.frame.waitForSelector('.se-content', { timeout: 5000 });
            
            // 2. 편집 가능한 상태인지 확인
            const isReady = await this.frame.evaluate(() => {
                const contentArea = document.querySelector('[contenteditable="true"]') ||
                                  document.querySelector('.se-content');
                
                if (!contentArea) return false;
                
                // contenteditable이 true인지 확인
                const isEditable = contentArea.contentEditable === 'true' || 
                                 contentArea.getAttribute('contenteditable') === 'true';
                
                // 포커스 가능한지 확인
                const isFocusable = typeof contentArea.focus === 'function';
                
                return isEditable && isFocusable;
            });
            
            if (isReady) {
                console.log('✅ 에디터 준비 완료');
                
                // 3. 테스트 문자 입력 후 즉시 삭제로 입력 가능 상태 최종 확인
                await this.page.keyboard.type('test');
                await this.page.waitForTimeout(100);
                await this.page.keyboard.press('Backspace');
                await this.page.keyboard.press('Backspace');
                await this.page.keyboard.press('Backspace');
                await this.page.keyboard.press('Backspace');
                await this.page.waitForTimeout(200);
                
                console.log('✅ 텍스트 입력 가능 상태 확인 완료');
            } else {
                console.log('⚠️ 에디터가 아직 준비되지 않았음');
                
                // 추가 대기 후 재시도
                await this.page.waitForTimeout(2000);
                
                // 본문 영역 다시 클릭
                const contentArea = this.frame.locator('.se-content').first();
                if (await contentArea.isVisible({ timeout: 2000 })) {
                    await contentArea.click();
                    await this.page.waitForTimeout(500);
                }
            }
            
        } catch (error) {
            console.log(`❌ 에디터 준비 확인 실패: ${error.message}`);
            
            // 에러가 발생해도 계속 진행 (백업 처리)
            console.log('🔄 에디터 준비 확인 실패했지만 계속 진행...');
        }
    }

    async parseAndUploadContent(content) {
        try {
            // 마크업 요소들 파싱
            const elements = this.parseMarkupElements(content);
            
            console.log(`🔍 파싱 결과: 총 ${elements.length}개 요소 발견`);
            
            // 통계 출력
            const stats = this.calculateStats(elements);
            console.log(`📊 서식 통계: 볼드 ${stats.bold}개, 언더라인 ${stats.underline}개, 이탤릭 ${stats.italic}개, 조합 ${stats.combined}개, 소제목 ${stats.subtitle}개, 인용구 ${stats.quote}개, 하이라이트 ${stats.highlight}개`);
            
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
            { type: 'subtitle', regex: /##([^#\n]+)##/g, format: [] },
            { type: 'quote', regex: />>([^>\n]+)<</g, format: [] }, // 인용구: >>텍스트<<
            { type: 'highlight', regex: /==([^=\n]+)==/g, format: ['highlight'] }, // 하이라이트: ==텍스트==
            { type: 'bold_underline', regex: /\*\*__([^*_\n]+)__\*\*/g, format: ['bold', 'underline'] },
            { type: 'bold', regex: /\*\*([^*\n]+)\*\*/g, format: ['bold'] },
            { type: 'underline', regex: /__([^_\n]+)__/g, format: ['underline'] },
            { type: 'italic', regex: /\*([^*\n]+)\*/g, format: ['italic'] }
        ];
        
        // 모든 매치를 수집
        const allMatches = [];
        
        patterns.forEach(pattern => {
            let match;
            const regex = new RegExp(pattern.regex.source, 'g');
            
            while ((match = regex.exec(content)) !== null) {
                allMatches.push({
                    type: pattern.type,
                    format: pattern.format,
                    text: match[1],
                    fullMatch: match[0],
                    start: match.index,
                    end: match.index + match[0].length
                });
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
            elements.push({
                type: match.type,
                format: match.format,
                text: match.text
            });
            
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
            highlight: 0
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
            }
        });
        
        return stats;
    }

    async processElement(element) {
        try {
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
            
            // 서식 변경
            await this.optimizedFormatManagement(element.format);
            
            // 텍스트 입력
            await this.optimizedTypeText(element.text);
            
            // 하이라이트 텍스트 입력 후 자동 해제
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
            
            // 요소 간 구분을 위한 공백 추가
            if (element.type !== 'text') {
                await this.page.keyboard.type(' ');
            }
            
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

    async optimizedFormatManagement(targetFormats) {
        try {
            const currentFormats = Array.from(this.currentFormats);
            const targetSet = new Set(targetFormats);
            
            // 해제할 서식들
            const toDeactivate = currentFormats.filter(format => !targetSet.has(format));
            
            // 활성화할 서식들
            const toActivate = targetFormats.filter(format => !this.currentFormats.has(format));
            
            // examples/main.js에서 검증된 병렬 처리 방식 사용
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
            
            // examples/main.js에서 검증된 키 매핑 방식 사용
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
            
            await this.page.waitForTimeout(30); // examples/main.js와 동일한 대기 시간
            
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
            
            console.log(`  🖨️ 텍스트 입력 시도 (${text.length}자)...`);
            
            // NaverBlogService에서 성공적으로 사용되는 방식 적용
            // 방법 1: .se-content 영역에 직접 클릭 후 키보드 입력 (가장 안정적)
            try {
                const contentArea = this.frame.locator('.se-content');
                
                if (await contentArea.isVisible({ timeout: 3000 })) {
                    const box = await contentArea.boundingBox();
                    if (box) {
                        // 컨텐츠 영역의 적절한 위치 클릭하여 커서 설정
                        await contentArea.click({ 
                            position: { x: box.width / 2, y: Math.max(box.height - 50, box.height * 0.8) } 
                        });
                        await this.page.waitForTimeout(200);
                        
                        // 줄바꿈 처리하여 텍스트 입력
                        if (text.includes('\n')) {
                            const lines = text.split('\n');
                            for (let i = 0; i < lines.length; i++) {
                                const line = lines[i].trim();
                                if (line) {
                                    await this.page.keyboard.type(line, { delay: 15 });
                                }
                                if (i < lines.length - 1) {
                                    await this.page.keyboard.press('Enter');
                                    await this.page.waitForTimeout(50);
                                }
                            }
                        } else {
                            await this.page.keyboard.type(text, { delay: 15 });
                        }
                        
                        console.log(`  ✅ 입력 완료: ${text.length}자`);
                        return true;
                    }
                }
            } catch (contentAreaError) {
                console.log(`  ⚠️ .se-content 방식 실패: ${contentAreaError.message}`);
            }
            
            // 방법 2: contenteditable 요소 찾아서 입력
            try {
                console.log(`  🔍 contenteditable 요소 찾아서 입력 시도...`);
                
                const editableElement = this.frame.locator('[contenteditable="true"]').first();
                if (await editableElement.isVisible({ timeout: 2000 })) {
                    await editableElement.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(300);
                    
                    await editableElement.click({ force: true });
                    await this.page.waitForTimeout(300);
                    
                    // 텍스트 입력
                    await this.page.keyboard.type(text, { delay: 15 });
                    
                    console.log(`  ✅ contenteditable 입력 완료: ${text.length}자`);
                    return true;
                }
            } catch (editableError) {
                console.log(`  ⚠️ contenteditable 방식 실패: ${editableError.message}`);
            }
            
            // 방법 3: execCommand를 사용한 텍스트 삽입
            try {
                console.log(`  📝 execCommand 방법 시도...`);
                
                const inserted = await this.frame.evaluate((textToInsert) => {
                    const activeElement = document.activeElement;
                    if (activeElement && (activeElement.contentEditable === 'true' || activeElement.isContentEditable)) {
                        // execCommand로 텍스트 삽입
                        document.execCommand('insertText', false, textToInsert);
                        return true;
                    }
                    
                    // activeElement가 없거나 편집 불가능한 경우, 편집 가능한 요소 찾기
                    const contentArea = document.querySelector('[contenteditable="true"]') ||
                                      document.querySelector('.se-content');
                    
                    if (contentArea) {
                        contentArea.focus();
                        document.execCommand('insertText', false, textToInsert);
                        return true;
                    }
                    
                    return false;
                }, text);
                
                if (inserted) {
                    console.log(`  ✅ execCommand 성공: ${text.length}자`);
                    return true;
                }
            } catch (execError) {
                console.log(`  ⚠️ execCommand 실패: ${execError.message}`);
            }
            
            // 방법 4: 마지막 시도 - 간단한 키보드 입력
            try {
                console.log(`  🔄 기본 키보드 입력으로 재시도...`);
                await this.page.keyboard.type(text, { delay: 25 });
                console.log(`  ✅ 기본 키보드 입력 완료: ${text.length}자`);
                return true;
            } catch (basicError) {
                console.log(`  ❌ 기본 키보드 입력도 실패: ${basicError.message}`);
            }
            
            console.log(`  ❌ 모든 텍스트 입력 방법 실패`);
            return false;
            
        } catch (error) {
            console.log(`  ❌ 텍스트 입력 전체 실패: ${error.message}`);
            return false;
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