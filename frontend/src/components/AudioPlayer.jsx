import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  IconButton,
  Slider,
  Typography,
  Stack,
  Button,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  Replay,
} from '@mui/icons-material';
import { formatTime, formatTimeWithNegative } from '../utils/timeUtils';

/**
 * AudioPlayer 组件
 * 
 * 根据 PRD 6.2.3 实现的完整音频控制模块
 * 
 * @param {Object} props
 * @param {string} props.audioUrl - 音频文件 URL（必需）
 * @param {Function} [props.onTimeUpdate] - 时间更新回调函数 (currentTime) => void
 * @param {number} [props.initialVolume=0.8] - 初始音量（0-1，默认 0.8）
 */
function AudioPlayer({ audioUrl, onTimeUpdate, initialVolume = 0.8 }) {
  const audioRef = useRef(null);
  
  // 状态管理
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());
  
  const previousVolumeRef = useRef(initialVolume);
  const collapseTimerRef = useRef(null);
  const handlePlayPauseRef = useRef(null);

  // 播放速度选项（循环顺序：1X → 1.25X → 1.5X → 0.75X → 1X）
  const playbackRates = [1, 1.25, 1.5, 0.75];

  // 重置收缩倒计时
  const resetCollapseTimer = useCallback(() => {
    setLastInteractionTime(Date.now());
    setIsCollapsed(false);
  }, []);

  // 当 audioUrl 改变时，更新 audio 元素的 src 并重置状态
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioUrl || audioUrl.trim() === '') {
      console.warn('[AudioPlayer] audioUrl 为空，跳过加载');
      return;
    }

    console.log('[AudioPlayer] 更新音频源:', audioUrl);
    
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    
    // 使用 HEAD 请求预检查文件是否存在（静默失败，不阻塞加载）
    fetch(audioUrl, { method: 'HEAD', mode: 'cors' })
      .then((response) => {
        if (response.ok) {
          console.log('[AudioPlayer] 音频 URL 可访问，状态码:', response.status);
        } else {
          // 静默处理：HEAD 请求失败不影响音频加载
          // audio 元素本身会处理文件不存在的情况
          console.warn(`[AudioPlayer] HEAD 请求返回 ${response.status}，将尝试直接加载音频`);
        }
        // 无论 HEAD 请求成功与否，都尝试加载音频
        // audio 元素会处理实际的文件加载错误
        audio.src = audioUrl;
        audio.load();
      })
      .catch((error) => {
        // 网络错误或 CORS 限制：静默降级，直接加载音频
        // 这在开发环境中很常见（如测试环境、CORS 限制等）
        console.warn('[AudioPlayer] HEAD 请求失败，尝试直接加载音频:', error.message);
        audio.src = audioUrl;
        audio.load();
      });
  }, [audioUrl]);

  // 初始化 audio 元素和事件监听器
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 只在初始化时设置音量和播放速度，避免在 playbackRate 改变时重置音量
    audio.volume = initialVolume;
    audio.playbackRate = playbackRate;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      console.log('[AudioPlayer] 音频元数据加载完成，时长:', audio.duration);
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime || 0;
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      console.log('[AudioPlayer] 开始播放');
      resetCollapseTimer();
    };

    const handlePause = () => {
      setIsPlaying(false);
      console.log('[AudioPlayer] 暂停播放');
      resetCollapseTimer();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      console.log('[AudioPlayer] 播放结束');
    };

    const handleVolumeChange = () => {
      setVolume(audio.volume);
      setIsMuted(audio.muted);
      resetCollapseTimer();
    };

    const handleError = (e) => {
      console.error('[AudioPlayer] 音频加载错误:', e);
      const error = audio.error;
      if (error) {
        let errorMessage = '未知错误';
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            errorMessage = '音频加载被中止';
            break;
          case error.MEDIA_ERR_NETWORK:
            errorMessage = '网络错误，无法加载音频';
            break;
          case error.MEDIA_ERR_DECODE:
            errorMessage = '音频解码错误';
            break;
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = '不支持的音频格式或源文件不存在';
            break;
        }
        console.error('[AudioPlayer] 错误详情:', errorMessage);
        alert(`音频加载失败: ${errorMessage}\n\n当前 URL: ${audio.src}\n\n请检查：\n1. 后端服务是否启动 (http://localhost:8000)\n2. 音频文件是否存在\n3. 控制台是否有 CORS 错误\n4. URL 是否正确`);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('volumechange', handleVolumeChange);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl, onTimeUpdate, initialVolume, resetCollapseTimer]);

  // 单独处理播放速度变化，避免影响音量
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  // 播放/暂停切换
  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    resetCollapseTimer();

    try {
      // 直接使用 audio.paused 判断，这是最可靠的方式
      // 不依赖 React 状态，避免闭包问题
      if (audio.paused) {
        // 如果音频未加载或 readyState 为 0，尝试加载
        if (audio.readyState === 0) {
          if (audio.src) {
            audio.load();
            // 等待音频可以播放，但设置较短的超时时间
            try {
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  // 超时后仍然尝试播放，不阻止用户操作
                  resolve();
                }, 2000);
                const handleCanPlay = () => {
                  clearTimeout(timeout);
                  resolve();
                };
                const handleError = () => {
                  clearTimeout(timeout);
                  // 即使加载失败也继续尝试播放
                  resolve();
                };
                audio.addEventListener('canplay', handleCanPlay, { once: true });
                audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
                audio.addEventListener('error', handleError, { once: true });
              });
            } catch (e) {
              // 加载失败也继续尝试播放
              console.warn('[AudioPlayer] 音频加载警告:', e);
            }
          }
        }
        // 无论 readyState 如何，都尝试播放
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      } else {
        // 确保暂停操作被执行
        audio.pause();
      }
    } catch (error) {
      console.error('[AudioPlayer] 播放失败:', error);
      alert(`播放失败: ${error.message}\n请检查音频文件是否可访问`);
    }
  }, [resetCollapseTimer]);

  // 使用 ref 存储 handlePlayPause，确保空格键事件监听器始终使用最新版本
  useEffect(() => {
    handlePlayPauseRef.current = handlePlayPause;
  }, [handlePlayPause]);

  // 空格键快捷键
  useEffect(() => {
    const handleKeyPress = (e) => {
      // 排除输入框和文本域
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      // 如果是空格键，无论焦点在哪里（包括按钮），都触发播放/暂停
      if (e.code === 'Space') {
        // 阻止默认行为（包括按钮的点击行为）
        e.preventDefault();
        // 使用 ref 获取最新的 handlePlayPause，确保即使切换倍速后也能正常工作
        if (handlePlayPauseRef.current) {
          handlePlayPauseRef.current();
        }
        // 阻止事件继续传播到目标元素，避免触发按钮的点击事件
        e.stopPropagation();
      }
    };

    // 使用捕获阶段确保事件被优先处理，避免被其他元素拦截
    // 捕获阶段在目标阶段之前执行，所以我们可以先处理并阻止传播
    window.addEventListener('keydown', handleKeyPress, true);
    return () => window.removeEventListener('keydown', handleKeyPress, true);
  }, []); // 不依赖 handlePlayPause，使用 ref 来获取最新版本

  // 后退15s
  const handleRewind = () => {
    const audio = audioRef.current;
    if (!audio) return;

    resetCollapseTimer();
    audio.currentTime = Math.max(0, audio.currentTime - 15);
  };

  // 前进30s
  const handleForward = () => {
    const audio = audioRef.current;
    if (!audio) return;

    resetCollapseTimer();
    audio.currentTime = Math.min(duration, audio.currentTime + 30);
  };

  // 播放速度调节
  const handlePlaybackRateChange = (e) => {
    const audio = audioRef.current;
    if (!audio) return;

    // 如果是空格键触发的点击，不处理（让空格键监听器处理）
    // 注意：由于我们在捕获阶段处理空格键并阻止传播，这里通常不会收到空格键事件
    // 但为了安全起见，还是保留这个检查
    if (e && (e.type === 'keydown' || e.detail === 0) && e.code === 'Space') {
      return;
    }

    resetCollapseTimer();
    const currentIndex = playbackRates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % playbackRates.length;
    const newRate = playbackRates[nextIndex];
    audio.playbackRate = newRate;
    setPlaybackRate(newRate);
    
    // 点击后移除按钮焦点，让空格键可以正常控制播放/暂停
    // 使用 setTimeout 确保在事件处理完成后再移除焦点
    setTimeout(() => {
      if (e && e.currentTarget) {
        e.currentTarget.blur();
      }
    }, 0);
  };

  // 进度条变化处理（拖拽过程中）
  const handleProgressChange = (event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    resetCollapseTimer();
    const newTime = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // 进度条拖拽结束处理（释放鼠标或键盘后）
  const handleProgressChangeCommitted = () => {
    // 拖拽结束后移除焦点，让空格键可以正常控制播放/暂停
    setTimeout(() => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }, 0);
  };

  // 音量变化处理（拖拽过程中）
  const handleVolumeSliderChange = (event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    resetCollapseTimer();
    const newVolume = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    
    if (newVolume > 0) {
      audio.muted = false;
      audio.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(false);
      previousVolumeRef.current = newVolume;
    } else {
      audio.volume = 0;
      audio.muted = true;
      setVolume(0);
      setIsMuted(true);
    }
  };

  // 音量滑块拖拽结束处理（释放鼠标或键盘后）
  const handleVolumeChangeCommitted = () => {
    // 拖拽结束后移除焦点，让空格键可以正常控制播放/暂停
    setTimeout(() => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }, 0);
  };

  // 音量按钮点击处理（切换静音）
  const handleVolumeToggle = (e) => {
    const audio = audioRef.current;
    if (!audio) return;

    resetCollapseTimer();

    if (audio.muted) {
      const restoreVolume = previousVolumeRef.current > 0 ? previousVolumeRef.current : initialVolume;
      audio.muted = false;
      audio.volume = restoreVolume;
      setVolume(restoreVolume);
      setIsMuted(false);
    } else {
      previousVolumeRef.current = audio.volume;
      audio.muted = true;
      setIsMuted(true);
    }

    // 点击后移除按钮焦点，让空格键可以正常控制播放/暂停
    setTimeout(() => {
      if (e && e.currentTarget) {
        e.currentTarget.blur();
      }
    }, 0);
  };

  // 点击收缩面板展开
  const handleCollapsedClick = () => {
    resetCollapseTimer();
  };

  // 计算进度百分比（用于收缩状态显示）
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 收缩状态：只显示5px高度的进度条
  if (isCollapsed) {
    return (
      <>
        <audio 
          ref={audioRef} 
          src={audioUrl || ''} 
          preload="metadata"
          crossOrigin="anonymous"
        />
        <Box
          onClick={handleCollapsedClick}
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
      </>
    );
  }

  // 正常状态：完整的播放器界面
  return (
    <>
      <audio 
        ref={audioRef} 
        src={audioUrl || ''} 
        preload="metadata"
        crossOrigin="anonymous"
      />
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
        onMouseMove={resetCollapseTimer}
        onMouseEnter={resetCollapseTimer}
      >
        <Stack direction="row" spacing={3} alignItems="center">
          {/* 左侧：音频播放进度条区域 */}
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
              onChange={handleProgressChange}
              onChangeCommitted={handleProgressChangeCommitted}
              onClick={resetCollapseTimer}
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
              onClick={handleRewind}
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
              onClick={handlePlayPause}
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
              onClick={handleForward}
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
              onClick={handlePlaybackRateChange}
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
                onClick={handleVolumeToggle}
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

              {/* 音量滑块：静音或音量为0时隐藏但保留空间 */}
              <Slider
                aria-label="音量"
                value={volume}
                min={0}
                max={1}
                step={0.01}
                onChange={handleVolumeSliderChange}
                onChangeCommitted={handleVolumeChangeCommitted}
                onClick={resetCollapseTimer}
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
                  visibility: isMuted || volume === 0 ? 'hidden' : 'visible',
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
    </>
  );
}

export default AudioPlayer;
