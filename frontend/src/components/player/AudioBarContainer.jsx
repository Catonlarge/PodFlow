import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudio } from '../../hooks/useAudio';
import { useIdle } from '../../hooks/useIdle';
import FullAudioBar from './FullAudioBar';
import MiniAudioBar from './MiniAudioBar';

/**
 * AudioBarContainer 组件
 * 
 * 智能容器：检测鼠标活动，决定显示Full还是Mini
 * 负责整合useAudio和useIdle hooks，管理播放器的展开/收缩状态
 * 
 * @param {Object} props
 * @param {string} props.audioUrl - 音频文件 URL（必需）
 * @param {Function} [props.onTimeUpdate] - 时间更新回调函数 (currentTime) => void
 * @param {Function} [props.onDurationChange] - 时长更新回调函数 (duration) => void
 * @param {number} [props.initialVolume=0.8] - 初始音量（0-1，默认 0.8）
 */
export default function AudioBarContainer({ audioUrl, onTimeUpdate, onDurationChange, initialVolume = 0.8 }) {
  const [isHovering, setIsHovering] = useState(false);
  const resetIdleTimerRef = useRef(null);

  // 先创建交互回调，使用ref来避免循环依赖
  const handleInteraction = useCallback(() => {
    if (resetIdleTimerRef.current) {
      resetIdleTimerRef.current();
    }
  }, []);

  // 使用useAudio hook管理音频播放逻辑
  const audio = useAudio({
    audioUrl,
    onTimeUpdate,
    onDurationChange,
    initialVolume,
    onInteraction: handleInteraction,
  });

  // 使用useIdle hook检测无操作状态
  const { isIdle, resetIdleTimer } = useIdle({
    delay: 3000,
    enabled: audio.isPlaying, // 只在播放中时启用检测
    isHovering: isHovering,
  });

  // 将resetIdleTimer存储到ref中，供handleInteraction使用
  useEffect(() => {
    resetIdleTimerRef.current = resetIdleTimer;
  }, [resetIdleTimer]);

  // 处理鼠标进入播放器
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    resetIdleTimer();
  }, [resetIdleTimer]);

  // 处理鼠标离开播放器
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    // 离开时不立即重置，让定时器检查是否应该收缩
  }, []);

  // 点击收缩面板展开
  const handleCollapsedClick = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  // 计算进度百分比（用于收缩状态显示）
  const progressPercent = audio.duration > 0 
    ? (audio.currentTime / audio.duration) * 100 
    : 0;

  // 根据isIdle状态决定渲染Full还是Mini
  if (isIdle) {
    return (
      <>
        <audio 
          ref={audio.audioRef} 
          src={audioUrl || ''} 
          preload="metadata"
          crossOrigin="anonymous"
        />
        <MiniAudioBar 
          progressPercent={progressPercent}
          onClick={handleCollapsedClick}
        />
      </>
    );
  }

  // 正常状态：完整的播放器界面
  return (
    <>
      <audio 
        ref={audio.audioRef} 
        src={audioUrl || ''} 
        preload="metadata"
        crossOrigin="anonymous"
      />
      <FullAudioBar
        audioState={{
          currentTime: audio.currentTime,
          duration: audio.duration,
          isPlaying: audio.isPlaying,
          volume: audio.volume,
          isMuted: audio.isMuted,
          playbackRate: audio.playbackRate,
        }}
        audioControls={{
          togglePlay: audio.togglePlay,
          rewind: audio.rewind,
          forward: audio.forward,
          setPlaybackRate: audio.setPlaybackRate,
          setVolume: audio.setVolume,
          toggleMute: audio.toggleMute,
          setProgress: audio.setProgress,
          onProgressChangeCommitted: audio.onProgressChangeCommitted,
          onVolumeChangeCommitted: audio.onVolumeChangeCommitted,
        }}
        onInteraction={handleInteraction}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
}

