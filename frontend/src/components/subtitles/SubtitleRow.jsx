import React, { memo, forwardRef, useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
 * @param {boolean} [props.isSelected] - 当前 cue 是否被选中（用于文本选择视觉反馈）
 * @param {Object|null} [props.selectionRange] - 选择范围信息 { cue, startOffset, endOffset, selectedText }
 */
const SubtitleRow = forwardRef(function SubtitleRow({
  cue,
  index,
  isHighlighted,
  onClick,
  showSpeaker = false,
  showTranslation = false,
  progress = 0,
  highlights = [],
  onHighlightClick,
  isSelected = false,
  selectionRange = null,
}, ref) {
  const [isHovered, setIsHovered] = useState(false);
  
  // 用于区分点击和拖拽选择
  const mouseDownPositionRef = useRef(null);
  const isDraggingRef = useRef(false);

  // 当字幕失去高亮时，清除 hover 状态，避免灰色背景残留
  // 使用 ref 来避免在 effect 中同步调用 setState
  const prevIsHighlightedRef = useRef(isHighlighted);
  
  useEffect(() => {
    if (!isHighlighted && prevIsHighlightedRef.current && isHovered) {
      // 使用 setTimeout 将 setState 调用推迟到下一个事件循环
      setTimeout(() => {
        setIsHovered(false);
      }, 0);
    }
    prevIsHighlightedRef.current = isHighlighted;
  }, [isHighlighted, isHovered]);

  // 将句子拆分为单词数组（使用 useMemo 避免每次渲染都 split）
  const words = useMemo(() => {
    if (!cue || !cue.text) return [];
    return cue.text.split(' ');
  }, [cue]);

  // 计算当前应该高亮到第几个单词
  // 假设匀速：总单词数 * 进度百分比 = 当前高亮单词的索引
  const activeWordIndex = Math.floor(words.length * progress);

  /**
   * 渲染带下划线的文本片段
   * 根据 highlights 数组，在文本对应位置渲染紫色下划线
   * 同时支持单词级高亮和选择状态高亮
   */
  const renderTextParts = useMemo(() => {
    if (!cue || !cue.text) {
      return [];
    }

    // 如果没有 highlights 和选择范围，返回单个文本片段
    if ((!highlights || highlights.length === 0) && !selectionRange) {
      return [{
        type: 'text',
        content: cue.text,
        startCharIndex: 0,
        endCharIndex: cue.text.length,
      }];
    }

    // 合并 highlights 和选择范围，统一处理
    const allRanges = [];
    
    // 添加 highlights
    if (highlights && highlights.length > 0) {
      highlights.forEach((highlight) => {
        allRanges.push({
          type: 'highlight',
          start_offset: highlight.start_offset,
          end_offset: highlight.end_offset,
          highlighted_text: highlight.highlighted_text,
          color: highlight.color || '#9C27B0',
          id: highlight.id,
        });
      });
    }
    
    // 添加选择范围（如果存在）
    if (selectionRange) {
      allRanges.push({
        type: 'selection',
        start_offset: selectionRange.startOffset,
        end_offset: selectionRange.endOffset,
        selectedText: selectionRange.selectedText,
      });
    }
    
    // 按 start_offset 排序所有范围
    const sortedRanges = allRanges.sort((a, b) => a.start_offset - b.start_offset);
    
    // 过滤重叠的范围（PRD 要求：禁止重叠划线）
    // 如果两个范围重叠，只保留第一个（按 start_offset 排序后的第一个）
    const nonOverlappingRanges = [];
    let lastEndIndex = -1;
    
    sortedRanges.forEach((range) => {
      const { start_offset, end_offset } = range;
      
      // 检查是否与已处理的范围重叠
      if (start_offset >= lastEndIndex) {
        // 不重叠，添加到列表
        nonOverlappingRanges.push(range);
        lastEndIndex = Math.max(lastEndIndex, end_offset);
      }
      // 如果重叠，跳过这个范围（符合 PRD "禁止重叠划线" 的要求）
    });
    
    const parts = [];
    let lastIndex = 0;

    nonOverlappingRanges.forEach((range) => {
      const { start_offset, end_offset, type } = range;
      
      // 添加范围前的文本
      if (start_offset > lastIndex) {
        parts.push({
          type: 'text',
          content: cue.text.substring(lastIndex, start_offset),
          startCharIndex: lastIndex,
          endCharIndex: start_offset,
        });
      }

      // 添加范围文本（highlight 或 selection）
      if (type === 'highlight') {
        parts.push({
          type: 'highlight',
          content: range.highlighted_text || cue.text.substring(start_offset, end_offset),
          color: range.color,
          highlightId: range.id,
          startCharIndex: start_offset,
          endCharIndex: end_offset,
        });
      } else if (type === 'selection') {
        // 对于选择范围，直接使用原始文本内容，不使用 trim 后的 selectedText
        // 这样可以确保所有选中的单词都被正确高亮
        parts.push({
          type: 'selection',
          content: cue.text.substring(start_offset, end_offset),
          startCharIndex: start_offset,
          endCharIndex: end_offset,
        });
      }

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
  }, [cue, highlights, selectionRange]);

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
  }, [cue]);

  if (!cue) {
    return null;
  }

  // 处理鼠标按下事件
  const handleMouseDown = useCallback((e) => {
    // 记录鼠标按下位置
    mouseDownPositionRef.current = {
      x: e.clientX,
      y: e.clientY,
    };
    isDraggingRef.current = false;
  }, []);

  // 处理鼠标移动事件（用于检测拖拽）
  const handleMouseMove = useCallback((e) => {
    if (mouseDownPositionRef.current) {
      const deltaX = Math.abs(e.clientX - mouseDownPositionRef.current.x);
      const deltaY = Math.abs(e.clientY - mouseDownPositionRef.current.y);
      // 如果移动距离超过5px，认为是拖拽
      if (deltaX > 5 || deltaY > 5) {
        isDraggingRef.current = true;
      }
    }
  }, []);

  // 处理鼠标抬起事件
  const handleMouseUp = useCallback((e) => {
    if (mouseDownPositionRef.current) {
      const deltaX = Math.abs(e.clientX - mouseDownPositionRef.current.x);
      const deltaY = Math.abs(e.clientY - mouseDownPositionRef.current.y);
      const isClick = deltaX <= 5 && deltaY <= 5 && !isDraggingRef.current;
      
      // 如果是点击（没有拖拽），且没有文本被选中，则触发音频定位
      if (isClick && !window.getSelection()?.toString().trim()) {
        if (onClick) {
          onClick(cue.start_time);
        }
      }
      
      // 重置状态
      mouseDownPositionRef.current = null;
      isDraggingRef.current = false;
    }
  }, [onClick, cue.start_time]);

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
  // 根据高亮状态、hover 状态和选择状态确定背景色
  // 优先级：选中状态 > 高亮状态 > hover 状态
  const backgroundColor = isSelected
    ? 'action.selected'
    : isHighlighted 
      ? 'background.default' 
      : isHovered 
        ? 'action.hover' 
        : 'background.default';

  return (
    <Box
      ref={ref}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
        transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, width 0.2s ease-in-out, max-width 0.2s ease-in-out', // 精确控制过渡属性，包括宽度
        boxSizing: 'border-box',
        maxWidth: '100%',
        width: '100%',
        overflow: 'hidden', // 防止内容超出容器
        willChange: 'width, max-width', // 优化性能
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
          minWidth: 0, // 关键：防止 flex 子元素超出容器（flex 布局的常见问题）
          display: 'flex',
          flexDirection: 'column',
          gap: showTranslation && cue.translation ? 1 : 0, // 8px gap when translation is shown
          overflow: 'hidden', // 防止内容超出
          transition: 'flex 0.2s ease-in-out', // 添加过渡动画
          willChange: 'flex', // 优化性能
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
            wordWrap: 'break-word', // 确保长单词可以换行
            overflowWrap: 'break-word', // 现代浏览器的换行属性
            maxWidth: '100%', // 确保不超出容器
          }}
        >
          {renderTextParts.map((part, partIndex) => {
            
            if (part.type === 'highlight') {
              // 划线文本：显示下划线，同时支持单词级高亮
              // 关键：保留所有空格，同时支持单词级高亮
              const originalContent = part.content;
              const { startWordIndex } = getWordRangeForTextPart(part);
              
              // 将文本按单词和空格拆分，保留所有空格
              // 使用正则表达式匹配单词和空格，保留所有字符
              const tokens = [];
              let currentIndex = 0;
              const wordRegex = /\S+/g; // 匹配非空白字符（单词）
              let match;
              
              while ((match = wordRegex.exec(originalContent)) !== null) {
                // 添加单词前的空格
                if (match.index > currentIndex) {
                  tokens.push({
                    type: 'space',
                    content: originalContent.substring(currentIndex, match.index),
                  });
                }
                // 添加单词
                tokens.push({
                  type: 'word',
                  content: match[0],
                  wordIndex: tokens.filter(t => t.type === 'word').length,
                });
                currentIndex = match.index + match[0].length;
              }
              // 添加最后的空格
              if (currentIndex < originalContent.length) {
                tokens.push({
                  type: 'space',
                  content: originalContent.substring(currentIndex),
                });
              }
              
              return (
                <React.Fragment key={`highlight-${part.highlightId}-${partIndex}`}>
                  <Box
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
                      display: 'inline',
                      whiteSpace: 'pre-wrap', // 保留空格和换行
                    }}
                  >
                    {tokens.map((token, tokenIndex) => {
                      if (token.type === 'space') {
                        // 空格：直接渲染，保留所有空格
                        return (
                          <React.Fragment key={`space-${partIndex}-${tokenIndex}`}>
                            {token.content}
                          </React.Fragment>
                        );
                      } else {
                        // 单词：支持单词级高亮
                        const globalWordIndex = startWordIndex + token.wordIndex;
                        const isWordActive = globalWordIndex < activeWordIndex || progress === 1;
                        
                        return (
                          <Box
                            key={`word-${partIndex}-${tokenIndex}`}
                            component="span"
                            sx={{
                              color: isWordActive ? part.color : `${part.color}80`, // 未播放时降低透明度
                              transition: 'color 0.1s linear',
                              display: 'inline',
                            }}
                          >
                            {token.content}
                          </Box>
                        );
                      }
                    })}
                  </Box>
                </React.Fragment>
              );
            } else if (part.type === 'selection') {
              // 选中文本：显示背景色高亮（用于文本选择视觉反馈）
              // 直接使用原始文本内容，完全保留所有空格（包括多个连续空格）
              const originalContent = part.content;
              
              return (
                <React.Fragment key={`selection-${partIndex}`}>
                  <Box
                    component="span"
                    sx={{
                      backgroundColor: 'action.selected',
                      color: 'text.primary',
                      display: 'inline',
                      whiteSpace: 'pre-wrap', // 保留空格和换行
                    }}
                  >
                    {originalContent}
                  </Box>
                </React.Fragment>
              );
            } else {
              // 普通文本：只支持单词级高亮
              // 对于普通文本，直接使用原始内容，保留原始空格
              const { startWordIndex } = getWordRangeForTextPart(part);
              // 使用原始内容，但需要拆分单词用于高亮
              // 保留原始空格：如果 content 开头或结尾有空格，需要保留
              const leadingSpace = part.content.match(/^\s*/)?.[0] || '';
              const trailingSpace = part.content.match(/\s*$/)?.[0] || '';
              const trimmedContent = part.content.trim();
              const textWords = trimmedContent.split(/\s+/).filter(w => w.length > 0);
              
              return (
                <React.Fragment key={`text-${partIndex}`}>
                  {leadingSpace}
                  {textWords.map((word, wordIndex) => {
                    const globalWordIndex = startWordIndex + wordIndex;
                    const isWordActive = globalWordIndex < activeWordIndex || progress === 1;
                    const isLastWord = wordIndex === textWords.length - 1;
                    
                    return (
                      <React.Fragment key={`word-${partIndex}-${wordIndex}`}>
                        <Box
                          component="span"
                          sx={{
                            color: isWordActive ? 'text.primary' : 'text.disabled',
                            transition: 'color 0.1s linear',
                            display: 'inline',
                          }}
                        >
                          {word}
                        </Box>
                        {!isLastWord && ' '}
                      </React.Fragment>
                    );
                  })}
                  {trailingSpace}
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

  // 选择状态变化时，需要重渲染
  if (prevProps.isSelected !== nextProps.isSelected) {
    return false; // 需要重新渲染
  }

  // 选择范围变化时，需要重渲染
  if (prevProps.selectionRange !== nextProps.selectionRange) {
    if (prevProps.selectionRange && nextProps.selectionRange) {
      // 检查选择范围内容是否变化
      if (
        prevProps.selectionRange.startOffset !== nextProps.selectionRange.startOffset ||
        prevProps.selectionRange.endOffset !== nextProps.selectionRange.endOffset ||
        prevProps.selectionRange.selectedText !== nextProps.selectionRange.selectedText
      ) {
        return false; // 需要重新渲染
      }
    } else {
      // 一个为 null，另一个不为 null，需要重渲染
      return false;
    }
  }

  // 其他情况，跳过渲染
  return true;
});
