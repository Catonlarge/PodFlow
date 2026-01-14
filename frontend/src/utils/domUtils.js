/**
 * DOM 工具函数
 *
 * 提供与 DOM 操作相关的实用函数
 *
 * @module utils/domUtils
 */

/**
 * 等待字幕元素出现
 *
 * 使用 MutationObserver 监听 DOM 变化，当指定的字幕元素出现时返回
 * 如果元素已存在，立即返回
 * 如果超时仍未出现，抛出错误
 *
 * @param {HTMLElement} container - 容器元素
 * @param {number|string} cueId - 字幕 ID
 * @param {number} timeout - 超时时间（毫秒），默认 3000ms
 * @returns {Promise<HTMLElement>} 字幕元素
 * @throws {Error} 超时后抛出错误
 *
 * @example
 * // 元素已存在
 * const element = await waitForSubtitleElement(container, 1);
 *
 * @example
 * // 元素稍后出现
 * const element = await waitForSubtitleElement(container, 1, 5000);
 *
 * @example
 * // 处理超时
 * try {
 *   const element = await waitForSubtitleElement(container, 1, 1000);
 * } catch (error) {
 *   console.error('元素未出现:', error.message);
 * }
 */
export function waitForSubtitleElement(container, cueId, timeout = 3000) {
  return new Promise((resolve, reject) => {
    // 检查容器是否存在
    if (!container) {
      reject(new Error(`容器不存在: cue_id=${cueId}`));
      return;
    }

    // 检查元素是否已存在
    const existingElement = container.querySelector(`[data-subtitle-id="${cueId}"]`);

    if (existingElement) {
      resolve(existingElement);
      return;
    }

    // 元素不存在，使用 MutationObserver 监听
    const observer = new MutationObserver(() => {
      const element = container.querySelector(`[data-subtitle-id="${cueId}"]`);

      if (element) {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    // 开始观察
    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    // 超时保护
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`等待字幕元素超时: cue_id=${cueId}`));
    }, timeout);
  });
}

/**
 * 等待 DOM 元素渲染完成
 *
 * 使用 requestAnimationFrame 循环检查指定的字幕元素是否已渲染
 * 如果元素已存在，立即返回
 * 如果超时仍未出现，抛出错误
 *
 * 与 waitForSubtitleElement 的区别：
 * - waitForSubtitleElement 使用 MutationObserver 监听 DOM 变化（事件驱动）
 * - waitForDOMRender 使用 requestAnimationFrame 主动轮询（适合 React 渲染后的检查）
 *
 * @param {React.RefObject} scrollContainerRef - 滚动容器引用
 * @param {number|string} cueId - 字幕 ID
 * @param {number} timeout - 超时时间（毫秒），默认 3000ms
 * @returns {Promise<boolean>} 是否成功等待到元素
 * @throws {Error} 超时后抛出错误
 *
 * @example
 * // 元素已存在
 * const result = await waitForDOMRender(scrollContainerRef, 1);
 *
 * @example
 * // 元素稍后渲染（适合 React setState 后的检查）
 * setState(newState);
 * await waitForDOMRender(scrollContainerRef, 1, 5000);
 */
export function waitForDOMRender(scrollContainerRef, cueId, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element = scrollContainerRef.current?.querySelector(
        `[data-subtitle-id="${cueId}"]`
      );

      if (element) {
        resolve(true);
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`等待 DOM 渲染超时: cue_id=${cueId}`));
        return;
      }

      // 继续下一帧检查
      requestAnimationFrame(checkElement);
    };

    // 首先检查元素是否已存在，如果不存在再使用 requestAnimationFrame
    const element = scrollContainerRef.current?.querySelector(
      `[data-subtitle-id="${cueId}"]`
    );

    if (element) {
      resolve(true);
    } else {
      requestAnimationFrame(checkElement);
    }
  });
}

export default {
  waitForSubtitleElement,
  waitForDOMRender,
};
