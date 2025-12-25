import { useState, useRef, useEffect } from 'react';
import {
  Box,
  IconButton,
  Slider,
  Typography,
  Stack,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
} from '@mui/icons-material';
import { formatTime } from '../utils/timeUtils';

/**
 * AudioPlayer 组件
 * 
 * 功能完整的音频播放器组件，支持播放/暂停、进度控制、音量控制和时间显示。
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
  const previousVolumeRef = useRef(initialVolume); // 保存静音前的音量值

  // 当 audioUrl 改变时，更新 audio 元素的 src 并重置状态
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 验证 audioUrl
    if (!audioUrl || audioUrl.trim() === '') {
      console.warn('[AudioPlayer] audioUrl 为空，跳过加载');
      return;
    }

    console.log('[AudioPlayer] 更新音频源:', audioUrl);
    
    // 重置状态
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    
    // 先测试 URL 是否可访问（HEAD 请求）
    fetch(audioUrl, { method: 'HEAD', mode: 'cors' })
      .then((response) => {
        if (response.ok) {
          console.log('[AudioPlayer] 音频 URL 可访问，状态码:', response.status);
          // 更新 src 并加载
          audio.src = audioUrl;
          audio.load(); // 强制重新加载音频
        } else {
          console.error('[AudioPlayer] 音频 URL 返回错误状态码:', response.status, response.statusText);
          alert(`音频文件无法访问: HTTP ${response.status} ${response.statusText}\n\nURL: ${audioUrl}\n\n请检查：\n1. 后端服务是否启动\n2. 文件路径是否正确`);
        }
      })
      .catch((error) => {
        console.error('[AudioPlayer] 无法访问音频 URL:', error);
        // 即使 fetch 失败，也尝试加载（可能是 CORS 问题，但 audio 元素可能可以访问）
        console.warn('[AudioPlayer] 尝试直接加载音频（可能是 CORS 限制）');
        audio.src = audioUrl;
        audio.load();
      });
  }, [audioUrl]);

  // 初始化 audio 元素和事件监听器
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 设置初始音量
    audio.volume = initialVolume;

    // 事件监听器
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
    };

    const handlePause = () => {
      setIsPlaying(false);
      console.log('[AudioPlayer] 暂停播放');
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      console.log('[AudioPlayer] 播放结束');
    };

    const handleVolumeChange = () => {
      setVolume(audio.volume);
      setIsMuted(audio.muted);
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
        console.error('[AudioPlayer] 当前音频 URL:', audio.src);
        console.error('[AudioPlayer] 错误代码:', error.code);
        alert(`音频加载失败: ${errorMessage}\n\n当前 URL: ${audio.src}\n\n请检查：\n1. 后端服务是否启动 (http://localhost:8000)\n2. 音频文件是否存在\n3. 控制台是否有 CORS 错误\n4. URL 是否正确`);
      } else {
        console.error('[AudioPlayer] 未知错误，audio.error 为空');
      }
    };

    const handleCanPlay = () => {
      console.log('[AudioPlayer] 音频可以播放');
    };

    const handleLoadStart = () => {
      console.log('[AudioPlayer] 开始加载音频:', audio.src);
    };

    const handleLoadedData = () => {
      console.log('[AudioPlayer] 音频数据加载完成');
    };

    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const bufferedPercent = (bufferedEnd / audio.duration) * 100;
        console.log(`[AudioPlayer] 缓冲进度: ${bufferedPercent.toFixed(1)}%`);
      }
    };

    // 添加事件监听器
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('volumechange', handleVolumeChange);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('progress', handleProgress);

    // 清理函数
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('progress', handleProgress);
    };
  }, [audioUrl, onTimeUpdate, initialVolume]);

  // 播放/暂停切换
  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) {
      console.error('[AudioPlayer] audio 元素不存在');
      return;
    }

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        // 尝试播放，如果失败会返回一个 Promise rejection
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      }
    } catch (error) {
      console.error('[AudioPlayer] 播放失败:', error);
      alert(`播放失败: ${error.message}\n请检查音频文件是否可访问`);
    }
  };

  // 进度条变化处理
  const handleProgressChange = (event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // 音量变化处理
  const handleVolumeChange = (event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    
    // 如果拖动音量滑块，取消静音并设置音量
    if (newVolume > 0) {
      audio.muted = false;
      audio.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(false);
      previousVolumeRef.current = newVolume;
    } else {
      // 音量设为 0 时，静音
      audio.volume = 0;
      audio.muted = true;
      setVolume(0);
      setIsMuted(true);
    }
  };

  // 音量按钮点击处理（切换静音）
  const handleVolumeToggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.muted) {
      // 取消静音：恢复之前的音量
      const restoreVolume = previousVolumeRef.current > 0 ? previousVolumeRef.current : initialVolume;
      audio.muted = false;
      audio.volume = restoreVolume;
      setVolume(restoreVolume);
      setIsMuted(false);
    } else {
      // 静音：保存当前音量
      previousVolumeRef.current = audio.volume;
      audio.muted = true;
      setIsMuted(true);
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1,
      }}
    >
      {/* 隐藏的 audio 元素 */}
      <audio 
        ref={audioRef} 
        src={audioUrl || ''} 
        preload="metadata"
        crossOrigin="anonymous"
      />

      <Stack spacing={2}>
        {/* 进度条 */}
        <Slider
          aria-label="进度"
          value={currentTime}
          min={0}
          max={duration || 100}
          step={0.1}
          onChange={handleProgressChange}
          sx={{
            color: 'primary.main',
            '& .MuiSlider-thumb': {
              width: 16,
              height: 16,
            },
          }}
        />

        {/* 控制栏 */}
        <Stack direction="row" spacing={2} alignItems="center">
          {/* 播放/暂停按钮 */}
          <IconButton
            aria-label={isPlaying ? '暂停' : '播放'}
            onClick={handlePlayPause}
            color="primary"
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

          {/* 时间显示 */}
          <Typography variant="body2" sx={{ minWidth: 100 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          {/* 音量控制 */}
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

            <Slider
              aria-label="音量"
              value={volume}
              min={0}
              max={1}
              step={0.01}
              onChange={handleVolumeChange}
              sx={{
                color: 'primary.main',
                width: 100,
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

export default AudioPlayer;

