import React, { memo, forwardRef } from 'react';
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
 * @param {Object} props.cue - 字幕数据 { id, start_time, end_time, speaker, text }
 * @param {number} props.index - 字幕索引（用于排序）
 * @param {boolean} props.isHighlighted - 是否高亮（当前播放）
 * @param {boolean} props.isPast - 是否已播放过
 * @param {Function} [props.onClick] - 点击回调函数 (startTime) => void
 * @param {boolean} [props.showSpeaker] - 是否显示 speaker 标签
 */
const SubtitleRow = forwardRef(function SubtitleRow({
  cue,
  index,
  isHighlighted,
  isPast,
  onClick,
  showSpeaker = false,
}, ref) {
  if (!cue) {
    return null;
  }

  const handleClick = () => {
    if (onClick) {
      onClick(cue.start_time);
    }
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
  return (
    <Box
      ref={ref}
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        px: 1,
        py: 3,
        mb: 0,
        cursor: 'pointer',
        backgroundColor: 'background.default',
        border: isHighlighted ? '2px solid' : '2px solid transparent',
        borderColor: isHighlighted ? 'primary.main' : 'transparent',
        borderRadius: 1,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          backgroundColor: 'action.hover',
        },
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

      {/* 字幕文本 */}
      <Typography
        variant="body1"
        component="div"
        sx={{
          fontSize: '15px',
          color: isHighlighted ? 'text.primary' : 'text.secondary',
          fontWeight: isHighlighted ? 500 : 400,
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {cue.text}
      </Typography>
    </Box>
  );
});

// 使用 React.memo 优化性能，仅在关键 props 变化时重渲染
export default memo(SubtitleRow, (prevProps, nextProps) => {
  return (
    prevProps.cue?.id === nextProps.cue?.id &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.isPast === nextProps.isPast &&
    prevProps.showSpeaker === nextProps.showSpeaker &&
    prevProps.cue?.text === nextProps.cue?.text &&
    prevProps.cue?.start_time === nextProps.cue?.start_time &&
    prevProps.cue?.speaker === nextProps.cue?.speaker
  );
});
