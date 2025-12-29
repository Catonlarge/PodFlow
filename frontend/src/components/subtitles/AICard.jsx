/**
 * AICard 组件
 * 
 * 功能描述：
 * - 显示AI查询结果卡片
 * - 独立数据流，不依赖其他组件状态
 * - 支持流式输出显示
 * - 支持智能定位、添加到笔记等操作
 * 
 * 相关PRD：
 * - PRD 6.2.4.e: 用户点击"查询"
 * 
 * @module components/subtitles/AICard
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Portal,
} from '@mui/material';
import { CheckCircle, Note as NoteIcon } from '@mui/icons-material';

/**
 * AICard 组件
 * 
 * @param {Object} props
 * @param {Object} props.anchorPosition - 划线源的位置信息（包含 top, left, right, bottom，或 x, y）
 * @param {React.RefObject} [props.anchorElementRef] - 划线源 DOM 元素引用（可选，用于 IntersectionObserver 检测滚动消失）
 * @param {string} props.queryText - 用户查询的文本（划线内容）
 * @param {Object} props.responseData - AI 返回的结构化数据
 * @param {string} props.responseData.type - 类型：'word' | 'phrase' | 'sentence'
 * @param {Object} props.responseData.content - 内容对象
 * @param {boolean} props.isLoading - 是否正在加载（显示 loading 状态）
 * @param {Function} props.onAddToNote - 添加到笔记回调 (responseData, queryId) => void
 * @param {Function} props.onClose - 关闭卡片回调 () => void
 * @param {number} [props.queryId] - 查询 ID（可选，用于添加到笔记时传递）
 */
export default function AICard({
  anchorPosition,
  anchorElementRef,
  queryText,
  responseData,
  isLoading,
  onAddToNote,
  onClose,
  queryId,
}) {
  const cardRef = useRef(null);
  const [cardPosition, setCardPosition] = useState({ top: 0, left: 0 });

  /**
   * 计算卡片位置
   */
  const calculateCardPosition = useCallback((anchorPos) => {
    if (!anchorPos) {
      return { top: 0, left: 0 };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = 420;
    const offset = 10; // 10px 间距

    // 处理 anchorPosition 格式（可能是 {top, left, right, bottom} 或 {x, y}）
    let anchorTop, anchorLeft, anchorRight, anchorBottom;
    
    if ('top' in anchorPos && 'left' in anchorPos) {
      anchorTop = anchorPos.top;
      anchorLeft = anchorPos.left;
      anchorRight = anchorPos.right || anchorPos.left + 100; // 默认宽度
      anchorBottom = anchorPos.bottom || anchorPos.top + 50; // 默认高度
    } else if ('x' in anchorPos && 'y' in anchorPos) {
      // 兼容 {x, y} 格式（从 SelectionMenu 传入）
      anchorTop = anchorPos.y - 25; // 估算高度
      anchorBottom = anchorPos.y + 25;
      anchorLeft = anchorPos.x - 50; // 估算宽度
      anchorRight = anchorPos.x + 50;
    } else {
      return { top: 0, left: 0 };
    }

    // 计算锚点中心
    const anchorCenterX = anchorLeft + (anchorRight - anchorLeft) / 2;
    const anchorCenterY = anchorTop + (anchorBottom - anchorTop) / 2;

    // 垂直方向定位
    let top;
    const isUpperHalf = anchorCenterY < viewportHeight / 2;
    
    if (isUpperHalf) {
      // 划线位置在屏幕上半部分，卡片显示在下方
      top = anchorBottom + offset;
    } else {
      // 划线位置在屏幕下半部分，卡片显示在上方（需要估算卡片高度）
      const estimatedCardHeight = 200; // 估算初始高度
      top = anchorTop - estimatedCardHeight - offset;
      // 如果上方空间不够，调整为下方
      if (top < 0) {
        top = anchorBottom + offset;
      }
    }

    // 水平方向定位（与划线源中心对齐）
    let left = anchorCenterX - cardWidth / 2;

    // 检查屏幕边界
    if (left < offset) {
      left = offset; // 左边不够用，往右挪动
    } else if (left + cardWidth > viewportWidth - offset) {
      left = viewportWidth - cardWidth - offset; // 右边不够用，往左挪动
    }

    return { top, left };
  }, []);

  /**
   * 更新卡片位置
   */
  useEffect(() => {
    if (!anchorPosition) return;

    const updatePosition = () => {
      const position = calculateCardPosition(anchorPosition);
      setCardPosition(position);
    };

    // 使用 requestAnimationFrame 确保 DOM 已经渲染
    if (cardRef.current) {
      updatePosition();
    } else {
      requestAnimationFrame(updatePosition);
    }

    // 监听窗口大小变化
    const handleResize = () => {
      updatePosition();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [anchorPosition, calculateCardPosition]);


  /**
   * 点击外部区域关闭
   */
  useEffect(() => {
    if (!anchorPosition) return;

    const handleClickOutside = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        onClose();
      }
    };

    // 使用 mousedown 而不是 click，避免与按钮点击冲突
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [anchorPosition, onClose]);

  /**
   * 滚动划线源到屏幕外消失（使用 IntersectionObserver）
   */
  useEffect(() => {
    if (!anchorElementRef || !anchorElementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) {
          onClose();
        }
      },
      { threshold: 0 }
    );

    observer.observe(anchorElementRef.current);
    return () => observer.disconnect();
  }, [anchorElementRef, onClose]);

  /**
   * 处理添加到笔记
   * 注意：添加到笔记后不应该调用 onClose，因为 onClose 会删除 highlight
   * 应该由 handleAddToNote 内部关闭 AICard，但不触发 handleCloseAICard
   */
  const handleAddToNote = useCallback(() => {
    if (onAddToNote && responseData) {
      onAddToNote(responseData, queryId);
      // 注意：添加到笔记后不应该调用 onClose，因为 onClose 会删除 highlight
      // handleAddToNote 内部会关闭 AICard，所以这里不需要调用 onClose
    }
  }, [onAddToNote, responseData, queryId]);

  /**
   * 渲染内容（根据 type 类型）
   */
  const renderContent = useCallback(() => {
    // 错误状态：显示错误提示
    if (isLoading === false && !responseData) {
      return (
        <Typography variant="body2" color="error" sx={{ textAlign: 'center', py: 2 }}>
          AI查询失败
        </Typography>
      );
    }

    if (!responseData || !responseData.content) {
      return null;
    }

    const { type, content } = responseData;

    if (type === 'word' || type === 'phrase') {
      return (
        <Box>
          {content.phonetic && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              发音：{content.phonetic}
            </Typography>
          )}
          {content.definition && (
            <Typography variant="body1" sx={{ mb: 1, fontWeight: 'medium' }}>
              {content.definition}
            </Typography>
          )}
          {content.explanation && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {content.explanation}
            </Typography>
          )}
        </Box>
      );
    } else if (type === 'sentence') {
      return (
        <Box>
          {content.translation && (
            <Typography variant="body1" sx={{ mb: 2, fontWeight: 'medium' }}>
              {content.translation}
            </Typography>
          )}
          {content.highlight_vocabulary && content.highlight_vocabulary.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                难点词汇：
              </Typography>
              {content.highlight_vocabulary.map((vocab, index) => (
                <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                  <strong>{vocab.term}</strong>: {vocab.definition}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      );
    }

    return null;
  }, [responseData]);

  // 如果 anchorPosition 为 null，不渲染
  if (!anchorPosition) {
    return null;
  }

  return (
    <Portal>
      <Card
        ref={cardRef}
        data-testid="ai-card"
        sx={{
          position: 'fixed',
          top: `${cardPosition.top}px`,
          left: `${cardPosition.left}px`,
          width: '420px',
          minHeight: '40px',
          maxHeight: '50vh',
          zIndex: 1400, // 比 SelectionMenu 更高（1300）
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 3,
        }}
      >
        {/* 标题栏（固定） */}
        <CardHeader
          avatar={
            isLoading ? (
              <CircularProgress size={24} data-testid="ai-card-loading" />
            ) : (
              <CheckCircle
                data-testid="ai-card-complete-icon"
                sx={{
                  color: 'success.main',
                  fontSize: 28,
                }}
              />
            )
          }
          title={
            <Typography variant="h6" component="div">
              AI查询
            </Typography>
          }
          action={
            !isLoading && responseData && (
              <IconButton
                aria-label="添加到笔记"
                onClick={handleAddToNote}
                sx={{
                  color: 'grey.600',
                  '&:hover': {
                    backgroundColor: 'grey.100',
                  },
                  '&:active': {
                    backgroundColor: 'grey.200',
                  },
                }}
              >
                <NoteIcon />
              </IconButton>
            )
          }
          sx={{
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
            zIndex: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 1,
          }}
        />

        {/* 内容区域（可滚动） */}
        <CardContent
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            maxHeight: 'calc(50vh - 64px)', // 减去标题栏高度
            py: 1.5,
            '&:last-child': {
              pb: 1.5,
            },
          }}
        >
          {isLoading ? (
            <Typography variant="body2" color="text.secondary">
              正在查询中...
            </Typography>
          ) : (
            renderContent()
          )}
        </CardContent>
      </Card>
    </Portal>
  );
}
