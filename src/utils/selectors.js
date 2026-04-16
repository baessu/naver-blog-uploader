/**
 * 네이버 로그인 페이지 셀렉터
 */
export const NaverSelectors = {
  // 로그인 폼
  loginForm: '#frmNIDLogin',
  idInput: '#id',
  passwordInput: '#pw',
  loginButton: '#log\\.login',
  keepLoginCheckbox: '#keepLoginState',
  
  // 에러 메시지
  errorMessage: '.error_txt',
  
  // 로그인 후 프로필 영역
  profileArea: '.MyView-module__my_info_area___VhqPG, .gnb_my_info',
  
  // 캡차 관련
  captchaImage: '#captcha_img',
  captchaInput: '#captcha_key',
  
  // 2단계 인증
  twoFactorInput: '#verify_number',
  twoFactorButton: '#verify_button'
};

/**
 * 네이버 블로그 페이지 셀렉터
 */
export const NaverBlogSelectors = {
  // 메인 네비게이션
  blogMenuLink: 'a[href*="blog.naver.com"]',
  blogMenuButton: '.MyView-module__item_text___VTQQM:has-text("블로그")',
  blogMenuButtonClickable: '.MyView-module__my_shortcut_item___KJ3lA a[href*="blog"]',
  blogMenuButtonParent: '.MyView-module__my_shortcut_item___KJ3lA',
  
  // 글쓰기 버튼들
  writeButton: 'a[href*="GoBlogWrite"]',
  writeButtonByClass: '.btn_write, .write_btn',
  writeButtonByText: 'a:has-text("글쓰기"), button:has-text("글쓰기")',
  
  // 글쓰기 페이지 컨테이너
  writePageContainer: [
    '.se-main-container',
    '#post-editor',
    '.editor-container',
    '.write-container',
    '#mainFrame'
  ].join(', '),
  
  // 제목 입력
  titleInput: [
    'input[placeholder*="제목"]',
    '#post-title-inp',
    '.se-title-input',
    'input[name="subject"]',
    '.title-input'
  ].join(', '),
  
  // 본문 에디터 (iframe 내부)
  contentEditor: [
    '.se-content',
    '#smart_editor2_content',
    '.editor-content',
    '#post-content'
  ].join(', '),
  
  // 에디터 영역 (메인 페이지)
  editorArea: [
    '.se-main-container',
    '.editor-area',
    '#post-editor'
  ].join(', '),
  
  // 이미지 업로드 버튼
  imageUploadButton: [
    '.se-image-toolbar-button',
    '.btn-insert-image',
    'button[title*="이미지"]'
  ].join(', '),
  
  // 저장 버튼들
  saveButton: [
    'button.save_btn__bzc5B',
    '.save_btn',
    '[data-testid="save-button"]',
    'button[type="submit"]',
    '.publish-btn',
    '.btn-save'
  ].join(', '),
  
  // 발행 버튼들
  publishButton: [
    '.publish_btn',
    '.btn-publish',
    'button:has-text("발행")'
  ].join(', '),
  
  // 새 글쓰기 확인
  newPostButton: [
    'button:has-text("새 글쓰기")',
    '.btn-new-post',
    'a:has-text("새 글쓰기")'
  ].join(', '),
  
  // 팝업 및 인터럽트 요소들
  popupClose: [
    '.close_btn',
    '.btn-close',
    '.popup-close',
    '.modal-close',
    '[aria-label="닫기"]',
    'button:has-text("닫기")',
    'button:has-text("다음에")',
    'button:has-text("건너뛰기")'
  ].join(', '),
  
  // 알림/가이드 팝업
  guidePopup: [
    '.guide-popup',
    '.intro-popup',
    '.tutorial-popup',
    '.onboarding-popup'
  ].join(', '),
  
  // iframe 셀렉터
  editorIframe: [
    '#mainFrame',
    'iframe[src*="PostWriteForm"]',
    'iframe[name="mainFrame"]'
  ].join(', ')
}; 