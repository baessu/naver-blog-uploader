/**
 * Centralized logging utility for JavaScript packages
 * Provides consistent logging with emojis and structured output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Logger {
  constructor(name, logDir = './logs') {
    this.name = name;
    this.logDir = logDir;
    
    // Create log directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.logFile = path.join(logDir, `${name}.log`);
  }

  _formatMessage(level, message, emoji = '') {
    const timestamp = new Date().toISOString();
    const prefix = emoji ? `${emoji} ` : '';
    return `${timestamp} | ${this.name} | ${level} | ${prefix}${message}`;
  }

  _writeToFile(formattedMessage) {
    try {
      fs.appendFileSync(this.logFile, formattedMessage + '\n', 'utf8');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  _log(level, message, emoji = '', data = null) {
    const formattedMessage = this._formatMessage(level, message, emoji);
    
    // Console output
    console.log(formattedMessage);
    
    // File output
    this._writeToFile(formattedMessage);
    
    // Additional data logging
    if (data) {
      const dataMessage = this._formatMessage(level, JSON.stringify(data, null, 2), '📋');
      console.log(dataMessage);
      this._writeToFile(dataMessage);
    }
  }

  success(message, data = null) {
    this._log('SUCCESS', message, '✅', data);
  }

  error(message, error = null, data = null) {
    const errorMessage = error ? `${message}: ${error.message}` : message;
    this._log('ERROR', errorMessage, '❌', data);
    
    // Log stack trace for errors
    if (error && error.stack) {
      const stackMessage = this._formatMessage('ERROR', `Stack trace: ${error.stack}`, '🔍');
      console.log(stackMessage);
      this._writeToFile(stackMessage);
    }
  }

  warning(message, data = null) {
    this._log('WARNING', message, '⚠️', data);
  }

  info(message, data = null) {
    this._log('INFO', message, '📊', data);
  }

  debug(message, data = null) {
    this._log('DEBUG', message, '🔍', data);
  }

  progress(message, current = null, total = null, data = null) {
    const progressText = current !== null && total !== null 
      ? `[${current}/${total}] ${message}` 
      : message;
    this._log('PROGRESS', progressText, '🔄', data);
  }

  action(message, data = null) {
    this._log('ACTION', message, '🎯', data);
  }

  network(message, data = null) {
    this._log('NETWORK', message, '🌐', data);
  }

  timing(operation, startTime, data = null) {
    const duration = Date.now() - startTime;
    const message = `${operation} completed in ${duration}ms`;
    this._log('TIMING', message, '⏱️', data);
  }

  // Specific logging methods for common operations
  
  pageNavigation(url, success = true) {
    const message = `Page navigation to: ${url}`;
    if (success) {
      this.success(message);
    } else {
      this.error(message);
    }
  }

  elementFound(selector, success = true) {
    const message = `Element search: ${selector}`;
    if (success) {
      this.success(message);
    } else {
      this.error(message);
    }
  }

  userAction(action, target, success = true) {
    const message = `User action: ${action} on ${target}`;
    if (success) {
      this.action(message);
    } else {
      this.error(message);
    }
  }

  apiCall(method, url, statusCode = null, responseTime = null) {
    let message = `API ${method} ${url}`;
    if (statusCode) {
      message += ` - Status: ${statusCode}`;
    }
    if (responseTime) {
      message += ` - Time: ${responseTime}ms`;
    }
    this.network(message);
  }

  fileOperation(operation, filePath, success = true) {
    const message = `File ${operation}: ${filePath}`;
    if (success) {
      this.success(message);
    } else {
      this.error(message);
    }
  }

  // Utility methods
  
  startOperation(operationName) {
    const startTime = Date.now();
    this.info(`Starting operation: ${operationName}`);
    
    return {
      end: (success = true, data = null) => {
        const duration = Date.now() - startTime;
        const message = `Operation ${operationName} ${success ? 'completed' : 'failed'} in ${duration}ms`;
        
        if (success) {
          this.success(message, data);
        } else {
          this.error(message, null, data);
        }
      }
    };
  }

  group(title, operation) {
    this.info(`╭─ ${title}`);
    const startTime = Date.now();
    
    return operation().finally(() => {
      const duration = Date.now() - startTime;
      this.info(`╰─ ${title} (${duration}ms)`);
    });
  }
}

// Create logger instances for different modules.
// 문자열(기존) 또는 옵션 객체 { service, level, enableFile } 모두 수용
export const createLogger = (nameOrOptions, logDir = process.env.LOG_DIR || './logs') => {
  if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    const { service, logDir: optLogDir } = nameOrOptions;
    return new Logger(service || 'app', optLogDir || logDir);
  }
  return new Logger(nameOrOptions, logDir);
};

// Pre-configured loggers
export const blogLogger = createLogger('naver-blog');
export const crawlerLogger = createLogger('crawler');
export const apiLogger = createLogger('api');
export const systemLogger = createLogger('system');

// Default export
export default Logger;