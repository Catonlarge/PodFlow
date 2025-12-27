import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, IconButton, Skeleton, Typography, LinearProgress, Stack } from '@mui/material';
import { Translate as TranslateIcon, Refresh } from '@mui/icons-material';
import SubtitleRow from './SubtitleRow';
import { useSubtitleSync } from '../../hooks/useSubtitleSync';
import { getMockCues, getCuesByEpisodeId, subtitleService } from '../../services/subtitleService';

/**
 * SubtitleList 组件
 * 
 * 字幕列表容器组件，管理字幕列表的滚动和定位
 * 
 * 功能描述：
 * - 字幕列表容器组件
 * - 管理字幕列表的滚动和定位
 * - 配合 useSubtitleSync 实现自动滚动到当前字幕
 * - 处理 speaker 分组显示
 * 
 * 相关PRD：
 * - PRD 6.2.4.1: 英文字幕区域
 * 
 * @module components/subtitles/SubtitleList
 * 
 * @param {Object} props
 * @param {Array} [props.cues] - 字幕数组（可选，无数据时使用 mock 数据）
 * @param {number} props.currentTime - 当前播放时间（秒）
 * @param {number} props.duration - 音频总时长（秒）
 * @param {Function} [props.onCueClick] - 字幕点击回调函数 (startTime) => void
 * @param {string} [props.audioUrl] - 音频 URL（用于后续对接 API）
 * @param {number} [props.episodeId] - Episode ID（用于后续对接 API）
 * @param {React.RefObject} [props.scrollContainerRef] - 外部滚动容器引用（如果提供，将使用外部容器滚动；否则使用内部滚动）
 * @param {boolean} [props.isInteracting] - 用户是否正在进行交互操作（划线、查询卡片展示等），用于阻断自动滚动
 * @param {Array} [props.highlights] - 划线数据数组，格式为 [{ cue_id, start_offset, end_offset, highlighted_text, color }]
 * @param {Function} [props.onHighlightClick] - 点击划线源的回调函数 (highlight) => void
 * @param {boolean} [props.isLoading] - 是否处于加载状态
 * @param {string} [props.transcriptionStatus] - 转录状态（pending/processing/completed/failed），用于在识别完成后触发字幕重新加载
 * @param {Array} [props.segments] - Segment 状态数组，用于显示底部状态提示
 */
export default function SubtitleList({
  cues: propsCues,
  currentTime = 0,
  onCueClick,
  episodeId,
  scrollContainerRef,
  isUserScrollingRef: externalIsUserScrollingRef,
  isInteracting = false,
  highlights = [],
  onHighlightClick,
  isLoading = false,
  transcriptionStatus,
  segments = [],
}) {
  const [cues, setCues] = useState(propsCues || []);
  const [showTranslation, setShowTranslation] = useState(false);
  const [subtitleLoadingState, setSubtitleLoadingState] = useState(null); // 'loading' | 'error' | null
  const [subtitleLoadingProgress, setSubtitleLoadingProgress] = useState(0);
  const [subtitleLoadingError, setSubtitleLoadingError] = useState(null);
  const internalContainerRef = useRef(null);
  const internalUserScrollTimeoutRef = useRef(null);
  const internalIsUserScrollingRef = useRef(false);
  const subtitleRefs = useRef({});
  const previousTranscriptionStatusRef = useRef(transcriptionStatus || null);
  const loadingProgressIntervalRef = useRef(null);

  // 使用外部滚动容器或内部滚动容器
  // 当使用外部滚动容器时，containerRef 指向外部容器；否则使用内部容器
  const containerRef = scrollContainerRef || internalContainerRef;

  // 使用 useSubtitleSync hook 获取当前高亮字幕索引
  const { currentSubtitleIndex, registerSubtitleRef } = useSubtitleSync({
    currentTime,
    cues,
  });

  // 加载字幕数据
  // 优先级：propsCues > episodeId > mock 数据
  useEffect(() => {
    // 清理之前的加载进度定时器
    if (loadingProgressIntervalRef.current) {
      clearInterval(loadingProgressIntervalRef.current);
      loadingProgressIntervalRef.current = null;
    }
    
    if (propsCues) {
      // 如果传入了 cues prop，直接使用
      // 使用 requestAnimationFrame 避免在 effect 中同步调用 setState
      requestAnimationFrame(() => {
        setCues(propsCues);
        setSubtitleLoadingState(null);
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(null);
      });
    } else if (episodeId) {
      // 根据PRD：字幕加载过程中，在英文字幕区域中间显示提示"请稍等，字幕加载中"和进度条
      setSubtitleLoadingState('loading');
      setSubtitleLoadingProgress(0);
      setSubtitleLoadingError(null);
      
      // 模拟字幕加载进度条（前端模拟，匀速增长）
      const startTime = Date.now();
      const loadDuration = 2000; // 假设加载需要2秒
      
      loadingProgressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / loadDuration) * 100, 99);
        setSubtitleLoadingProgress(progress);
      }, 100);
      
      // 如果有 episodeId，从 API 加载字幕数据
      getCuesByEpisodeId(episodeId).then((cues) => {
        // 清理进度定时器
        if (loadingProgressIntervalRef.current) {
          clearInterval(loadingProgressIntervalRef.current);
          loadingProgressIntervalRef.current = null;
        }
        
        // 加载完成，进度条直接走到100%
        setSubtitleLoadingProgress(100);
        
        // 短暂延迟后清除加载状态
        setTimeout(() => {
          setCues(cues);
          setSubtitleLoadingState(null);
          setSubtitleLoadingProgress(0);
        }, 300);
      }).catch((error) => {
        // 清理进度定时器
        if (loadingProgressIntervalRef.current) {
          clearInterval(loadingProgressIntervalRef.current);
          loadingProgressIntervalRef.current = null;
        }
        
        console.error('[SubtitleList] 加载字幕失败:', error);
        setSubtitleLoadingState('error');
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(error.response?.data?.detail || error.message || '字幕加载失败，请重试');
        
        // 如果 API 失败，不降级到 mock 数据（根据PRD，应该显示错误提示）
      });
    } else {
      // 既没有 cues 也没有 episodeId，使用 mock 数据
      getMockCues().then((mockCues) => {
        setCues(mockCues);
        setSubtitleLoadingState(null);
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(null);
      });
    }
    
    // 清理函数
    return () => {
      if (loadingProgressIntervalRef.current) {
        clearInterval(loadingProgressIntervalRef.current);
        loadingProgressIntervalRef.current = null;
      }
    };
  }, [propsCues, episodeId]);

  // 监听转录状态变化：当状态变为 completed 时，重新加载字幕
  useEffect(() => {
    // 如果没有 transcriptionStatus，跳过
    if (!transcriptionStatus) {
      // 仍然需要更新 ref，以便后续比较
      previousTranscriptionStatusRef.current = transcriptionStatus || null;
      return;
    }
    
    // 如果转录状态从非 completed 变为 completed，且没有传入 propsCues，则重新加载字幕
    const previousStatus = previousTranscriptionStatusRef.current;
    const currentStatus = transcriptionStatus;
    
    if (
      previousStatus !== 'completed' 
      && currentStatus === 'completed' 
      && !propsCues 
      && episodeId
    ) {
      console.log('[SubtitleList] 转录已完成，重新加载字幕数据');
      getCuesByEpisodeId(episodeId).then((cues) => {
        if (cues && cues.length > 0) {
          setCues(cues);
        }
      }).catch((error) => {
        console.error('[SubtitleList] 转录完成后加载字幕失败:', error);
      });
    }
    
    // 更新上一次的状态
    previousTranscriptionStatusRef.current = currentStatus;
  }, [transcriptionStatus, propsCues, episodeId]);

  /**
   * 处理 speaker 分组，为每个新的 speaker 添加 speaker 标签
   * 根据 PRD 6.2.4.1，speaker 标签单独占据一行，显示在每个 speaker 开始说的第一句话的上面
   * 
   * @returns {Array} 处理后的数组，包含字幕和 speaker 标签
   */
  const processedItems = useMemo(() => {
    if (!cues || cues.length === 0) {
      return [];
    }

    const items = [];
    let previousSpeaker = null;

    cues.forEach((cue, index) => {
      // 如果是新的 speaker，添加 speaker 标签
      if (cue.speaker !== previousSpeaker) {
        items.push({
          type: 'speaker',
          speaker: cue.speaker,
          cue: cue,
          index: index,
        });
        previousSpeaker = cue.speaker;
      }

      // 添加字幕行
      items.push({
        type: 'subtitle',
        cue: cue,
        index: index,
        showSpeaker: false,
      });
    });

    return items;
  }, [cues]);

  /**
   * 创建字幕行的 ref 回调
   */
  const createSubtitleRef = useCallback((index) => {
    return (element) => {
      if (element) {
        const refObj = { current: element };
        subtitleRefs.current[index] = refObj;
        registerSubtitleRef(index, refObj);
      }
    };
  }, [registerSubtitleRef]);

  /**
   * 自动滚动到当前播放的字幕
   * 根据 PRD 6.2.4.1：
   * - 如果用户在界面上没有进行任何操作（如点击、滚动等），当高亮字幕在不可见区域时，自动滚动，让高亮字幕保持在屏幕上1/3处
   * - 如果用户使用滚轮操作屏幕，则停止滚动，用户鼠标没有动作之后5s，重新回到滚动状态
   * - 如果用户在页面上进行划线操作、"查询和想法操作弹框"展示或者是"AI查询卡片"在展示的时候，不自动滚动
   */
  useEffect(() => {
    // 如果用户正在滚动，不执行自动滚动
    const scrollingRef = externalIsUserScrollingRef || internalIsUserScrollingRef;
    if (scrollingRef.current) {
      return;
    }

    // 如果用户正在进行交互操作（划线、查询卡片展示等），不执行自动滚动
    if (isInteracting) {
      return;
    }

    if (currentSubtitleIndex !== null && containerRef.current) {
      const ref = subtitleRefs.current[currentSubtitleIndex];
      if (ref && ref.current) {
        const element = ref.current;
        const container = containerRef.current;
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 检查元素是否完全在可见区域内
        // 元素在可见区域：元素的顶部 >= 容器的顶部 && 元素的底部 <= 容器的底部
        const isInViewport = 
          elementRect.top >= containerRect.top && 
          elementRect.bottom <= containerRect.bottom;

        // 调试信息
        const containerScrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const containerWidth = container.clientWidth;
        const elementTopRelativeToContainer = elementRect.top - containerRect.top + containerScrollTop;
        const elementHeight = elementRect.height;
        
        const scrollingRef = externalIsUserScrollingRef || internalIsUserScrollingRef;
        console.log('[SubtitleList Auto-Scroll Debug]', {
          currentSubtitleIndex,
          isUserScrolling: scrollingRef.current,
          isInteracting,
          isInViewport,
          containerInfo: {
            scrollTop: containerScrollTop,
            height: containerHeight,
            width: containerWidth,
            top: containerRect.top,
            bottom: containerRect.bottom,
            left: containerRect.left,
            right: containerRect.right,
          },
          elementInfo: {
            top: elementRect.top,
            bottom: elementRect.bottom,
            left: elementRect.left,
            right: elementRect.right,
            height: elementHeight,
            width: elementRect.width,
            topRelativeToContainer: elementTopRelativeToContainer,
          },
          positionCalculation: {
            elementTopOffset: elementRect.top - containerRect.top,
            elementBottomOffset: elementRect.bottom - containerRect.bottom,
            containerTop: containerRect.top,
            containerBottom: containerRect.bottom,
            targetPositionRatio: (elementRect.top - containerRect.top) / containerHeight,
          },
        });

        // 只有当高亮字幕不在可见区域时，才自动滚动
        if (!isInViewport) {
          // 计算元素相对于滚动容器的位置
          // 使用 getBoundingClientRect 获取相对于视口的位置，然后加上容器的 scrollTop
          
          // 滚动到屏幕上1/3处（让元素顶部距离容器顶部为容器高度的1/3）
          // 这样高亮字幕会显示在屏幕上半部分，更符合用户预期
          const scrollTarget = elementTopRelativeToContainer - containerHeight / 3;
          const finalScrollTarget = Math.max(0, scrollTarget);

          console.log('[SubtitleList Auto-Scroll Action]', {
            elementTopRelativeToContainer,
            containerHeight,
            scrollTarget,
            finalScrollTarget,
            scrollBehavior: 'smooth',
          });

          container.scrollTo({
            top: finalScrollTarget,
            behavior: 'smooth',
          });
        } else {
          // 即使在可见区域内，也记录当前位置信息，帮助调试
          const currentPositionRatio = (elementRect.top - containerRect.top) / containerHeight;
          const expectedPositionRatio = 1 / 3;
          const positionDiff = currentPositionRatio - expectedPositionRatio;
          
          console.log('[SubtitleList Auto-Scroll Skip]', {
            reason: 'Element is in viewport',
            currentPositionRatio: currentPositionRatio.toFixed(3),
            expectedPositionRatio: expectedPositionRatio.toFixed(3),
            positionDiff: positionDiff.toFixed(3),
            elementTopOffset: elementRect.top - containerRect.top,
            containerHeight,
          });
        }
      }
    }
      }, [currentSubtitleIndex, containerRef, externalIsUserScrollingRef, isInteracting]);

  // 已加载的segment索引集合（防止重复加载）
  const loadedSegmentIndicesRef = useRef(new Set());
  
  // 滚动触发异步加载逻辑
  const checkAndLoadNextSegment = useCallback(async () => {
    if (!episodeId || !segments || segments.length === 0) {
      return;
    }
    
    // 找到已加载字幕对应的最后一个segment
    const completedSegments = segments.filter(s => s.status === 'completed');
    const lastCompletedIndex = completedSegments.length > 0
      ? Math.max(...completedSegments.map(s => s.segment_index))
      : -1;
    
    // 检查下一个segment
    const nextSegmentIndex = lastCompletedIndex + 1;
    const nextSegment = segments.find(s => s.segment_index === nextSegmentIndex);
    
    if (!nextSegment) {
      // 没有下一个segment，说明全部完成
      return;
    }
    
    // 检查是否已经加载过
    if (loadedSegmentIndicesRef.current.has(nextSegmentIndex)) {
      return;
    }
    
    // 如果下一个segment已完成，加载字幕
    if (nextSegment.status === 'completed') {
      // 标记为已加载
      loadedSegmentIndicesRef.current.add(nextSegmentIndex);
      
      // 重新加载字幕数据（包含新完成的segment）
      try {
        const newCues = await getCuesByEpisodeId(episodeId);
        setCues(newCues);
      } catch (error) {
        console.error('[SubtitleList] 加载新segment字幕失败:', error);
      }
    } else if (nextSegment.status === 'pending' || (nextSegment.status === 'failed' && nextSegment.retry_count < 3)) {
      // 如果下一个segment未开始或失败但可重试，触发识别
      try {
        await subtitleService.triggerSegmentTranscription(episodeId, nextSegmentIndex);
        console.log(`[SubtitleList] 已触发 Segment ${nextSegmentIndex} 的识别任务`);
      } catch (error) {
        console.error(`[SubtitleList] 触发 Segment ${nextSegmentIndex} 识别失败:`, error);
      }
    }
    // 如果status是processing，不处理，等待完成
  }, [episodeId, segments]);
  
  /**
   * 监听用户滚动事件（仅当使用内部滚动容器时）
   * 根据 PRD 6.2.4.1，用户使用滚轮操作屏幕时，停止滚动，用户鼠标没有动作之后5s，重新回到滚动状态
   * 同时检查是否滚动到底部，触发下一个segment的加载
   */
  const handleScroll = useCallback(() => {
    if (scrollContainerRef) {
      // 如果使用外部滚动容器，滚动事件在外部处理
      return;
    }
    
    // 只使用内部 ref，避免修改外部传入的 ref
    internalIsUserScrollingRef.current = true;

    // 清除之前的定时器
    if (internalUserScrollTimeoutRef.current) {
      clearTimeout(internalUserScrollTimeoutRef.current);
    }

    // 5秒后恢复自动滚动
    internalUserScrollTimeoutRef.current = setTimeout(() => {
      internalIsUserScrollingRef.current = false;
    }, 5000);
    
    // 检查是否滚动到底部（距离底部 < 100px）
    const container = internalContainerRef.current;
    if (container) {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceToBottom < 100) {
        // 滚动到底部，触发检查下一个segment
        checkAndLoadNextSegment();
      }
    }
  }, [scrollContainerRef, checkAndLoadNextSegment]);
  
  // 监听外部滚动容器的滚动事件
  useEffect(() => {
    if (!scrollContainerRef || !scrollContainerRef.current) {
      return;
    }
    
    const container = scrollContainerRef.current;
    const handleExternalScroll = () => {
      // 检查是否滚动到底部
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceToBottom < 100) {
        // 滚动到底部，触发检查下一个segment
        checkAndLoadNextSegment();
      }
    };
    
    container.addEventListener('scroll', handleExternalScroll);
    return () => {
      container.removeEventListener('scroll', handleExternalScroll);
    };
  }, [scrollContainerRef, checkAndLoadNextSegment]);
  
  // 当segments变化时，重置已加载集合（重新计算）
  useEffect(() => {
    if (!segments || segments.length === 0) {
      loadedSegmentIndicesRef.current.clear();
      return;
    }
    
    // 重新计算已加载的segment（基于当前cues对应的segment）
    // 这里简化处理：找到所有completed的segment
    const completedIndices = segments
      .filter(s => s.status === 'completed')
      .map(s => s.segment_index);
    
    loadedSegmentIndicesRef.current = new Set(completedIndices);
  }, [segments]);

  // 清理定时器（仅当使用内部滚动容器时）
  useEffect(() => {
    if (scrollContainerRef) {
      // 如果使用外部滚动容器，定时器在外部处理
      return;
    }
    
    return () => {
      if (internalUserScrollTimeoutRef.current) {
        clearTimeout(internalUserScrollTimeoutRef.current);
      }
    };
  }, [scrollContainerRef]);

  // Loading 状态：显示 Skeleton
  if (isLoading) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} />
      </Box>
    );
  }

  // 字幕加载状态：显示加载提示和进度条（根据PRD：在英文字幕区域中间显示）
  if (subtitleLoadingState === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <Typography variant="body1" sx={{ color: 'text.primary' }}>
          请稍等，字幕加载中
        </Typography>
        <Box sx={{ width: '60%', maxWidth: 400 }}>
          <LinearProgress
            variant="determinate"
            value={subtitleLoadingProgress}
            sx={{
              height: 8,
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                backgroundColor: 'primary.main',
              },
            }}
          />
        </Box>
      </Box>
    );
  }

  // 字幕加载失败状态：显示错误提示和重试按钮（根据PRD：在英文字幕区域中间显示）
  if (subtitleLoadingState === 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body1" sx={{ color: 'text.primary' }}>
            字幕加载失败，错误原因：{subtitleLoadingError}，请重试
          </Typography>
          <IconButton
            onClick={() => {
              // 重新加载字幕
              setSubtitleLoadingState('loading');
              setSubtitleLoadingProgress(0);
              setSubtitleLoadingError(null);
              
              if (episodeId) {
                // 重新触发加载
                getCuesByEpisodeId(episodeId).then((cues) => {
                  setCues(cues);
                  setSubtitleLoadingState(null);
                  setSubtitleLoadingProgress(0);
                }).catch((error) => {
                  setSubtitleLoadingState('error');
                  setSubtitleLoadingError(error.response?.data?.detail || error.message || '字幕加载失败，请重试');
                });
              }
            }}
            aria-label="重试"
            sx={{
              '&:hover': { bgcolor: 'action.hover' },
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>
    );
  }

  // 如果没有字幕数据，显示占位内容
  if (!cues || cues.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
        }}
      >
        暂无字幕数据
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: scrollContainerRef ? 'auto' : '100%',
        minHeight: scrollContainerRef ? '100%' : 'auto',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: scrollContainerRef ? 'visible' : 'hidden',
      }}
    >
      {/* 显示翻译按钮（占位，暂不实现功能） */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          zIndex: 1,
        }}
      >
        <IconButton
          onClick={() => setShowTranslation(!showTranslation)}
          color={showTranslation ? 'primary' : 'default'}
          size="small"
          aria-label="显示翻译"
        >
          <TranslateIcon />
        </IconButton>
      </Box>

      {/* 字幕列表容器 */}
      <Box
        ref={internalContainerRef}
        onScroll={scrollContainerRef ? undefined : handleScroll}
        data-subtitle-container={scrollContainerRef ? undefined : true}
        sx={{
          width: '100%',
          height: scrollContainerRef ? 'auto' : '100%',
          overflowY: scrollContainerRef ? 'visible' : 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {processedItems.map((item) => {
          if (item.type === 'speaker') {
            // 渲染 speaker 标签行
            return (
              <SubtitleRow
                key={`speaker-${item.cue.id}`}
                cue={item.cue}
                index={item.index}
                isHighlighted={false}
                isPast={false}
                showSpeaker={true}
              />
            );
          } else {
            // 渲染字幕行
            const isHighlighted = currentSubtitleIndex === item.index;
            const isPast = currentSubtitleIndex !== null && item.index < currentSubtitleIndex;

            // 计算单词高亮进度 (0 到 1 之间的小数)
            let progress = 0;
            if (isPast) {
              progress = 1; // 过去的时间，全亮
            } else if (isHighlighted) {
              // 当前行：计算线性进度
              const cueDuration = item.cue.end_time - item.cue.start_time;
              if (cueDuration > 0) {
                // 限制在 0-1 之间
                progress = Math.min(1, Math.max(0, (currentTime - item.cue.start_time) / cueDuration));
              }
            }
            // 未来的行 progress 默认为 0

            // 获取当前 cue 的 highlights
            const cueHighlights = highlights.filter(h => h.cue_id === item.cue.id);

            return (
              <SubtitleRow
                key={`subtitle-${item.cue.id}`}
                ref={createSubtitleRef(item.index)}
                cue={item.cue}
                index={item.index}
                isHighlighted={isHighlighted}
                isPast={isPast}
                onClick={onCueClick}
                showSpeaker={false}
                showTranslation={showTranslation}
                progress={progress}
                highlights={cueHighlights}
                onHighlightClick={onHighlightClick}
              />
            );
          }
        })}
      </Box>
      
      {/* 底部状态提示区域（后续静默识别） */}
      <SubtitleListFooter
        segments={segments}
        transcriptionStatus={transcriptionStatus}
        episodeId={episodeId}
      />
    </Box>
  );
}

/**
 * SubtitleListFooter 组件
 * 
 * 显示字幕列表底部的状态提示
 * - 如果下一个segment正在识别中：显示"……请稍等，努力识别字幕中……"
 * - 如果所有segment已完成：显示"-END-"
 */
function SubtitleListFooter({ segments, transcriptionStatus, episodeId }) {
  const [nextSegmentStatus, setNextSegmentStatus] = useState(null);
  const [allCompleted, setAllCompleted] = useState(false);
  
  useEffect(() => {
    if (!segments || segments.length === 0) {
      setNextSegmentStatus(null);
      setAllCompleted(false);
      return;
    }
    
    // 找到已加载字幕对应的最后一个segment
    // 这里简化处理：找到最后一个status为completed的segment
    const completedSegments = segments.filter(s => s.status === 'completed');
    const lastCompletedIndex = completedSegments.length > 0
      ? Math.max(...completedSegments.map(s => s.segment_index))
      : -1;
    
    // 检查下一个segment
    const nextSegment = segments.find(s => s.segment_index === lastCompletedIndex + 1);
    
    if (!nextSegment) {
      // 没有下一个segment，说明全部完成
      setAllCompleted(true);
      setNextSegmentStatus(null);
    } else {
      setAllCompleted(false);
      setNextSegmentStatus(nextSegment.status);
    }
  }, [segments]);
  
  // 如果转录已完成，显示-END-
  if (transcriptionStatus === 'completed' || allCompleted) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 2,
          color: 'text.secondary',
          fontSize: '0.875rem',
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          -END-
        </Typography>
      </Box>
    );
  }
  
  // 如果下一个segment正在识别中，显示提示
  if (nextSegmentStatus === 'processing' || nextSegmentStatus === 'pending') {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 2,
          color: 'text.secondary',
          fontSize: '0.875rem',
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          ……请稍等，努力识别字幕中……
        </Typography>
      </Box>
    );
  }
  
  // 其他情况不显示
  return null;
}
