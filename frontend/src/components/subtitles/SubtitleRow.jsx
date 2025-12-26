import React, { memo, forwardRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { formatTime } from '../../utils/timeUtils';

/**
 * SubtitleRow 组件
 * 
 * 单行字幕组件，显示字幕内容、时间标签、speaker 标签
 * 
 * 功能描述：
 * - 显示单行字幕内容
 * - 根据 useSubtitleSync 返回的状态改变背景色，实现选中效果
 * - 必须独立拆分以配合 React.memo 优化渲染性能（字幕列表可能有1000+行）
 * 
 * 性能优化：
 * - 使用 React.memo 避免不必要的重渲染
 * - 根据 useSubtitleSync 状态改变背景色，实现"隐形"的划线效果
 * 
 * 相关PRD：
 * - PRD 6.2.4.1: 英文字幕区域
 * 
 * @module components/subtitles/SubtitleRow
 * 
 * @param {Object} props
 * @param {Object} props.cue - 字幕数据 { id, start_time, end_time, speaker, text, translation? }
 * @param {number} props.index - 字幕索引（用于排序）
 * @param {boolean} props.isHighlighted - 是否高亮（当前播放）
 * @param {boolean} props.isPast - 是否已播放过
 * @param {Function} [props.onClick] - 点击回调函数 (startTime) => void
 * @param {boolean} [props.showSpeaker] - 是否显示 speaker 标签
 * @param {boolean} [props.showTranslation] - 是否显示翻译
 * @param {number} [props.progress] - 单词高亮进度（0-1 之间的小数，用于单词级高亮）
 * @param {Array} [props.highlights] - 当前 cue 的划线数据数组
 * @param {Function} [props.onHighlightClick] - 点击划线源的回调函数 (highlight) => void
 */
const SubtitleRow = forwardRef(function SubtitleRow({
  cue,
  index,
  isHighlighted,
  isPast,
  onClick,
  showSpeaker = false,
  showTranslation = false,
  progress = 0,
  highlights = [],
  onHighlightClick,
}, ref) {
  const [isHovered, setIsHovered] = useState(false);

  // 当字幕失去高亮时，清除 hover 状态，避免灰色背景残留
  useEffect(() => {
    if (!isHighlighted && isHovered) {
      setIsHovered(false);
    }
  }, [isHighlighted, isHovered]);

  // 将句子拆分为单词数组（使用 useMemo 避免每次渲染都 split）
  const words = useMemo(() => {
    if (!cue || !cue.text) return [];
    return cue.text.split(' ');
  }, [cue?.text]);

  // 计算当前应该高亮到第几个单词
  // 假设匀速：总单词数 * 进度百分比 = 当前高亮单词的索引
  const activeWordIndex = Math.floor(words.length * progress);

  /**
   * 渲染带下划线的文本片段
   * 根据 highlights 数组，在文本对应位置渲染紫色下划线
   * 同时支持单词级高亮
   */
  const renderTextParts = useMemo(() => {
    if (!cue || !cue.text) {
      return [];
    }

    // 如果没有 highlights，返回单个文本片段
    if (!highlights || highlights.length === 0) {
      return [{
        type: 'text',
        content: cue.text,
        startCharIndex: 0,
        endCharIndex: cue.text.length,
      }];
    }

    // 按 start_offset 排序 highlights
    const sortedHighlights = [...highlights].sort((a, b) => a.start_offset - b.start_offset);
    
    // 过滤重叠的 highlights（PRD 要求：禁止重叠划线）
    // 如果两个 highlight 重叠，只保留第一个（按 start_offset 排序后的第一个）
    const nonOverlappingHighlights = [];
    let lastEndIndex = -1;
    
    sortedHighlights.forEach((highlight) => {
      const { start_offset, end_offset } = highlight;
      
      // 检查是否与已处理的 highlight 重叠
      // 重叠条件：start_offset < lastEndIndex（新 highlight 的开始位置在之前 highlight 的结束位置之前）
      if (start_offset >= lastEndIndex) {
        // 不重叠，添加到列表
        nonOverlappingHighlights.push(highlight);
        lastEndIndex = Math.max(lastEndIndex, end_offset);
      }
      // 如果重叠，跳过这个 highlight（符合 PRD "禁止重叠划线" 的要求）
    });
    
    const parts = [];
    let lastIndex = 0;

    nonOverlappingHighlights.forEach((highlight) => {
      const { start_offset, end_offset, highlighted_text, color, id } = highlight;
      
      // 添加划线前的文本
      if (start_offset > lastIndex) {
        parts.push({
          type: 'text',
          content: cue.text.substring(lastIndex, start_offset),
          startCharIndex: lastIndex,
          endCharIndex: start_offset,
        });
      }

      // 添加划线文本
      parts.push({
        type: 'highlight',
        content: highlighted_text || cue.text.substring(start_offset, end_offset),
        color: color || '#9C27B0',
        highlightId: id,
        startCharIndex: start_offset,
        endCharIndex: end_offset,
      });

      lastIndex = end_offset;
    });

    // 添加剩余的文本
    if (lastIndex < cue.text.length) {
      parts.push({
        type: 'text',
        content: cue.text.substring(lastIndex),
        startCharIndex: lastIndex,
        endCharIndex: cue.text.length,
      });
    }

    return parts;
  }, [cue?.text, highlights]);

  /**
   * 计算文本片段在整个句子中的单词范围
   */
  const getWordRangeForTextPart = useCallback((part) => {
    if (!cue || !cue.text) return { startWordIndex: 0, endWordIndex: 0 };
    
    // 计算片段开始位置之前的单词数
    const textBeforePart = cue.text.substring(0, part.startCharIndex);
    const wordsBefore = textBeforePart.split(' ').filter(w => w.length > 0);
    const startWordIndex = wordsBefore.length;
    
    // 计算片段内的单词数
    const wordsInPart = part.content.split(' ').filter(w => w.length > 0);
    const endWordIndex = startWordIndex + wordsInPart.length;
    
    return { startWordIndex, endWordIndex };
  }, [cue?.text]);

  if (!cue) {
    return null;
  }

  const handleClick = () => {
    if (onClick) {
      onClick(cue.start_time);
    }
  };

  const handleMouseEnter = () => {
    // 只有在非高亮状态下才设置 hover
    if (!isHighlighted) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Speaker 标签行（单独一行，无时间标签）
  if (showSpeaker) {
    return (
      <Box
        sx={{
          py: 3,
          px: 1,
        }}
      >
        <Typography
          variant="body1"
          sx={{
            fontSize: '15px',
            color: 'text.secondary',
            fontWeight: 500,
          }}
        >
          {cue.speaker}：
        </Typography>
      </Box>
    );
  }

  // 字幕行
  // 根据高亮状态和 hover 状态确定背景色
  const backgroundColor = isHighlighted 
    ? 'background.default' 
    : isHovered 
      ? 'action.hover' 
      : 'background.default';

  return (
    <Box
      ref={ref}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        px: 1,
        py: 3,
        mb: 0,
        cursor: 'pointer',
        backgroundColor: backgroundColor,
        border: isHighlighted ? '2px solid' : '2px solid transparent',
        borderColor: isHighlighted ? 'primary.main' : 'transparent',
        borderRadius: 1,
        transition: 'all 0.2s ease-in-out',
        boxSizing: 'border-box',
        maxWidth: '100%',
        width: '100%',
      }}
      data-subtitle-id={cue.id}
      data-subtitle-index={index}
    >
      {/* 时间标签 */}
      <Typography
        variant="body2"
        sx={{
          fontSize: '15px',
          color: isHighlighted ? 'primary.main' : 'text.secondary',
          fontWeight: isHighlighted ? 600 : 400,
          minWidth: '60px',
          mr: 1.25, // 10px
          flexShrink: 0,
        }}
      >
        {formatTime(cue.start_time)}
      </Typography>

      {/* 字幕文本容器 */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: showTranslation && cue.translation ? 1 : 0, // 8px gap when translation is shown
        }}
      >
        {/* 英文字幕文本（支持单词级高亮和下划线） */}
        <Typography
          variant="body1"
          component="div"
          sx={{
            fontSize: '15px',
            fontWeight: isHighlighted ? 500 : 400,
            lineHeight: 1.5,
          }}
        >
          {renderTextParts.map((part, partIndex) => {
            if (part.type === 'highlight') {
              // 划线文本：显示下划线，同时支持单词级高亮
              const { startWordIndex, endWordIndex } = getWordRangeForTextPart(part);
              const highlightWords = part.content.split(' ').filter(w => w.length > 0);
              
              return (
                <Box
                  key={`highlight-${part.highlightId}-${partIndex}`}
                  component="span"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onHighlightClick) {
                      const highlight = highlights.find(h => h.id === part.highlightId);
                      if (highlight) {
                        onHighlightClick(highlight);
                      }
                    }
                  }}
                  sx={{
                    textDecoration: 'underline',
                    color: part.color,
                    cursor: onHighlightClick ? 'pointer' : 'default',
                    '&:hover': onHighlightClick ? {
                      backgroundColor: 'action.hover',
                    } : {},
                  }}
                >
                  {highlightWords.map((word, wordIndex) => {
                    const globalWordIndex = startWordIndex + wordIndex;
                    const isWordActive = globalWordIndex < activeWordIndex || progress === 1;
                    
                    return (
                      <Box
                        key={`highlight-word-${partIndex}-${wordIndex}`}
                        component="span"
                        sx={{
                          color: isWordActive ? part.color : `${part.color}80`, // 未播放时降低透明度
                          transition: 'color 0.1s linear',
                          display: 'inline-block',
                          mr: 0.5,
                        }}
                      >
                        {word}
                      </Box>
                    );
                  })}
                </Box>
              );
            } else {
              // 普通文本：只支持单词级高亮
              const { startWordIndex, endWordIndex } = getWordRangeForTextPart(part);
              const textWords = part.content.split(' ').filter(w => w.length > 0);
              
              return (
                <React.Fragment key={`text-${partIndex}`}>
                  {textWords.map((word, wordIndex) => {
                    const globalWordIndex = startWordIndex + wordIndex;
                    const isWordActive = globalWordIndex < activeWordIndex || progress === 1;
                    
                    return (
                      <Box
                        component="span"
                        key={`word-${partIndex}-${wordIndex}`}
                        sx={{
                          color: isWordActive ? 'text.primary' : 'text.disabled',
                          transition: 'color 0.1s linear',
                          display: 'inline-block',
                          mr: 0.5,
                        }}
                      >
                        {word}
                      </Box>
                    );
                  })}
                </React.Fragment>
              );
            }
          })}
        </Typography>

        {/* 中文翻译（根据 PRD 6.2.4.a.ii：左对齐，行距8px） */}
        {showTranslation && cue.translation && (
          <Typography
            variant="body2"
            component="div"
            sx={{
              fontSize: '15px',
              color: 'text.secondary',
              fontWeight: 400,
              lineHeight: 1.5,
              whiteSpace: 'normal',
              wordWrap: 'break-word',
            }}
          >
            {cue.translation}
          </Typography>
        )}
      </Box>
    </Box>
  );
});

// 使用 React.memo 优化性能，仅在关键 props 变化时重渲染
// 注意：如果返回 true，表示 props 相等，跳过渲染；返回 false，表示 props 不相等，需要渲染
export default memo(SubtitleRow, (prevProps, nextProps) => {
  // 如果关键属性改变，必须重新渲染
  if (
    prevProps.cue?.id !== nextProps.cue?.id ||
    prevProps.isHighlighted !== nextProps.isHighlighted ||
    prevProps.isPast !== nextProps.isPast ||
    prevProps.showSpeaker !== nextProps.showSpeaker ||
    prevProps.showTranslation !== nextProps.showTranslation ||
    prevProps.cue?.text !== nextProps.cue?.text ||
    prevProps.cue?.translation !== nextProps.cue?.translation ||
    prevProps.cue?.start_time !== nextProps.cue?.start_time ||
    prevProps.cue?.speaker !== nextProps.cue?.speaker
  ) {
    return false; // 需要重新渲染
  }

  // progress 变化时，需要重渲染（用于单词级高亮）
  if (prevProps.progress !== nextProps.progress) {
    return false; // 需要重新渲染
  }

  // highlights 变化时，需要重渲染
  if (prevProps.highlights?.length !== nextProps.highlights?.length) {
    return false; // 需要重新渲染
  }
  
  // 检查 highlights 内容是否变化
  if (prevProps.highlights && nextProps.highlights) {
    const highlightsChanged = prevProps.highlights.some((prevH, index) => {
      const nextH = nextProps.highlights[index];
      return !nextH || 
        prevH.id !== nextH.id ||
        prevH.start_offset !== nextH.start_offset ||
        prevH.end_offset !== nextH.end_offset ||
        prevH.color !== nextH.color;
    });
    if (highlightsChanged) {
      return false; // 需要重新渲染
    }
  }

  // 其他情况，跳过渲染
  return true;
});
