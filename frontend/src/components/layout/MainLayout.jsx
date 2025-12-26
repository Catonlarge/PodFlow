/**
 * MainLayout 组件
 * 
 * 主应用布局容器，管理播客学习界面的整体结构
 * 
 * 功能描述：
 * - 包含三个主要区域：
 *   1. 播客 episode 信息界面（顶部，固定）
 *   2. 英文字幕区域（主体区域，占屏幕90%，左右分栏）
 *   3. 音频操作界面（底部悬浮条，固定）
 * - 管理整体页面布局结构和响应式设计
 * 
 * 优化点：
 * 1. 使用 calc() 动态计算内容高度，确保铺满屏幕且无整体滚动条
 * 2. 为滚动区域底部增加 padding，防止内容被底部的 AudioBar 遮挡
 * 3. 使用常量定义高度值，便于维护
 * 
 * 相关PRD：
 * - PRD 6.2.1: 总原则和界面模块
 * - PRD 6.2.2: 播客源数据展示模块
 * 
 * @module components/layout/MainLayout
 * 
 * @param {Object} props
 * @param {string} [props.episodeTitle] - 播客 episode 的名称，传递给 EpisodeHeader
 * @param {string} [props.showName] - episode 归属的 show/channel 名称，传递给 EpisodeHeader
 * @param {string} [props.audioUrl] - 音频文件 URL，传递给 AudioBarContainer
 * @param {number|string} [props.episodeId] - Episode ID，传递给 SubtitleList 用于加载字幕数据
 * @param {React.ReactNode} [props.children] - 可选，用于未来扩展
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import EpisodeHeader from './EpisodeHeader';
import SubtitleList from '../subtitles/SubtitleList';
import NoteSidebar from '../notes/NoteSidebar';
import AudioBarContainer from '../player/AudioBarContainer';

export default function MainLayout({ 
  episodeTitle, 
  showName, 
  audioUrl,
  episodeId,
  children 
}) {
  // 定义常量，方便维护
  const HEADER_HEIGHT = 80; // 与 EpisodeHeader 中的 height 保持一致
  const FULL_PLAYER_HEIGHT = 90; // 完整播放器的高度（根据 AudioBar 实际情况调整）
  const MINI_PLAYER_HEIGHT = 5; // 收缩播放器的高度（MiniAudioBar）

  // 音频状态（用于传递给 SubtitleList）
  // TODO: 后续可以通过 AudioContext 来共享音频状态，避免 props drilling
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // 播放器展开/收缩状态（false=展开，true=收缩）
  const [isPlayerIdle, setIsPlayerIdle] = useState(false);

  // 音频控制方法引用
  const audioControlsRef = useRef(null);

  // 主体滚动容器引用（用于 SubtitleList 的自动滚动）
  const mainScrollRef = useRef(null);
  
  // 用户滚动状态（用于 SubtitleList 的自动滚动暂停逻辑）
  const userScrollTimeoutRef = useRef(null);
  const isUserScrollingRef = useRef(false);

  // 处理主体区域滚动（用于 SubtitleList 的用户滚动检测）
  const handleMainScroll = useCallback(() => {
    isUserScrollingRef.current = true;

    // 清除之前的定时器
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }

    // 5秒后恢复自动滚动
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 5000);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  // 处理音频时间更新回调
  const handleTimeUpdate = (time) => {
    setCurrentTime(time);
  };

  // 处理音频时长更新回调
  const handleDurationChange = (dur) => {
    setDuration(dur);
  };

  // 处理音频控制方法就绪回调
  const handleAudioControlsReady = useCallback((controls) => {
    audioControlsRef.current = controls;
  }, []);

  // 处理播放器状态变化回调
  const handlePlayerStateChange = useCallback((isIdle) => {
    setIsPlayerIdle(isIdle);
  }, []);

  // 处理字幕点击，跳转播放位置并取消暂停
  const handleCueClick = useCallback((startTime) => {
    if (audioControlsRef.current) {
      // 1. 跳转时间
      if (audioControlsRef.current.setProgress) {
        // setProgress 需要 (event, newValue) 两个参数，这里传入 null 作为 event
        audioControlsRef.current.setProgress(null, startTime);
      }
      // 2. 如果暂停，则开始播放
      if (audioControlsRef.current.togglePlay && !audioControlsRef.current.isPlaying) {
        audioControlsRef.current.togglePlay();
      }
    }
  }, []);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        bgcolor: 'background.default',
      }}
    >
      {/* 顶部：播客信息头部 */}
      <EpisodeHeader 
        episodeTitle={episodeTitle}
        showName={showName}
      />

      {/* 分界线（固定在视口中，不受滚动影响） */}
      <Box
        sx={{
          position: 'fixed',
          left: { xs: 0, md: '70%' },
          top: `${HEADER_HEIGHT}px`,
          bottom: audioUrl ? (isPlayerIdle ? `${MINI_PLAYER_HEIGHT}px` : `${FULL_PLAYER_HEIGHT}px`) : 0,
          width: '1.5px',
          backgroundColor: '#e0e0e0',
          pointerEvents: 'none',
          display: { xs: 'none', md: 'block' },
          zIndex: 1000,
          transition: 'bottom 0.3s ease-in-out',
        }}
      />

      {/* 主体区域：左右分栏（统一滚动容器） */}
      <Box
        component="main"
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        sx={{
          position: 'fixed',
          top: `${HEADER_HEIGHT}px`,
          left: 0,
          right: 0,
          bottom: audioUrl ? (isPlayerIdle ? `${MINI_PLAYER_HEIGHT}px` : `${FULL_PLAYER_HEIGHT}px`) : 0,
          width: '100%',
          display: 'flex',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'bottom 0.3s ease-in-out',
        }}
        data-subtitle-container
      >
        {/* 左侧：英文字幕区域（70%） */}
        <Box
          sx={{
            flex: { xs: '1 1 100%', md: '0 0 70%' },
            width: { xs: '100%', md: '70%' },
            maxWidth: { xs: '100%', md: '70%' },
            px: 2,
            pt: 2,
            pb: 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'visible',
            position: 'relative',
            boxSizing: 'border-box',
          }}
        >
          <SubtitleList 
            currentTime={currentTime}
            duration={duration}
            onCueClick={handleCueClick}
            audioUrl={audioUrl}
            episodeId={episodeId}
            scrollContainerRef={mainScrollRef}
            isUserScrollingRef={isUserScrollingRef}
          />
        </Box>


        {/* 右侧：笔记区域（30%） */}
        <Box
          sx={{
            flex: { xs: '0 0 0', md: '0 0 30%' },
            width: { xs: 0, md: '30%' },
            maxWidth: { xs: 0, md: '30%' },
            px: 2,
            pt: 2,
            pb: 2,
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            bgcolor: 'background.paper',
            overflow: 'visible',
            position: 'relative',
            boxSizing: 'border-box',
          }}
        >
          <NoteSidebar />
        </Box>
      </Box>

      {/* 底部：音频控制面板 */}
      {audioUrl && (
        <AudioBarContainer 
          audioUrl={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onAudioControlsReady={handleAudioControlsReady}
          onPlayerStateChange={handlePlayerStateChange}
        />
      )}

      {children}
    </Box>
  );
}

