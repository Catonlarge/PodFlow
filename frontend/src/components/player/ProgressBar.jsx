import { Box, Slider, Typography, Stack } from '@mui/material';
import { formatTime, formatTimeWithNegative } from '../../utils/timeUtils';

/**
 * ProgressBar 组件
 * 
 * 音频播放进度条组件，包含完整的拖拽交互逻辑
 * 独立拆分原因：拖拽交互逻辑复杂（鼠标按下、拖拽中、松开、点击跳转、hover显示时间）
 * 
 * @param {Object} props
 * @param {number} props.currentTime - 当前播放时间（秒）
 * @param {number} props.duration - 音频总时长（秒）
 * @param {Function} props.onChange - 进度条变化回调（拖拽过程中）(event, newValue) => void
 * @param {Function} props.onChangeCommitted - 进度条拖拽结束回调 () => void
 * @param {Function} props.onInteraction - 用户交互回调（用于重置收缩定时器）() => void
 */
export default function ProgressBar({ 
  currentTime, 
  duration, 
  onChange, 
  onChangeCommitted,
  onInteraction 
}) {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
      {/* 已播放时间（负号格式） */}
      <Typography 
        variant="body2" 
        sx={{ 
          minWidth: 80,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatTimeWithNegative(currentTime)}
      </Typography>

      {/* 进度条 */}
      <Slider
        aria-label="进度"
        value={currentTime}
        min={0}
        max={duration || 100}
        step={0.1}
        onChange={onChange}
        onChangeCommitted={onChangeCommitted}
        onClick={onInteraction}
        onKeyDown={(e) => {
          // 如果按空格键，不触发滑块操作，让空格键监听器处理
          if (e.code === 'Space') {
            e.preventDefault();
            e.stopPropagation();
            // 空格键监听器会处理播放/暂停
            return;
          }
          // 其他按键正常处理（如方向键）
        }}
        sx={{
          flex: 1,
          color: 'primary.main',
          '& .MuiSlider-thumb': {
            width: 16,
            height: 16,
            '&:hover': {
              boxShadow: '0 0 0 8px rgba(25, 118, 210, 0.16)',
            },
          },
        }}
      />

      {/* 音频总时长 */}
      <Typography 
        variant="body2" 
        sx={{ 
          minWidth: 80,
          textAlign: 'left',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatTime(duration)}
      </Typography>
    </Stack>
  );
}

