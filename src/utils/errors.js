/**
 * 기본 에러 클래스
 * 모든 커스텀 에러의 베이스가 되는 클래스
 */
export class BaseError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = this.constructor.name;
    this.originalError = originalError;
    
    // 스택 트레이스 정리
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 에러 정보를 JSON 형태로 반환
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : null
    };
  }
}

/**
 * 요소 선택 및 조작 관련 에러
 */
export class ElementError extends BaseError {
  constructor(message, selector = null, originalError = null) {
    super(message, originalError);
    this.selector = selector;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      selector: this.selector
    };
  }
}

/**
 * 타임아웃 관련 에러
 */
export class TimeoutError extends BaseError {
  constructor(message, timeout = null, originalError = null) {
    super(message, originalError);
    this.timeout = timeout;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      timeout: this.timeout
    };
  }
}

/**
 * 네비게이션 관련 에러
 */
export class NavigationError extends BaseError {
  constructor(message, url = null, originalError = null) {
    super(message, originalError);
    this.url = url;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      url: this.url
    };
  }
}

/**
 * 로그인 관련 에러
 */
export class LoginError extends BaseError {
  constructor(message, originalError = null) {
    super(message, originalError);
  }
}

/**
 * 입력값 검증 관련 에러
 */
export class ValidationError extends BaseError {
  constructor(message, field = null, originalError = null) {
    super(message, originalError);
    this.field = field;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field
    };
  }
}

/**
 * 블로그 관련 에러
 */
export class BlogError extends BaseError {
  constructor(message, originalError = null) {
    super(message, originalError);
  }
}

/**
 * 글쓰기 관련 에러
 */
export class WriteError extends BaseError {
  constructor(message, originalError = null) {
    super(message, originalError);
  }
}

/**
 * 에디터 관련 에러
 */
export class EditorError extends BaseError {
  constructor(message, originalError = null) {
    super(message, originalError);
  }
} 