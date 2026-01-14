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
import { waitForSubtitleElement } from '../utils/domUtils';

/**
 * useNotePosition Hook
 *
 * @param {Object} params
 * @param {Array} params.highlights - Highlight 数组，格式：[{ id, cue_id, ... }]
 * @param {Array} params.cues - TranscriptCue 数组，格式：[{ id, start_time, ... }]
 * @param {React.RefObject} params.scrollContainerRef - 左侧字幕滚动容器引用
 * @param {React.RefObject} [params.noteSidebarRef] - 右侧笔记容器引用（可选，用于计算相对位置）
 * @param {boolean} [params.isExpanded] - 侧边栏是否展开（用于触发位置更新）
 * @returns {Object} 返回位置映射对象 { highlight_id: offsetTop }
 */
export function useNotePosition({ highlights = [], cues = [], scrollContainerRef, noteSidebarRef, isExpanded }) {
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
    // 详细的调试日志：检查所有依赖
    if (!scrollContainerRef?.current) {
      console.debug('[useNotePosition] calculatePosition: scrollContainerRef.current 不存在');
      return null;
    }
    if (!highlight?.cue_id) {
      console.debug('[useNotePosition] calculatePosition: highlight.cue_id 不存在', highlight);
      return null;
    }

    // 1. 通过 highlight.cue_id 找到对应的 SubtitleRow DOM 元素
    // 🔧 修复：使用 querySelector 在所有后代中查找（不限定直接子元素）
    const subtitleElement = scrollContainerRef.current.querySelector(
      `[data-subtitle-id="${highlight.cue_id}"]`
    );

    if (!subtitleElement) {
      // 🔍 调试：检查容器中是否有任何字幕元素
      const allSubtitleElements = scrollContainerRef.current.querySelectorAll('[data-subtitle-id]');
      console.debug('[useNotePosition] calculatePosition: 找不到字幕元素', {
        cue_id: highlight.cue_id,
        highlight_id: highlight.id,
        selector: `[data-subtitle-id="${highlight.cue_id}"]`,
        container_tag: scrollContainerRef.current.tagName,
        total_subtitle_elements_in_dom: allSubtitleElements.length,
        sample_subtitle_ids: Array.from(allSubtitleElements).slice(0, 5).map(el => el.getAttribute('data-subtitle-id'))
      });
      return null;
    }

    // 2. 计算字幕元素相对于滚动容器的位置
    // 🔧 修复：虚拟滚动使用 transform 定位，offsetTop 累加无效
    // 使用 getBoundingClientRect() 计算元素相对于滚动容器的位置

    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    const elementRect = subtitleElement.getBoundingClientRect();

    // 计算元素相对于滚动容器的顶部距离
    // elementRect.top - containerRect.top 得到元素相对于容器的位置
    // containerRef.current.scrollTop 加上当前滚动偏移
    let offsetTop = elementRect.top - containerRect.top + scrollContainerRef.current.scrollTop;

    console.debug('[useNotePosition] calculatePosition: 使用 getBoundingClientRect 计算位置', {
      highlight_id: highlight.id,
      cue_id: highlight.cue_id,
      element_rect_top: elementRect.top,
      container_rect_top: containerRect.top,
      scroll_top: scrollContainerRef.current.scrollTop,
      calculated_offsetTop: offsetTop
    });

    // 6. 边界检查（使用相对边界，适应任意长度的内容）
    // 🔧 修复：不再使用硬编码的绝对高度限制
    // 原因：播客音频可能长达数小时，滚动高度不可预测
    // 新逻辑：只检查明显异常的值（负数或超过容器 scrollHeight 的 2 倍）
    const maxAllowedPosition = scrollContainerRef.current.scrollHeight * 2;
    if (offsetTop < 0 || offsetTop > maxAllowedPosition) {
      console.warn('[useNotePosition] calculatePosition: 计算出的位置值异常', {
        offsetTop,
        highlight_id: highlight.id,
        cue_id: highlight.cue_id,
        scroll_height: scrollContainerRef.current.scrollHeight,
        max_allowed: maxAllowedPosition,
        reason: offsetTop < 0 ? 'offsetTop 为负数' : 'offsetTop 超过容器 scrollHeight 的 2 倍'
      });
      return null;
    }

    return offsetTop;
  }, [scrollContainerRef, noteSidebarRef]);
  
  /**
   * 批量更新所有 Highlight 的位置
   */
  const updatePositions = useCallback(() => {
    console.debug('[useNotePosition] updatePositions: 开始更新位置', {
      highlights_count: highlights.length,
      scrollContainer_exists: !!scrollContainerRef?.current,
      noteSidebar_exists: !!noteSidebarRef?.current
    });

    if (!scrollContainerRef?.current || highlights.length === 0) {
      console.debug('[useNotePosition] updatePositions: 跳过更新（无容器或无 highlights）');
      setPositions({});
      positionsRef.current = {};
      return;
    }

    // 🔧 修复：保留之前计算的位置，避免因虚拟滚动导致元素移除时丢失位置
    // 只在成功计算出新位置时才更新，否则保留旧值
    const newPositions = { ...positionsRef.current };
    const failedPositions = []; // 记录失败的位置计算
    let hasValidPosition = false;
    let hasNewPosition = false;

    highlights.forEach((highlight) => {
      const position = calculatePosition(highlight);
      if (position !== null) {
        // 成功计算出新位置，更新
        newPositions[highlight.id] = position;
        hasValidPosition = true;
        hasNewPosition = true;
      } else {
        // 计算失败，检查是否已有保存的位置
        if (newPositions[highlight.id] !== undefined) {
          // 有旧位置，保留
          hasValidPosition = true;
          failedPositions.push({ id: highlight.id, cue_id: highlight.cue_id, reason: '保留旧位置' });
        } else {
          // 没有旧位置，记录为完全失败
          failedPositions.push({ id: highlight.id, cue_id: highlight.cue_id, reason: '无位置' });
        }
      }
    });

    console.debug('[useNotePosition] updatePositions: 更新完成', {
      total: highlights.length,
      success: Object.keys(newPositions).length,
      new_positions: hasNewPosition ? Object.keys(newPositions).filter(k => newPositions[k] !== positionsRef.current[k]).length : 0,
      failed: failedPositions.length,
      failed_ids: failedPositions.map(f => `${f.id}(cue:${f.cue_id})`),
      positions: newPositions
    });

    if (hasValidPosition) {
      setPositions(newPositions);
      positionsRef.current = newPositions;
    }
  }, [highlights, calculatePosition, scrollContainerRef, noteSidebarRef]);
  
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
   *
   * 观察者模式：处理异步字幕挂载问题
   * - 使用 waitForSubtitleElement 等待字幕元素出现
   * - 比固定延迟重试更可靠，能在元素出现时立即响应
   * - 超时时间 1000ms（较短超时，快速跳过不在DOM中的元素）
   * - 配合 MutationObserver 监听后续虚拟滚动渲染的新元素
   */
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.debug('[useNotePosition] useEffect: ========== 触发位置更新 ==========', {
      timestamp,
      cues_changed: !!cuesKey,
      highlights_changed: !!highlightsKey,
      highlights_count: highlights.length,
      highlights_ids: highlights.map(h => ({ id: h?.id, cue_id: h?.cue_id }))
    });

    // 如果没有 highlights，清空位置
    if (highlights.length === 0) {
      setPositions({});
      positionsRef.current = {};
      return;
    }

    // 为每个 highlight 等待对应的字幕元素
    const updatePositionsForHighlights = async () => {
      const newPositions = {};
      const promises = [];

      highlights.forEach((highlight) => {
        if (!highlight?.cue_id || !scrollContainerRef?.current) {
          return;
        }

        // 使用观察者模式等待字幕元素
        // 超时时间设为 1000ms，快速跳过不在DOM中的元素
        // 配合 MutationObserver 监听后续虚拟滚动渲染的新元素
        const promise = waitForSubtitleElement(
          scrollContainerRef.current,
          highlight.cue_id,
          1000  // 缩短超时时间，从 3000ms 改为 1000ms
        )
          .then((subtitleElement) => {
            // 🔧 修复：虚拟滚动使用 transform 定位，使用 getBoundingClientRect 计算位置
            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            const elementRect = subtitleElement.getBoundingClientRect();

            // 计算元素相对于滚动容器的顶部距离
            let offsetTop = elementRect.top - containerRect.top + scrollContainerRef.current.scrollTop;

            console.debug('[useNotePosition] useEffect: 计算单个位置', {
              highlight_id: highlight.id,
              cue_id: highlight.cue_id,
              offsetTop,
              element_rect_top: elementRect.top,
              container_rect_top: containerRect.top,
              scroll_top: scrollContainerRef.current.scrollTop,
              scroll_height: scrollContainerRef.current.scrollHeight
            });

            // 边界检查（使用相对边界，适应任意长度的内容）
            // 🔧 修复：不再使用硬编码的绝对高度限制
            // 原因：播客音频可能长达数小时，滚动高度不可预测
            // 新逻辑：只检查明显异常的值（负数或超过容器 scrollHeight 的 2 倍）
            const maxAllowedPosition = scrollContainerRef.current.scrollHeight * 2;
            if (offsetTop >= 0 && offsetTop <= maxAllowedPosition) {
              newPositions[highlight.id] = offsetTop;
            } else {
              console.warn('[useNotePosition] useEffect: 位置边界检查失败', {
                highlight_id: highlight.id,
                cue_id: highlight.cue_id,
                offsetTop,
                scroll_height: scrollContainerRef.current.scrollHeight,
                max_allowed: maxAllowedPosition,
                reason: offsetTop < 0 ? 'offsetTop 为负数' : 'offsetTop 超过容器 scrollHeight 的 2 倍'
              });
            }
          })
          .catch((error) => {
            // 超时是预期行为：元素可能不在当前加载的 cues 中，或不在虚拟滚动的可视区域
            // MutationObserver 会在元素被渲染时触发位置更新
            console.debug('[useNotePosition] waitForSubtitleElement 跳过（元素未渲染）:', {
              highlight_id: highlight.id,
              cue_id: highlight.cue_id,
              reason: error.message
            });
          });

        promises.push(promise);
      });

      // 等待所有 promise 完成（无论成功或失败）
      await Promise.allSettled(promises);

      // 更新位置
      if (Object.keys(newPositions).length > 0) {
        setPositions(newPositions);
        positionsRef.current = newPositions;
      }

      console.debug('[useNotePosition] useEffect: 观察者模式位置更新完成', {
        total: highlights.length,
        success: Object.keys(newPositions).length,
        failed: highlights.length - Object.keys(newPositions).length,
        positions: newPositions
      });
    };

    updatePositionsForHighlights();
  }, [cuesKey, highlightsKey, scrollContainerRef, noteSidebarRef]);
  
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
   * 监听侧边栏展开状态变化
   * 当侧边栏展开时，延迟触发位置更新，确保容器已渲染
   */
  useEffect(() => {
    if (isExpanded) {
      console.debug('[useNotePosition] 侧边栏已展开，延迟触发位置更新');
      // 延迟触发，确保 DOM 已更新
      const timer = setTimeout(() => {
        updatePositions();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isExpanded, updatePositions]);
  
  /**
   * 使用 MutationObserver 监听 DOM 变化（字幕可能异步加载）
   * 当虚拟滚动渲染新字幕时，触发位置更新
   *
   * 优化：只监听包含字幕元素的 DOM 变化，避免虚拟滚动频繁触发
   */
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) {
      console.debug('[useNotePosition] MutationObserver: 容器不存在，跳过监听');
      return;
    }

    console.debug('[useNotePosition] MutationObserver: 开始监听 DOM 变化');

    let lastUpdateTime = 0;
    const MUTATION_DEBOUNCE = 300; // 300ms 防抖，避免频繁触发

    // 获取当前需要监听的 cue_id 列表
    const getCueIdsToWatch = () => {
      return highlights
        .map(h => h?.cue_id)
        .filter(Boolean)
        .map(id => `[data-subtitle-id="${id}"]`)
        .join(',');
    };

    const observer = new MutationObserver((mutations) => {
      const now = Date.now();

      // 防抖检查：距离上次更新时间太短，跳过
      if (now - lastUpdateTime < MUTATION_DEBOUNCE) {
        return;
      }

      // 检查是否有相关的 DOM 变化（只关注字幕元素）
      const hasRelevantChanges = mutations.some(mutation => {
        // 检查添加的节点中是否包含字幕元素
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查节点本身是否是字幕元素
            if (node.hasAttribute && node.hasAttribute('data-subtitle-id')) {
              const cueId = node.getAttribute('data-subtitle-id');
              // 检查这个 cue_id 是否在我们关心的列表中
              const isRelevant = highlights.some(h => h?.cue_id?.toString() === cueId);
              if (isRelevant) {
                console.debug('[useNotePosition] MutationObserver: 检测到相关字幕元素添加', { cueId });
                return true;
              }
            }
            // 检查子节点中是否包含字幕元素
            if (node.querySelectorAll) {
              const subtitleElements = node.querySelectorAll('[data-subtitle-id]');
              for (const elem of subtitleElements) {
                const cueId = elem.getAttribute('data-subtitle-id');
                const isRelevant = highlights.some(h => h?.cue_id?.toString() === cueId);
                if (isRelevant) {
                  console.debug('[useNotePosition] MutationObserver: 检测到相关字幕元素添加（子节点）', { cueId });
                  return true;
                }
              }
            }
          }
        }
        return false;
      });

      if (hasRelevantChanges) {
        lastUpdateTime = now;
        console.debug('[useNotePosition] MutationObserver: 检测到 DOM 变化，触发位置更新');
        throttledUpdate();
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    return () => {
      console.debug('[useNotePosition] MutationObserver: 停止监听');
      observer.disconnect();
    };
  }, [scrollContainerRef, throttledUpdate, highlights]);
  
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

