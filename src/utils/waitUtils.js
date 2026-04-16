/**
 * Intelligent waiting utilities for web automation
 * Replaces hard-coded delays with smart waiting strategies
 */

export class WaitUtils {
  constructor(page) {
    this.page = page;
  }

  /**
   * Wait for element to be visible and ready for interaction
   * @param {string} selector - CSS selector
   * @param {Object} options - Wait options
   * @param {number} options.timeout - Maximum wait time (default: 10000ms)
   * @param {boolean} options.stable - Wait for element to be stable (default: true)
   * @returns {Promise<ElementHandle>} The element handle
   */
  async waitForElement(selector, options = {}) {
    const { timeout = 10000, stable = true } = options;
    
    try {
      // Wait for element to be visible
      await this.page.waitForSelector(selector, { 
        visible: true, 
        timeout 
      });
      
      if (stable) {
        // Wait for element to be stable (not moving/changing)
        await this.waitForStable(selector, { timeout: 2000 });
      }
      
      return await this.page.$(selector);
    } catch (error) {
      throw new Error(`Element not found or not visible: ${selector} (${error.message})`);
    }
  }

  /**
   * Wait for element to be stable (not changing position/size)
   * @param {string} selector - CSS selector
   * @param {Object} options - Wait options
   * @param {number} options.timeout - Maximum wait time (default: 2000ms)
   * @param {number} options.checkInterval - Check interval (default: 100ms)
   */
  async waitForStable(selector, options = {}) {
    const { timeout = 2000, checkInterval = 100 } = options;
    const startTime = Date.now();
    
    let lastBoundingBox = null;
    let stableCount = 0;
    const requiredStableCount = 3;
    
    while (Date.now() - startTime < timeout) {
      try {
        const element = await this.page.$(selector);
        if (!element) {
          await this.page.waitForTimeout(checkInterval);
          continue;
        }
        
        const boundingBox = await element.boundingBox();
        
        if (lastBoundingBox && boundingBox) {
          const isSame = 
            Math.abs(boundingBox.x - lastBoundingBox.x) < 1 &&
            Math.abs(boundingBox.y - lastBoundingBox.y) < 1 &&
            Math.abs(boundingBox.width - lastBoundingBox.width) < 1 &&
            Math.abs(boundingBox.height - lastBoundingBox.height) < 1;
          
          if (isSame) {
            stableCount++;
            if (stableCount >= requiredStableCount) {
              return; // Element is stable
            }
          } else {
            stableCount = 0;
          }
        }
        
        lastBoundingBox = boundingBox;
        await this.page.waitForTimeout(checkInterval);
      } catch (error) {
        await this.page.waitForTimeout(checkInterval);
      }
    }
  }

  /**
   * Wait for network to be idle (no pending requests)
   * @param {Object} options - Wait options
   * @param {number} options.timeout - Maximum wait time (default: 10000ms)
   * @param {number} options.idleTime - Idle time required (default: 1000ms)
   */
  async waitForNetworkIdle(options = {}) {
    const { timeout = 10000, idleTime = 1000 } = options;
    
    try {
      await this.page.waitForLoadState('networkidle', { timeout });
    } catch (error) {
      // Fallback: wait for a reasonable time
      await this.page.waitForTimeout(idleTime);
    }
  }

  /**
   * Wait for page to be fully loaded and interactive
   * @param {Object} options - Wait options
   * @param {number} options.timeout - Maximum wait time (default: 15000ms)
   */
  async waitForPageReady(options = {}) {
    const { timeout = 15000 } = options;
    
    try {
      // Wait for DOM to be loaded
      await this.page.waitForLoadState('domcontentloaded', { timeout });
      
      // Wait for network to be idle
      await this.waitForNetworkIdle({ timeout: timeout / 2 });
      
      // Wait for any dynamic content to load
      await this.page.waitForFunction(() => {
        return document.readyState === 'complete';
      }, { timeout: timeout / 2 });
      
    } catch (error) {
      console.warn(`Page ready wait timeout: ${error.message}`);
      // Continue anyway - page might still be usable
    }
  }

  /**
   * Wait for multiple elements to be present
   * @param {string[]} selectors - Array of CSS selectors
   * @param {Object} options - Wait options
   * @param {number} options.timeout - Maximum wait time per element (default: 5000ms)
   * @param {boolean} options.all - Wait for all elements (default: true)
   * @returns {Promise<ElementHandle[]>} Array of element handles
   */
  async waitForMultipleElements(selectors, options = {}) {
    const { timeout = 5000, all = true } = options;
    const elements = [];
    
    for (const selector of selectors) {
      try {
        const element = await this.waitForElement(selector, { timeout });
        elements.push(element);
      } catch (error) {
        if (all) {
          throw error; // If all required, fail on first missing element
        }
        elements.push(null); // If not all required, continue with null
      }
    }
    
    return elements;
  }

  /**
   * Smart retry mechanism for operations
   * @param {Function} operation - Function to retry
   * @param {Object} options - Retry options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} options.delay - Initial delay between retries (default: 1000ms)
   * @param {number} options.backoff - Backoff multiplier (default: 2)
   * @param {Function} options.shouldRetry - Function to determine if should retry
   * @returns {Promise<any>} Result of the operation
   */
  async smartRetry(operation, options = {}) {
    const { 
      maxRetries = 3, 
      delay = 1000, 
      backoff = 2,
      shouldRetry = () => true 
    } = options;
    
    let lastError;
    let currentDelay = delay;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }
        
        console.log(`⚠️ Operation failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
        console.log(`🔄 Retrying in ${currentDelay}ms...`);
        
        await this.page.waitForTimeout(currentDelay);
        currentDelay *= backoff;
      }
    }
    
    throw lastError;
  }
}