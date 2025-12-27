import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

/**
 * useAudio Hook
 * 
 * 管理音频播放的核心逻辑，包括播放/暂停、进度控制、音量、倍速等
 * 
 * @param {Object} options
 * @param {string} options.audioUrl - 音频文件 URL（必需）
 * @param {Function} [options.onTimeUpdate] - 时间更新回调函数 (currentTime) => void
 * @param {Function} [options.onDurationChange] - 时长更新回调函数 (duration) => void
 * @param {number} [options.initialVolume=0.8] - 初始音量（0-1，默认 0.8）
 * @param {Function} [options.onInteraction] - 用户交互回调（用于重置收缩定时器）
 * @returns {Object} 音频状态和控制方法
 */
export function useAudio({ audioUrl, onTimeUpdate, onDurationChange, initialVolume = 0.8, onInteraction }) {
  const audioRef = useRef(null);
  
  // 状态管理
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const previousVolumeRef = useRef(initialVolume);
  const handlePlayPauseRef = useRef(null);

  // 播放速度选项（循环顺序：1X → 1.25X → 1.5X → 0.75X → 1X）
  // 使用 useMemo 避免每次渲染都创建新数组
  const playbackRates = useMemo(() => [1, 1.25, 1.5, 0.75], []);

  // 触发交互回调
  const triggerInteraction = useCallback(() => {
    if (onInteraction) {
      onInteraction();
    }
  }, [onInteraction]);

  // 当 audioUrl 改变时，更新 audio 元素的 src 并重置状态
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioUrl || audioUrl.trim() === '') {
      console.warn('[useAudio] audioUrl 为空，跳过加载');
      return;
    }

    console.log('[useAudio] 更新音频源:', audioUrl);
    
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    
    // 直接设置音频源，利用原生的 onError 事件处理错误
    // 避免不必要的 HEAD 请求，减少服务器负担和播放延迟
    audio.src = audioUrl;
    audio.load();
  }, [audioUrl]);

  // 初始化 audio 元素和事件监听器
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 只在初始化时设置音量，避免在 playbackRate 改变时重置音量
    // 注意：不在这里设置 playbackRate，它由单独的 useEffect 处理
    audio.volume = initialVolume;

    const handleLoadedMetadata = () => {
      const newDuration = audio.duration || 0;
      setDuration(newDuration);
      if (onDurationChange) {
        onDurationChange(newDuration);
      }
      console.log('[useAudio] 音频元数据加载完成，时长:', newDuration);
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
      console.log('[useAudio] 开始播放');
      triggerInteraction();
    };

    const handlePause = () => {
      setIsPlaying(false);
      console.log('[useAudio] 暂停播放');
      triggerInteraction();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      console.log('[useAudio] 播放结束');
      triggerInteraction();
    };

    const handleVolumeChange = () => {
      setVolume(audio.volume);
      setIsMuted(audio.muted);
      triggerInteraction();
    };

    const handleError = (e) => {
      console.error('[useAudio] 音频加载错误:', e);
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
        console.error('[useAudio] 错误详情:', errorMessage);
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
  }, [audioUrl, onTimeUpdate, onDurationChange, initialVolume, triggerInteraction]);

  // 单独处理播放速度变化，避免影响音量
  // 这个useEffect会在组件挂载时执行一次（设置初始值），也会在playbackRate改变时执行
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  // 播放/暂停切换
  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    triggerInteraction();

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
              await new Promise((resolve) => {
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
              console.warn('[useAudio] 音频加载警告:', e);
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
      console.error('[useAudio] 播放失败:', error);
      alert(`播放失败: ${error.message}\n请检查音频文件是否可访问`);
    }
  }, [triggerInteraction]);

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
  const handleRewind = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    triggerInteraction();
    audio.currentTime = Math.max(0, audio.currentTime - 15);
  }, [triggerInteraction]);

  // 前进30s
  const handleForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    triggerInteraction();
    audio.currentTime = Math.min(duration, audio.currentTime + 30);
  }, [duration, triggerInteraction]);

  // 播放速度调节
  const handlePlaybackRateChange = useCallback((e) => {
    const audio = audioRef.current;
    if (!audio) return;

    // 如果是空格键触发的点击，不处理（让空格键监听器处理）
    // 注意：由于我们在捕获阶段处理空格键并阻止传播，这里通常不会收到空格键事件
    // 但为了安全起见，还是保留这个检查
    if (e && (e.type === 'keydown' || e.detail === 0) && e.code === 'Space') {
      return;
    }

    triggerInteraction();
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
  }, [playbackRate, playbackRates, triggerInteraction]);

  // 进度条变化处理（拖拽过程中）
  const handleProgressChange = useCallback((event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    triggerInteraction();
    const newTime = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [triggerInteraction]);

  // 进度条拖拽结束处理（释放鼠标或键盘后）
  const handleProgressChangeCommitted = useCallback(() => {
    // 拖拽结束后移除焦点，让空格键可以正常控制播放/暂停
    setTimeout(() => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }, 0);
  }, []);

  // 音量变化处理（拖拽过程中）
  const handleVolumeSliderChange = useCallback((event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    triggerInteraction();
    const newVolume = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    
    // 当用户拖动滑块时，自动解除静音
    // 这样用户可以直接通过拖动滑块来恢复音量，无需先点击静音按钮
    if (newVolume > 0) {
      audio.muted = false;
      audio.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(false);
      previousVolumeRef.current = newVolume;
    } else {
      // 音量为 0 时，保持静音状态但不隐藏滑块
      audio.volume = 0;
      audio.muted = true;
      setVolume(0);
      setIsMuted(true);
    }
  }, [triggerInteraction]);

  // 音量滑块拖拽结束处理（释放鼠标或键盘后）
  const handleVolumeChangeCommitted = useCallback(() => {
    // 拖拽结束后移除焦点，让空格键可以正常控制播放/暂停
    setTimeout(() => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }, 0);
  }, []);

  // 音量按钮点击处理（切换静音）
  const handleVolumeToggle = useCallback((e) => {
    const audio = audioRef.current;
    if (!audio) return;

    triggerInteraction();

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
  }, [initialVolume, triggerInteraction]);

  return {
    // 音频元素引用
    audioRef,
    // 状态
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    // 控制方法
    togglePlay: handlePlayPause,
    rewind: handleRewind,
    forward: handleForward,
    setPlaybackRate: handlePlaybackRateChange,
    setVolume: handleVolumeSliderChange,
    toggleMute: handleVolumeToggle,
    setProgress: handleProgressChange,
    onProgressChangeCommitted: handleProgressChangeCommitted,
    onVolumeChangeCommitted: handleVolumeChangeCommitted,
    // 交互回调（用于重置收缩定时器）
    triggerInteraction,
  };
}

