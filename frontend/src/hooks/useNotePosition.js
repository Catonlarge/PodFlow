/**
 * useNotePosition Hook
 * 
 * 计算笔记卡片的位置，实现"始终跟随划线源"逻辑
 * 
 * 功能描述：
 * - 为每个 Highlight 计算其在左侧字幕区域的垂直位置（offsetTop）
 * - 监听左侧滚动事件，同步更新笔记卡片位置
 * - 使用 getBoundingClientRect() 获取元素位置
 * 
 * 相关PRD：
 * - PRD 6.2.4.h.i: 笔记卡片始终跟随划线源
 * - PRD 390行: 笔记卡片的顶部在用户的"划线源"顶部上面24px的位置
 * 
 * @module hooks/useNotePosition
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * useNotePosition Hook
 * 
 * @param {Object} params
 * @param {Array} params.highlights - Highlight 数组，格式：[{ id, cue_id, ... }]
 * @param {Array} params.cues - TranscriptCue 数组，格式：[{ id, start_time, ... }]
 * @param {React.RefObject} params.scrollContainerRef - 左侧字幕滚动容器引用
 * @param {React.RefObject} [params.noteSidebarRef] - 右侧笔记容器引用（可选，用于计算相对位置）
 * @returns {Object} 返回位置映射对象 { highlight_id: offsetTop }
 */
export function useNotePosition({ highlights = [], cues = [], scrollContainerRef, noteSidebarRef }) {
  const [positions, setPositions] = useState({});
  const positionsRef = useRef({});
  const updateTimeoutRef = useRef(null);
  
  /**
   * 计算单个 Highlight 的位置
   * 
   * @param {Object} highlight - Highlight 对象
   * @returns {number|null} offsetTop 值，如果找不到元素则返回 null
   */
  const calculatePosition = useCallback((highlight) => {
    if (!scrollContainerRef?.current || !highlight?.cue_id) {
      return null;
    }
    
    // 1. 通过 highlight.cue_id 找到对应的 SubtitleRow DOM 元素
    const subtitleElement = scrollContainerRef.current.querySelector(
      `[data-subtitle-id="${highlight.cue_id}"]`
    );
    
    if (!subtitleElement) {
      return null;
    }
    
    // 2. 使用 getBoundingClientRect() 获取元素位置
    const elementRect = subtitleElement.getBoundingClientRect();
    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    
    // 3. 计算相对于滚动容器的 offsetTop
    // offsetTop = 元素顶部相对于容器顶部的距离 + 容器的 scrollTop
    const offsetTop = elementRect.top - containerRect.top + scrollContainerRef.current.scrollTop;
    
    return offsetTop;
  }, [scrollContainerRef]);
  
  /**
   * 批量更新所有 Highlight 的位置
   */
  const updatePositions = useCallback(() => {
    if (!scrollContainerRef?.current || highlights.length === 0) {
      setPositions({});
      positionsRef.current = {};
      return;
    }
    
    const newPositions = {};
    let hasValidPosition = false;
    
    highlights.forEach((highlight) => {
      const position = calculatePosition(highlight);
      if (position !== null) {
        newPositions[highlight.id] = position;
        hasValidPosition = true;
      }
    });
    
    if (hasValidPosition || Object.keys(positionsRef.current).length > 0) {
      setPositions(newPositions);
      positionsRef.current = newPositions;
    }
  }, [highlights, calculatePosition, scrollContainerRef]);
  
  /**
   * 节流函数（限制更新频率）
   */
  const throttledUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(() => {
      updatePositions();
    }, 100); // 100ms 节流
  }, [updatePositions]);
  
  /**
   * 初始计算位置（当 highlights 或 cues 变化时）
   */
  useEffect(() => {
    // 延迟执行，确保 DOM 已渲染
    const timer = setTimeout(() => {
      updatePositions();
    }, 0);
    
    return () => clearTimeout(timer);
  }, [highlights, cues, updatePositions]);
  
  /**
   * 监听左侧滚动容器的滚动事件
   */
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) {
      return;
    }
    
    const handleScroll = () => {
      throttledUpdate();
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainerRef, throttledUpdate]);
  
  /**
   * 监听窗口大小变化（可能导致位置变化）
   */
  useEffect(() => {
    const handleResize = () => {
      throttledUpdate();
    };
    
    window.addEventListener('resize', handleResize, { passive: true });
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [throttledUpdate]);
  
  /**
   * 使用 MutationObserver 监听 DOM 变化（字幕可能异步加载）
   */
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) {
      return;
    }
    
    const observer = new MutationObserver(() => {
      throttledUpdate();
    });
    
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,
    });
    
    return () => {
      observer.disconnect();
    };
  }, [scrollContainerRef, throttledUpdate]);
  
  /**
   * 清理定时器
   */
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);
  
  return positions;
}

