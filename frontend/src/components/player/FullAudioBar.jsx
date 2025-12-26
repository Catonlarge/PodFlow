import { Box, IconButton, Slider, Stack, Button } from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  Replay,
} from '@mui/icons-material';
import ProgressBar from './ProgressBar';

/**
 * FullAudioBar 组件
 * 
 * 展开态音频播放器UI：包含所有按钮、音量、倍速控制
 * 采用逻辑聚合策略：按钮不拆分，直接写在组件内部（因为逻辑简单，只是点击事件）
 * 
 * @param {Object} props
 * @param {Object} props.audioState - 音频状态（来自useAudio hook）
 * @param {Object} props.audioControls - 音频控制方法（来自useAudio hook）
 * @param {Function} props.onInteraction - 用户交互回调（用于重置收缩定时器）() => void
 * @param {Function} props.onMouseEnter - 鼠标进入回调 () => void
 * @param {Function} props.onMouseLeave - 鼠标离开回调 () => void
 */
export default function FullAudioBar({ 
  audioState, 
  audioControls,
  onInteraction,
  onMouseEnter,
  onMouseLeave 
}) {
  const {
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    playbackRate,
  } = audioState;

  const {
    togglePlay,
    rewind,
    forward,
    setPlaybackRate,
    setVolume,
    toggleMute,
    setProgress,
    onProgressChangeCommitted,
    onVolumeChangeCommitted,
  } = audioControls;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        px: 3,
        py: 2,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Stack direction="row" spacing={3} alignItems="center">
        {/* 左侧：音频播放进度条区域 */}
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onChange={setProgress}
          onChangeCommitted={onProgressChangeCommitted}
          onInteraction={onInteraction}
        />

        {/* 右侧：音频控制面板（距离左侧24px） */}
        <Stack 
          direction="row" 
          spacing={1} 
          alignItems="center"
          sx={{ ml: 3 }}
        >
          {/* 前进30s按钮 */}
          <IconButton
            aria-label="前进30秒"
            onClick={rewind}
            size="small"
            sx={{
              '&:hover': {
                bgcolor: 'action.hover',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            <Replay />
          </IconButton>

          {/* 播放/暂停按钮（默认显示暂停图标） */}
          <IconButton
            aria-label={isPlaying ? '暂停' : '播放'}
            onClick={togglePlay}
            color="primary"
            size="medium"
            sx={{
              '&:hover': {
                bgcolor: 'primary.dark',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>

          {/* 后退15s按钮 */}
          <IconButton
            aria-label="后退15秒"
            onClick={forward}
            size="small"
            sx={{
              '&:hover': {
                bgcolor: 'action.hover',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            <Replay sx={{ transform: 'scaleX(-1)' }} />
          </IconButton>

          {/* 播放速度调节按钮 */}
          <Button
            aria-label="播放速度"
            onClick={setPlaybackRate}
            size="small"
            variant="text"
            sx={{
              width: 60, // 固定宽度，确保所有倍速档位（1X、1.25X、1.5X、0.75X）显示时宽度一致
              minWidth: 60,
              maxWidth: 60,
              '&:hover': {
                bgcolor: 'action.hover',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            {playbackRate}X
          </Button>

          {/* 音量调节条 */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 150 }}>
            <IconButton
              aria-label={isMuted ? '静音' : '音量'}
              onClick={toggleMute}
              size="small"
              sx={{
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                '&:active': {
                  transform: 'scale(0.95)',
                },
              }}
            >
              {isMuted || volume === 0 ? <VolumeOff /> : <VolumeUp />}
            </IconButton>

            {/* 音量滑块：始终显示，用户可直接拖动来解除静音并调整音量 */}
            <Slider
              aria-label="音量"
              value={volume}
              min={0}
              max={1}
              step={0.01}
              onChange={setVolume}
              onChangeCommitted={onVolumeChangeCommitted}
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
                color: 'primary.main',
                width: 100,
                // 静音时降低透明度，但保持可见，让用户知道可以拖动来恢复音量
                opacity: isMuted || volume === 0 ? 0.5 : 1,
                '& .MuiSlider-thumb': {
                  width: 12,
                  height: 12,
                },
              }}
            />
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}

