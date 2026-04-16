/**
 * Improved NaverBlogService with better logging and intelligent waiting
 * This is a sample showing how to refactor the existing service
 */

import { BlogError, WriteError, EditorError, NavigationError, ValidationError } from '../utils/errors.js';
import { NaverBlogSelectors } from '../utils/selectors.js';
import { WaitUtils } from '../utils/waitUtils.js';
import { createLogger } from '../utils/logger.js';

export class ImprovedNaverBlogService {
  constructor(page) {
    this.page = page;
    this.selectors = NaverBlogSelectors;
    this.waitUtils = new WaitUtils(page);
    this.logger = createLogger('naver-blog-service');
  }

  /**
   * Navigate to blog write page with intelligent waiting
   * @param {Object} options - Navigation options
   * @returns {Promise<boolean>} Success status
   */
  async navigateToWritePage(options = {}) {
    const operation = this.logger.startOperation('navigateToWritePage');
    
    try {
      const { timeout = 30000, waitForEditor = true } = options;
      
      this.logger.info('Starting navigation to blog write page', { timeout, waitForEditor });

      // Step 1: Click write button with intelligent waiting
      await this._clickWriteButtonImproved(timeout);

      // Step 2: Handle new tab opening
      const writePageTab = await this._handleNewTabImproved(timeout);

      // Step 3: Wait for page to be ready
      await this._waitForWritePageImproved(writePageTab, timeout);

      // Step 4: Wait for editor if requested
      if (waitForEditor) {
        await this._waitForEditorImproved(writePageTab, timeout);
      }

      operation.end(true);
      return true;

    } catch (error) {
      this.logger.error('Navigation to write page failed', error);
      operation.end(false);
      
      if (error instanceof BlogError || error instanceof WriteError) {
        throw error;
      }
      
      throw new BlogError(
        `Blog write page navigation failed: ${error.message}`,
        error
      );
    }
  }

  /**
   * Improved write button clicking with smart waiting
   * @private
   */
  async _clickWriteButtonImproved(timeout) {
    const operation = this.logger.startOperation('clickWriteButton');
    
    try {
      // Define selectors in priority order
      const blogMenuSelectors = [
        this.selectors.blogMenuLink,
        this.selectors.blogMenuButton,
        this.selectors.blogMenuButtonClickable,
        'a:has-text("블로그")',
        'span:has-text("블로그")'
      ];

      // Try to find and click blog menu button
      let blogMenuElement = null;
      for (const selector of blogMenuSelectors) {
        try {
          this.logger.debug(`Attempting to find blog menu: ${selector}`);
          
          blogMenuElement = await this.waitUtils.waitForElement(selector, { 
            timeout: 3000,
            stable: true 
          });
          
          if (blogMenuElement) {
            this.logger.success(`Found blog menu button: ${selector}`);
            break;
          }
        } catch (error) {
          this.logger.debug(`Blog menu selector failed: ${selector}`, error);
          continue;
        }
      }

      if (!blogMenuElement) {
        throw new BlogError('Blog menu button not found with any selector');
      }

      // Click blog menu to open dropdown
      await this.waitUtils.smartRetry(async () => {
        await blogMenuElement.click();
        this.logger.action('Clicked blog menu button');
        
        // Wait for dropdown to appear
        await this.waitUtils.waitForNetworkIdle({ idleTime: 1000 });
      });

      // Find and click write button in dropdown
      const writeButtonSelectors = [
        this.selectors.writeButton,
        'a:has-text("글쓰기")',
        'button:has-text("글쓰기")'
      ];

      let writeButtonElement = null;
      for (const selector of writeButtonSelectors) {
        try {
          this.logger.debug(`Attempting to find write button: ${selector}`);
          
          writeButtonElement = await this.waitUtils.waitForElement(selector, { 
            timeout: 5000,
            stable: true 
          });
          
          if (writeButtonElement) {
            this.logger.success(`Found write button: ${selector}`);
            break;
          }
        } catch (error) {
          this.logger.debug(`Write button selector failed: ${selector}`, error);
          continue;
        }
      }

      if (!writeButtonElement) {
        throw new WriteError('Write button not found in dropdown menu');
      }

      // Click write button
      await this.waitUtils.smartRetry(async () => {
        await writeButtonElement.click();
        this.logger.action('Clicked write button');
      });

      operation.end(true);

    } catch (error) {
      this.logger.error('Failed to click write button', error);
      operation.end(false);
      throw error;
    }
  }

  /**
   * Improved new tab handling
   * @private
   */
  async _handleNewTabImproved(timeout) {
    const operation = this.logger.startOperation('handleNewTab');
    
    try {
      this.logger.info('Waiting for new tab to open');
      
      // Wait for new tab to open
      const newTab = await this.waitUtils.smartRetry(async () => {
        const pages = await this.page.context().pages();
        const newPage = pages.find(p => p !== this.page);
        
        if (!newPage) {
          throw new Error('New tab not opened yet');
        }
        
        return newPage;
      }, { 
        maxRetries: 10, 
        delay: 500,
        shouldRetry: (error) => error.message.includes('not opened yet')
      });

      this.logger.success('New tab detected');
      
      // Switch to new tab
      await newTab.bringToFront();
      this.logger.action('Switched to new tab');

      // Wait for page to be ready
      await this.waitUtils.waitForPageReady({ timeout: timeout / 2 });

      operation.end(true);
      return newTab;

    } catch (error) {
      this.logger.error('Failed to handle new tab', error);
      operation.end(false);
      throw new NavigationError(`New tab handling failed: ${error.message}`);
    }
  }

  /**
   * Improved write page waiting
   * @private
   */
  async _waitForWritePageImproved(writePageTab, timeout) {
    const operation = this.logger.startOperation('waitForWritePage');
    
    try {
      this.logger.info('Waiting for write page to load');
      
      // Wait for write page indicators
      const writePageIndicators = [
        'input[placeholder*="제목"]',
        'textarea[placeholder*="내용"]',
        '.se-component',
        '#se-main-container'
      ];

      await this.waitUtils.waitForMultipleElements(writePageIndicators, {
        timeout: timeout / 2,
        all: false // At least one should be present
      });

      this.logger.success('Write page loaded successfully');
      operation.end(true);

    } catch (error) {
      this.logger.error('Failed to wait for write page', error);
      operation.end(false);
      throw new WriteError(`Write page loading failed: ${error.message}`);
    }
  }

  /**
   * Improved editor waiting
   * @private
   */
  async _waitForEditorImproved(writePageTab, timeout) {
    const operation = this.logger.startOperation('waitForEditor');
    
    try {
      this.logger.info('Waiting for editor to be ready');
      
      // Wait for editor to be fully loaded
      await writePageTab.waitForFunction(() => {
        const editor = document.querySelector('.se-component');
        return editor && editor.offsetHeight > 0;
      }, { timeout: timeout / 2 });

      // Wait for editor to be stable
      await this.waitUtils.waitForStable('.se-component', { timeout: 3000 });

      this.logger.success('Editor is ready');
      operation.end(true);

    } catch (error) {
      this.logger.error('Failed to wait for editor', error);
      operation.end(false);
      throw new EditorError(`Editor loading failed: ${error.message}`);
    }
  }

  /**
   * Example method showing how to use the improved logging and waiting
   */
  async writePost(title, content, images = []) {
    const operation = this.logger.startOperation('writePost');
    
    try {
      this.logger.info('Starting to write blog post', { 
        title: title.substring(0, 50), 
        contentLength: content.length,
        imageCount: images.length 
      });

      // Navigate to write page
      await this.navigateToWritePage();

      // Fill title
      await this._fillTitle(title);

      // Fill content
      await this._fillContent(content);

      // Upload images if provided
      if (images.length > 0) {
        await this._uploadImages(images);
      }

      this.logger.success('Blog post written successfully');
      operation.end(true);

    } catch (error) {
      this.logger.error('Failed to write blog post', error);
      operation.end(false);
      throw error;
    }
  }

  async _fillTitle(title) {
    const operation = this.logger.startOperation('fillTitle');
    
    try {
      const titleInput = await this.waitUtils.waitForElement('input[placeholder*="제목"]');
      await titleInput.fill(title);
      this.logger.action('Title filled', { title });
      operation.end(true);
    } catch (error) {
      this.logger.error('Failed to fill title', error);
      operation.end(false);
      throw error;
    }
  }

  async _fillContent(content) {
    const operation = this.logger.startOperation('fillContent');
    
    try {
      const contentArea = await this.waitUtils.waitForElement('.se-component');
      await contentArea.fill(content);
      this.logger.action('Content filled', { contentLength: content.length });
      operation.end(true);
    } catch (error) {
      this.logger.error('Failed to fill content', error);
      operation.end(false);
      throw error;
    }
  }

  async _uploadImages(images) {
    const operation = this.logger.startOperation('uploadImages');
    
    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        this.logger.progress(`Uploading image ${i + 1}`, i + 1, images.length);
        
        // Implementation would go here
        await this.waitUtils.waitForNetworkIdle({ idleTime: 500 });
      }
      
      this.logger.success('All images uploaded');
      operation.end(true);
    } catch (error) {
      this.logger.error('Failed to upload images', error);
      operation.end(false);
      throw error;
    }
  }
}