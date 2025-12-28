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
    if (!scrollContainerRef?.current || !highlight?.cue_id || !noteSidebarRef?.current) {
      return null;
    }
    
    // 1. 通过 highlight.cue_id 找到对应的 SubtitleRow DOM 元素
    const subtitleElement = scrollContainerRef.current.querySelector(
      `[data-subtitle-id="${highlight.cue_id}"]`
    );
    
    if (!subtitleElement) {
      return null;
    }
    
    // 2. 找到笔记内容容器（note-sidebar-content）
    const noteContentContainer = noteSidebarRef.current.querySelector(
      '[data-testid="note-sidebar-content"]'
    );
    
    if (!noteContentContainer) {
      return null;
    }
    
    // 3. 计算相对于笔记内容容器的位置（不受页面缩放影响）
    // 使用 getBoundingClientRect() 直接计算相对位置，这样在页面缩放时也能保持稳定
    // 因为两个元素都按相同比例缩放，它们的相对位置保持不变
    const elementRect = subtitleElement.getBoundingClientRect();
    const noteContentRect = noteContentContainer.getBoundingClientRect();
    
    // 检查容器是否已经渲染完成（尺寸不为 0）
    // 如果容器还没有渲染完成，返回 null，等待下次更新
    // 注意：即使容器高度为 0，只要宽度不为 0，也认为容器已经渲染完成
    // 因为容器可能是空的，但位置信息仍然有效
    if (noteContentRect.width === 0 && noteContentRect.height === 0) {
      // 容器还没有渲染完成，返回 null，等待下次更新
      return null;
    }
    
    // 直接计算两个元素之间的相对位置（相对于视口）
    // 这个相对位置在页面缩放时保持不变，因为两个元素都按相同比例缩放
    let offsetTop = elementRect.top - noteContentRect.top;
    
    // 5. 边界检查：不限制位置，让笔记卡片始终跟随划线源
    // 即使位置超出容器，也保持原位置，由父容器的 overflow: visible 处理可见性
    // 这样可以确保笔记卡片始终与划线源对齐，不会因为页面缩放而飘散或重叠
    
    // 7. 如果计算出的位置仍然异常，可能是计算错误，返回 null
    // 正常情况下，offsetTop 应该在合理范围内（比如 -1000 到 10000 之间）
    if (offsetTop < -1000 || offsetTop > 10000) {
      console.warn('[useNotePosition] 计算出的位置值异常:', { offsetTop, elementRect, noteContentRect });
      return null;
    }
    
    return offsetTop;
  }, [scrollContainerRef, noteSidebarRef]);
  
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
  
  // 使用 useMemo 稳定 cues 的引用（基于长度和 ID 列表）
  const cuesKey = useMemo(() => {
    if (!cues || !Array.isArray(cues) || cues.length === 0) return '';
    return cues.map(c => c?.id ?? '').filter(Boolean).join(',');
  }, [cues]);
  
  // 使用 useMemo 稳定 highlights 的引用（基于长度和 ID 列表）
  const highlightsKey = useMemo(() => {
    if (!highlights || !Array.isArray(highlights) || highlights.length === 0) return '';
    return highlights.map(h => h?.id ?? '').filter(Boolean).join(',');
  }, [highlights]);
  
  /**
   * 初始计算位置（当 highlights 或 cues 变化时）
   * 使用稳定的 key 而不是直接依赖数组，避免因数组引用变化导致频繁触发
   */
  useEffect(() => {
    // 延迟执行，确保 DOM 已渲染
    const timer = setTimeout(() => {
      updatePositions();
    }, 100); // 增加延迟，减少触发频率
    
    return () => clearTimeout(timer);
  }, [cuesKey, highlightsKey, updatePositions]);
  
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
   * 监听窗口大小变化和页面缩放（可能导致位置变化）
   */
  useEffect(() => {
    const handleResize = () => {
      throttledUpdate();
    };
    
    // 监听窗口大小变化
    window.addEventListener('resize', handleResize, { passive: true });
    
    // 监听页面缩放事件（使用 visualViewport API，更准确）
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
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

