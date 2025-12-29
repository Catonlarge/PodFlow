import React, { memo, forwardRef, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '@mui/material/styles'; // 引入 hook 获取主题变量
import { formatTime } from '../../utils/timeUtils';

/**
 * SubtitleRow 组件 (极致性能 + 主题适配版)
 * * 修改要点：
 * 1. 【性能】使用原生 div/span + 内联 style，彻底解决 Emotion 引擎在高频刷新下的性能瓶颈。
 * 2. 【逻辑】完整保留所有业务逻辑（拖拽、点击跳转、划线点击、单词高亮）。
 * 3. 【主题】使用 useTheme() 获取颜色，确保支持 Dark Mode 和全局主题色。
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
  const theme = useTheme(); // 获取当前主题变量
  const [isHovered, setIsHovered] = useState(false);
  
  // 提取主题色，避免在渲染循环中重复查找，提升性能
  // 这样既保留了原生标签的高性能，又不会丢失 MUI 的主题能力
  const colors = useMemo(() => ({
    primaryMain: theme.palette.primary.main,
    textSecondary: theme.palette.text.secondary,
    textPrimary: theme.palette.text.primary,
    textDisabled: theme.palette.text.disabled,
    actionSelected: theme.palette.action.selected,
    actionHover: theme.palette.action.hover,
    bgDefault: theme.palette.background.default,
    divider: theme.palette.divider,
  }), [theme]);

  // --- 业务逻辑：区分点击和拖拽 ---
  const mouseDownPositionRef = useRef(null);
  const isDraggingRef = useRef(false);

  // --- 业务逻辑：高亮状态管理 ---
  const prevIsHighlightedRef = useRef(isHighlighted);
  useEffect(() => {
    if (!isHighlighted && prevIsHighlightedRef.current && isHovered) {
      setTimeout(() => setIsHovered(false), 0);
    }
    prevIsHighlightedRef.current = isHighlighted;
  }, [isHighlighted, isHovered]);

  // --- 业务逻辑：单词拆分 ---
  const words = useMemo(() => {
    if (!cue || !cue.text) return [];
    return cue.text.split(' ');
  }, [cue]);

  const activeWordIndex = Math.floor(words.length * progress);

  // --- 业务逻辑：Token 预处理 ---
  const tokenizeContent = useCallback((content, startWordIndex) => {
    const tokens = [];
    let currentIndex = 0;
    const wordRegex = /\S+/g;
    let match;
    let localWordIndex = 0;
    
    while ((match = wordRegex.exec(content)) !== null) {
      if (match.index > currentIndex) {
        tokens.push({
          type: 'space',
          content: content.substring(currentIndex, match.index),
          key: `sp-${currentIndex}`
        });
      }
      tokens.push({
        type: 'word',
        content: match[0],
        wordIndex: localWordIndex,
        globalWordIndex: startWordIndex + localWordIndex,
        key: `wd-${localWordIndex}`
      });
      localWordIndex++;
      currentIndex = match.index + match[0].length;
    }
    if (currentIndex < content.length) {
      tokens.push({
        type: 'space',
        content: content.substring(currentIndex),
        key: `sp-end`
      });
    }
    return tokens;
  }, []);

  const getWordRangeForTextPart = useCallback((partStartCharIndex, partContent) => {
    if (!cue || !cue.text) return { startWordIndex: 0 };
    const textBeforePart = cue.text.substring(0, partStartCharIndex);
    const wordsBefore = textBeforePart.split(' ').filter(w => w.length > 0);
    return { startWordIndex: wordsBefore.length };
  }, [cue]);

  // --- 业务逻辑：渲染片段预计算 (Memoized) ---
  const processedRenderParts = useMemo(() => {
    if (!cue || !cue.text) return [];

    const allRanges = [];
    if (highlights && highlights.length > 0) {
      highlights.forEach((h) => {
        allRanges.push({
          type: 'highlight',
          start: h.start_offset,
          end: h.end_offset,
          data: h,
          color: h.color || '#9C27B0'
        });
      });
    }
    if (selectionRange) {
      allRanges.push({
        type: 'selection',
        start: selectionRange.startOffset,
        end: selectionRange.endOffset,
        data: selectionRange
      });
    }
    
    const sortedRanges = allRanges.sort((a, b) => a.start - b.start);
    const nonOverlappingRanges = [];
    let lastEndIndex = -1;
    
    sortedRanges.forEach((range) => {
      if (range.start >= lastEndIndex) {
        nonOverlappingRanges.push(range);
        lastEndIndex = Math.max(lastEndIndex, range.end);
      }
    });

    const parts = [];
    let cursor = 0;

    nonOverlappingRanges.forEach((range, i) => {
      if (range.start > cursor) {
        const textContent = cue.text.substring(cursor, range.start);
        const { startWordIndex } = getWordRangeForTextPart(cursor, textContent);
        parts.push({
          type: 'text',
          content: textContent,
          tokens: tokenizeContent(textContent, startWordIndex),
          key: `text-pre-${i}`
        });
      }

      const rangeContent = cue.text.substring(range.start, range.end);
      if (range.type === 'highlight') {
        const { startWordIndex } = getWordRangeForTextPart(range.start, rangeContent);
        parts.push({
          type: 'highlight',
          content: rangeContent,
          tokens: tokenizeContent(rangeContent, startWordIndex),
          highlightId: range.data.id,
          color: range.color,
          key: `hl-${range.data.id}-${i}`
        });
      } else if (range.type === 'selection') {
        parts.push({
          type: 'selection',
          content: rangeContent,
          key: `sel-${i}`
        });
      }
      cursor = range.end;
    });

    if (cursor < cue.text.length) {
      const textContent = cue.text.substring(cursor);
      const { startWordIndex } = getWordRangeForTextPart(cursor, textContent);
      parts.push({
        type: 'text',
        content: textContent,
        tokens: tokenizeContent(textContent, startWordIndex),
        key: `text-end`
      });
    }

    return parts;
  }, [cue, highlights, selectionRange, getWordRangeForTextPart, tokenizeContent]);

  if (!cue) return null;

  // --- 事件处理函数 (保持不变) ---
  const handleMouseDown = useCallback((e) => {
    mouseDownPositionRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (mouseDownPositionRef.current) {
      const deltaX = Math.abs(e.clientX - mouseDownPositionRef.current.x);
      const deltaY = Math.abs(e.clientY - mouseDownPositionRef.current.y);
      if (deltaX > 5 || deltaY > 5) isDraggingRef.current = true;
    }
  }, []);

  const handleMouseUp = useCallback((e) => {
    if (mouseDownPositionRef.current) {
      const deltaX = Math.abs(e.clientX - mouseDownPositionRef.current.x);
      const deltaY = Math.abs(e.clientY - mouseDownPositionRef.current.y);
      const isClick = deltaX <= 5 && deltaY <= 5 && !isDraggingRef.current;
      
      if (isClick && !window.getSelection()?.toString().trim()) {
        if (onClick) onClick(cue.start_time);
      }
      mouseDownPositionRef.current = null;
      isDraggingRef.current = false;
    }
  }, [onClick, cue.start_time]);

  // --- 渲染部分 ---

  if (showSpeaker) {
    // Speaker 也可以用原生 div 优化，虽然它更新不频繁，为了统一风格也改了
    return (
      <div style={{ padding: '24px 8px' }}>
        <span style={{ 
          fontSize: '15px', 
          color: colors.textSecondary, 
          fontWeight: 500,
          fontFamily: theme.typography.fontFamily // 使用主题字体
        }}>
          {cue.speaker}：
        </span>
      </div>
    );
  }

  // 动态计算背景色和边框
  const backgroundColor = isSelected ? colors.actionSelected
    : isHighlighted ? colors.bgDefault
    : isHovered ? colors.actionHover
    : colors.bgDefault;

  const borderColor = isHighlighted ? colors.primaryMain : 'transparent';

  // 通用的文本样式
  const commonTextStyle = {
    fontFamily: theme.typography.fontFamily, // 继承全局字体
    fontSize: '1rem',
    lineHeight: 1.5
  };

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => !isHighlighted && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-subtitle-id={cue.id}
      data-subtitle-index={index}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '24px 8px',
        marginBottom: 0,
        cursor: 'pointer',
        backgroundColor: backgroundColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '4px', // theme.shape.borderRadius 通常是 4px
        transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out',
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}
    >
      {/* 时间标签 */}
      <span
        style={{
          ...commonTextStyle,
          fontSize: '15px',
          color: isHighlighted ? colors.primaryMain : colors.textSecondary,
          fontWeight: isHighlighted ? 600 : 400,
          minWidth: '60px',
          marginRight: '10px',
          flexShrink: 0,
        }}
      >
        {formatTime(cue.start_time)}
      </span>

      {/* 文本容器 */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: (showTranslation && cue.translation) ? '8px' : 0,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            ...commonTextStyle,
            fontWeight: isHighlighted ? 500 : 400,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            maxWidth: '100%',
            color: colors.textPrimary
          }}
        >
          {processedRenderParts.map((part) => {
            // 1. 划线部分
            if (part.type === 'highlight') {
              return (
                <span
                  key={part.key}
                  data-highlight-id={part.highlightId}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onHighlightClick) {
                      const highlight = highlights.find(h => h.id === part.highlightId);
                      if (highlight) onHighlightClick(highlight);
                    }
                  }}
                  style={{
                    textDecoration: 'underline',
                    color: part.color,
                    cursor: onHighlightClick ? 'pointer' : 'default',
                    display: 'inline',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {part.tokens.map((token) => {
                    if (token.type === 'space') return <span key={token.key}>{token.content}</span>;
                    
                    const isWordActive = token.globalWordIndex < activeWordIndex || progress === 1;
                    return (
                      <span
                        key={token.key}
                        style={{
                          color: isWordActive ? part.color : `${part.color}80`, // 透明度处理
                          transition: 'color 0.1s linear',
                          display: 'inline'
                        }}
                      >
                        {token.content}
                      </span>
                    );
                  })}
                </span>
              );
            } 
            // 2. 选中部分
            else if (part.type === 'selection') {
              return (
                <span
                  key={part.key}
                  style={{
                    backgroundColor: colors.actionSelected,
                    color: colors.textPrimary,
                    display: 'inline',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {part.content}
                </span>
              );
            } 
            // 3. 普通文本
            else {
              return (
                <React.Fragment key={part.key}>
                  {part.tokens.map((token) => {
                    if (token.type === 'space') return <span key={token.key}>{token.content}</span>;
                    
                    const isWordActive = token.globalWordIndex < activeWordIndex || progress === 1;
                    return (
                      <span
                        key={token.key}
                        style={{
                          color: isWordActive ? colors.textPrimary : colors.textDisabled,
                          transition: 'color 0.1s linear',
                          display: 'inline'
                        }}
                      >
                        {token.content}
                      </span>
                    );
                  })}
                </React.Fragment>
              );
            }
          })}
        </div>

        {/* 翻译 */}
        {showTranslation && cue.translation && (
          <div
            style={{
              ...commonTextStyle,
              fontSize: '15px',
              color: colors.textSecondary,
              fontWeight: 400,
              whiteSpace: 'normal',
              wordWrap: 'break-word'
            }}
          >
            {cue.translation}
          </div>
        )}
      </div>
    </div>
  );
});

// Memo 比较逻辑，保持完全一致
export default memo(SubtitleRow, (prevProps, nextProps) => {
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
  ) return false;

  if (prevProps.progress !== nextProps.progress) return false;
  if (prevProps.highlights?.length !== nextProps.highlights?.length) return false;
  
  if (prevProps.highlights && nextProps.highlights) {
    const highlightsChanged = prevProps.highlights.some((prevH, index) => {
      const nextH = nextProps.highlights[index];
      return !nextH || prevH.id !== nextH.id || prevH.start_offset !== nextH.start_offset || prevH.end_offset !== nextH.end_offset || prevH.color !== nextH.color;
    });
    if (highlightsChanged) return false;
  }

  if (prevProps.isSelected !== nextProps.isSelected) return false;

  if (prevProps.selectionRange !== nextProps.selectionRange) {
    if (prevProps.selectionRange && nextProps.selectionRange) {
      if (
        prevProps.selectionRange.startOffset !== nextProps.selectionRange.startOffset ||
        prevProps.selectionRange.endOffset !== nextProps.selectionRange.endOffset ||
        prevProps.selectionRange.selectedText !== nextProps.selectionRange.selectedText
      ) return false;
    } else {
      return false;
    }
  }

  return true;
});