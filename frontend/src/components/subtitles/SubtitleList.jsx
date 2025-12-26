import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, IconButton } from '@mui/material';
import { Translate as TranslateIcon } from '@mui/icons-material';
import SubtitleRow from './SubtitleRow';
import { useSubtitleSync } from '../../hooks/useSubtitleSync';
import { getMockCues } from '../../services/subtitleService';

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
 */
export default function SubtitleList({
  cues: propsCues,
  currentTime = 0,
  duration = 0,
  onCueClick,
  audioUrl,
  episodeId,
  scrollContainerRef,
  isUserScrollingRef: externalIsUserScrollingRef,
}) {
  const [cues, setCues] = useState(propsCues || []);
  const [showTranslation, setShowTranslation] = useState(false);
  const internalContainerRef = useRef(null);
  const internalUserScrollTimeoutRef = useRef(null);
  const internalIsUserScrollingRef = useRef(false);
  const subtitleRefs = useRef({});

  // 使用外部滚动容器或内部滚动容器
  // 当使用外部滚动容器时，containerRef 指向外部容器；否则使用内部容器
  const containerRef = scrollContainerRef || internalContainerRef;
  
  // 使用外部用户滚动状态或内部状态
  const isUserScrollingRef = externalIsUserScrollingRef || internalIsUserScrollingRef;

  // 使用 useSubtitleSync hook 获取当前高亮字幕索引
  const { currentSubtitleIndex, scrollToSubtitle, registerSubtitleRef } = useSubtitleSync({
    currentTime,
    cues,
  });

  // 加载字幕数据（如果没有传入 cues，使用 mock 数据）
  useEffect(() => {
    if (propsCues) {
      setCues(propsCues);
    } else {
      // 使用 mock 数据
      getMockCues().then((mockCues) => {
        setCues(mockCues);
      });
    }
  }, [propsCues]);

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
   * 根据 PRD 6.2.4.1，当高亮字幕不在可见区域时，自动滚动到屏幕 1/3 处
   * 如果用户在页面上进行划线操作、"查询和想法操作弹框"展示或者是"AI查询卡片"在展示的时候，不自动滚动
   * 
   * 注意：目前先实现基础滚动逻辑，后续可以扩展暂停滚动的条件
   */
  useEffect(() => {
    // 如果用户正在滚动，不执行自动滚动
    if (isUserScrollingRef.current) {
      return;
    }

    if (currentSubtitleIndex !== null && containerRef.current) {
      const ref = subtitleRefs.current[currentSubtitleIndex];
      if (ref && ref.current) {
        const element = ref.current;
        const container = containerRef.current;
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 检查元素是否在可见区域
        const isVisible =
          elementRect.top >= containerRect.top &&
          elementRect.bottom <= containerRect.bottom;

        // 如果不在可见区域，自动滚动到屏幕 1/3 处
        if (!isVisible) {
          // 计算元素相对于滚动容器的位置
          // 使用 getBoundingClientRect 获取相对于视口的位置，然后加上容器的 scrollTop
          const containerScrollTop = container.scrollTop;
          
          // 元素相对于容器的顶部位置
          const elementTopRelativeToContainer = elementRect.top - containerRect.top + containerScrollTop;
          const containerHeight = container.clientHeight;
          const scrollTarget = elementTopRelativeToContainer - containerHeight / 3;

          container.scrollTo({
            top: Math.max(0, scrollTarget),
            behavior: 'smooth',
          });
        }
      }
    }
  }, [currentSubtitleIndex, containerRef, isUserScrollingRef]);

  /**
   * 监听用户滚动事件（仅当使用内部滚动容器时）
   * 根据 PRD 6.2.4.1，用户使用滚轮操作屏幕时，停止滚动，用户鼠标没有动作之后5s，重新回到滚动状态
   */
  const handleScroll = useCallback(() => {
    if (scrollContainerRef) {
      // 如果使用外部滚动容器，滚动事件在外部处理
      return;
    }
    
    isUserScrollingRef.current = true;

    // 清除之前的定时器
    if (internalUserScrollTimeoutRef.current) {
      clearTimeout(internalUserScrollTimeoutRef.current);
    }

    // 5秒后恢复自动滚动
    internalUserScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 5000);
  }, [scrollContainerRef, isUserScrollingRef]);

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
          pt: 5, // 为翻译按钮留出空间
          boxSizing: 'border-box',
        }}
      >
        {processedItems.map((item, itemIndex) => {
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
              />
            );
          }
        })}
      </Box>
    </Box>
  );
}
