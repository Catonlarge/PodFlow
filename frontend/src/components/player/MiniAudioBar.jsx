import { Box } from '@mui/material';

/**
 * MiniAudioBar 组件
 * 
 * 收缩态音频播放器UI：只显示5px高度的进度条线
 * 独立拆分原因：UI结构完全不同（5px进度条线 vs 完整控制条）
 * 
 * @param {Object} props
 * @param {number} props.progressPercent - 播放进度百分比（0-100）
 * @param {Function} props.onClick - 点击展开回调 () => void
 */
export default function MiniAudioBar({ progressPercent, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '5px',
        zIndex: 1000,
        cursor: 'pointer',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          height: '100%',
          width: `${progressPercent}%`,
          bgcolor: 'primary.main',
          transition: 'width 0.1s linear',
        }}
      />
    </Box>
  );
}

