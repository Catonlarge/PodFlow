import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useSubtitleSync Hook
 * 
 * 字幕同步逻辑，根据当前播放时间自动高亮对应的字幕行
 * 
 * 功能描述：
 * - 根据当前播放时间自动高亮对应的字幕行
 * - 处理字幕时间戳匹配逻辑
 * - 支持字幕滚动定位
 * 
 * 相关PRD：
 * - PRD 6.2.4.1: 英文字幕动效逻辑
 * 
 * @module hooks/useSubtitleSync
 * 
 * @param {Object} options
 * @param {number} options.currentTime - 当前播放时间（秒）
 * @param {Array} options.cues - 字幕数组
 * @returns {Object} { currentSubtitleIndex, scrollToSubtitle }
 */
export function useSubtitleSync({ currentTime, cues = [] }) {
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(null);
  const subtitleRefs = useRef({});

  /**
   * 根据当前播放时间计算应该高亮的字幕索引
   * 
   * 算法：遍历 cues 数组，找到包含 currentTime 的字幕
   * 如果 currentTime 在某个 cue 的 [start_time, end_time) 区间内，则高亮该字幕
   * 
   * @param {number} time - 当前播放时间
   * @param {Array} cuesList - 字幕数组
   * @returns {number|null} 字幕索引，如果未找到则返回 null
   */
  const findSubtitleIndex = useCallback((time, cuesList) => {
    if (!cuesList || cuesList.length === 0) {
      return null;
    }

    // 边界情况：未开始播放
    if (time <= 0) {
      return null;
    }

    // 遍历 cues 数组，找到包含当前时间的字幕
    for (let i = 0; i < cuesList.length; i++) {
      const cue = cuesList[i];
      // 如果时间在字幕的时间范围内 [start_time, end_time)，返回该字幕索引
      if (time >= cue.start_time && time < cue.end_time) {
        return i;
      }
    }

    // 如果时间超过了所有字幕的结束时间，返回最后一个字幕索引
    const lastCue = cuesList[cuesList.length - 1];
    if (time >= lastCue.end_time) {
      return cuesList.length - 1;
    }

    // 如果时间在两个字幕之间（大于等于某个字幕的结束时间但小于下一个字幕的开始时间）
    // 返回下一个字幕索引（因为当前时间应该高亮下一个将要播放的字幕）
    for (let i = 0; i < cuesList.length - 1; i++) {
      const cue = cuesList[i];
      const nextCue = cuesList[i + 1];
      // 如果时间在当前字幕结束之后，下一个字幕开始之前
      if (time >= cue.end_time && time < nextCue.start_time) {
        return i + 1;
      }
    }

    return null;
  }, []);

  /**
   * 根据当前播放时间更新高亮字幕索引
   */
  useEffect(() => {
    const index = findSubtitleIndex(currentTime, cues);
    // 使用 requestAnimationFrame 避免在 effect 中同步调用 setState
    requestAnimationFrame(() => {
      setCurrentSubtitleIndex((prevIndex) => {
        return prevIndex !== index ? index : prevIndex;
      });
    });
  }, [currentTime, cues, findSubtitleIndex]);

  /**
   * 滚动到指定的字幕行
   * 
   * @param {number} index - 字幕索引
   */
  const scrollToSubtitle = useCallback((index) => {
    if (index === null || index === undefined) {
      return;
    }

    const ref = subtitleRefs.current[index];
    if (ref && ref.current) {
      // 滚动到屏幕 1/3 处（根据 PRD 6.2.4.1 要求）
      const element = ref.current;
      const elementTop = element.offsetTop;
      const container = element.closest('[data-subtitle-container]');
      
      if (container) {
        const containerHeight = container.clientHeight;
        const scrollTarget = elementTop - containerHeight / 3;
        container.scrollTo({
          top: scrollTarget,
          behavior: 'smooth'
        });
      } else {
        // 如果没有容器，直接使用 scrollIntoView
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, []);

  /**
   * 注册字幕行的 ref
   * 
   * @param {number} index - 字幕索引
   * @param {React.RefObject} ref - React ref
   */
  const registerSubtitleRef = useCallback((index, ref) => {
    subtitleRefs.current[index] = ref;
  }, []);

  return {
    currentSubtitleIndex,
    scrollToSubtitle,
    registerSubtitleRef,
  };
}
