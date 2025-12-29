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
 * @param {Function} [props.onFileImportClick] - 文件导入按钮点击回调 () => void
 * @param {string} [props.transcriptionStatus] - 转录状态（pending/processing/completed/failed），传递给 SubtitleList 用于在识别完成后触发字幕重新加载
 * @param {Array} [props.segments] - Segment 状态数组，传递给 SubtitleList 用于显示底部状态提示
 * @param {Array} [props.cues] - 字幕数据，如果提供则直接传递给 SubtitleList，避免触发加载状态
 * @param {React.ReactNode} [props.children] - 可选，用于未来扩展
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, IconButton } from '@mui/material';
import { ArrowForward, StickyNote2 } from '@mui/icons-material';
import EpisodeHeader from './EpisodeHeader';
import SubtitleList from '../subtitles/SubtitleList';
import NoteSidebar from '../notes/NoteSidebar';
import AudioBarContainer from '../player/AudioBarContainer';

export default function MainLayout({ 
  episodeTitle, 
  showName, 
  audioUrl,
  episodeId,
  onFileImportClick,
  transcriptionStatus,
  segments = [],
  cues = null,
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
  
  // 用户交互状态（用于 SubtitleList 的自动滚动暂停逻辑）
  // 当用户进行划线、查询卡片展示等操作时，需要暂停自动滚动
  // TODO: 当 SelectionMenu 实现后，需要根据其打开状态更新 isInteracting
  const [isInteracting] = useState(false);
  
  // 笔记侧边栏展开/收缩状态（用于控制收缩/展开按钮显示）
  const [isNoteSidebarExpanded, setIsNoteSidebarExpanded] = useState(false);
  
  // 处理笔记侧边栏展开/收缩状态变化（使用 useCallback 避免无限循环）
  const handleNoteSidebarExpandedChange = useCallback((expanded) => {
    setIsNoteSidebarExpanded(expanded);
  }, []);
  
  // 处理收缩按钮点击
  const handleCollapseSidebar = useCallback(() => {
    setIsNoteSidebarExpanded(false);
  }, []);
  
  // 处理展开按钮点击
  const handleExpandSidebar = useCallback(() => {
    setIsNoteSidebarExpanded(true);
  }, []);

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

  // 笔记侧边栏引用（用于双向链接：点击划线时滚动到对应笔记）
  const noteSidebarRef = useRef(null);
  
  // 处理笔记点击（双向链接逻辑：点击笔记 → 左侧字幕滚动到对应划线位置）
  const handleNoteClick = useCallback((note, highlight) => {
    if (!highlight || !cues || !mainScrollRef.current) {
      console.warn('[MainLayout] 笔记点击：缺少必要数据', { note, highlight, cues });
      return;
    }
    
    // 1. 根据 highlight.cue_id 找到对应的 TranscriptCue
    const targetCue = cues.find(c => c.id === highlight.cue_id);
    if (!targetCue) {
      console.warn('[MainLayout] 笔记点击：找不到对应的 cue', { highlight });
      return;
    }
    
    // 2. 找到对应的 SubtitleRow DOM 元素（用于滚动定位）
    const subtitleElement = mainScrollRef.current.querySelector(
      `[data-subtitle-id="${targetCue.id}"]`
    );
    
    if (!subtitleElement) {
      console.warn('[MainLayout] 笔记点击：找不到对应的字幕元素', { targetCue });
      return;
    }
    
    // 3. 找到对应的 highlight span 元素（用于高亮）
    const highlightElement = mainScrollRef.current.querySelector(
      `[data-highlight-id="${highlight.id}"]`
    );
    
    // 4. 滚动到字幕行位置（使用 scrollIntoView）
    // 优先使用 highlight 元素进行滚动定位，如果找不到则使用字幕行
    const scrollTargetElement = highlightElement || subtitleElement;
    scrollTargetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center', // 滚动到屏幕中央
    });
    
    // 5. 高亮显示该划线区域（添加临时高亮样式，1秒后移除）
    // 如果找到了highlight元素，高亮highlight；否则高亮整个字幕行
    const targetElement = highlightElement || subtitleElement;
    const originalBgColor = targetElement.style.backgroundColor;
    const originalBoxShadow = targetElement.style.boxShadow;
    
    // 使用闪烁效果（背景色 + 阴影）
    targetElement.style.backgroundColor = 'rgba(156, 39, 176, 0.3)'; // 紫色半透明
    targetElement.style.boxShadow = '0 0 8px rgba(156, 39, 176, 0.5)'; // 紫色阴影
    targetElement.style.transition = 'background-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out';
    targetElement.style.borderRadius = '2px'; // 添加圆角，让高亮更明显
    
    setTimeout(() => {
      targetElement.style.backgroundColor = originalBgColor || '';
      targetElement.style.boxShadow = originalBoxShadow || '';
      setTimeout(() => {
        targetElement.style.transition = '';
        targetElement.style.borderRadius = '';
      }, 300);
    }, 1000);
  }, [cues]);
  
  // 处理划线点击（双向链接逻辑：点击划线 → 右侧笔记闪烁高亮，同时滚动到对应的字幕行位置）
  const handleHighlightClick = useCallback((highlight) => {
    if (!highlight || !noteSidebarRef.current) {
      console.warn('[MainLayout] 划线点击：缺少必要数据', { highlight });
      return;
    }
    
    // 1. 提升对应笔记卡片到最前面（z-index管理）
    if (noteSidebarRef.current && noteSidebarRef.current.bringNoteToFront) {
      noteSidebarRef.current.bringNoteToFront(highlight.id);
    }
    
    // 2. 触发笔记卡片闪烁效果（双向链接：点击划线 → 右侧笔记闪烁高亮）
    const noteSidebarContainer = noteSidebarRef.current.getContainer 
      ? noteSidebarRef.current.getContainer() 
      : noteSidebarRef.current;
    
    if (noteSidebarContainer) {
      const noteCardContainer = noteSidebarContainer.querySelector(
        `[data-note-highlight-id="${highlight.id}"]`
      );
      
      if (noteCardContainer) {
        const noteCardElement = noteCardContainer.querySelector(
          `[data-testid^="note-card-"]`
        );
        
        // 触发笔记卡片闪烁效果
        if (noteCardContainer) {
          noteCardContainer.classList.add('note-card-flash');
          setTimeout(() => {
            noteCardContainer.classList.remove('note-card-flash');
          }, 600);
        }
        
        if (noteCardElement) {
          noteCardElement.classList.add('note-card-flash');
          setTimeout(() => {
            noteCardElement.classList.remove('note-card-flash');
          }, 600);
        }
      }
    }
    
    // 2. 滚动到对应的字幕行位置（与点击笔记卡片时的行为一致，都定位到屏幕中央）
    if (!cues || !mainScrollRef.current) {
      return;
    }
    
    // 根据 highlight.cue_id 找到对应的 TranscriptCue
    const targetCue = cues.find(c => c.id === highlight.cue_id);
    if (!targetCue) {
      console.warn('[MainLayout] 划线点击：找不到对应的 cue', { highlight });
      return;
    }
    
    // 找到对应的 SubtitleRow DOM 元素（用于滚动定位）
    const subtitleElement = mainScrollRef.current.querySelector(
      `[data-subtitle-id="${targetCue.id}"]`
    );
    
    if (!subtitleElement) {
      console.warn('[MainLayout] 划线点击：找不到对应的字幕元素', { targetCue });
      return;
    }
    
    // 找到对应的 highlight span 元素（用于滚动定位和高亮）
    const highlightElement = mainScrollRef.current.querySelector(
      `[data-highlight-id="${highlight.id}"]`
    );
    
    // 使用 scrollIntoView 滚动到屏幕中央，与 handleNoteClick 保持一致
    // 优先使用 highlight 元素进行滚动定位，如果找不到则使用字幕行
    const scrollTargetElement = highlightElement || subtitleElement;
    scrollTargetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center', // 滚动到屏幕中央
    });
  }, [cues]);

  // 笔记删除触发器（用于触发 SubtitleList 刷新 highlights）
  const [noteDeleteTrigger, setNoteDeleteTrigger] = useState(0);
  
  // 处理笔记删除
  const handleNoteDelete = useCallback((noteId) => {
    // 删除笔记后，NoteSidebar 内部会自动刷新列表
    // 触发 SubtitleList 刷新 highlights
    setNoteDeleteTrigger(prev => prev + 1);
    console.log('[MainLayout] 笔记删除:', noteId);
  }, []);

  // 处理笔记创建（用于刷新 NoteSidebar 列表）
  const handleNoteCreate = useCallback((noteData, highlightData) => {
    // 优先使用直接添加方式（避免数据库查询延迟）
    if (noteData && noteSidebarRef.current && noteSidebarRef.current.addNoteDirectly) {
      noteSidebarRef.current.addNoteDirectly(noteData, highlightData);
    } else if (noteSidebarRef.current && noteSidebarRef.current.refreshNotes) {
      // 降级方案：使用刷新方式（延迟查询）
      noteSidebarRef.current.refreshNotes();
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
      {/* 只有当笔记边栏展开时才显示分界线 */}
      <Box
        sx={{
          position: 'fixed',
          left: { xs: 0, md: '70%' },
          top: `${HEADER_HEIGHT}px`,
          bottom: audioUrl ? (isPlayerIdle ? `${MINI_PLAYER_HEIGHT}px` : `${FULL_PLAYER_HEIGHT}px`) : 0,
          width: '1.5px',
          backgroundColor: '#e0e0e0',
          pointerEvents: 'none',
          display: { xs: 'none', md: isNoteSidebarExpanded ? 'block' : 'none' }, // 使用 display 而不是条件渲染，避免闪烁
          zIndex: 1000,
          transition: 'bottom 0.2s ease-in-out, opacity 0.15s ease-in-out', // 使用更快的过渡
          opacity: isNoteSidebarExpanded ? 1 : 0,
          willChange: 'opacity', // 优化性能
        }}
      />

      {/* 笔记侧边栏收缩按钮（向右箭头图标，PRD 377行） */}
      {/* 按钮使用 fixed 定位，紧贴分界线（70%位置），避免被主容器的 overflowX: hidden 裁剪 */}
      {/* 只有当笔记边栏展开时才显示收缩按钮 */}
      {isNoteSidebarExpanded && (
        <IconButton
          data-testid="note-sidebar-collapse-button"
          onClick={handleCollapseSidebar}
          sx={{
            position: 'fixed',
            left: { xs: 'calc(70% - 12px)', md: 'calc(70% - 12px)' }, // 分界线位置 (70%) - 按钮宽度的一半 (24px/2)
            transition: 'left 0.3s ease-in-out, opacity 0.3s ease-in-out', // 添加过渡动画
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            padding: 0,
            zIndex: 1002, // 确保在分界线之上（分界线 zIndex 1000）
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            borderRadius: '4px',
            boxShadow: 3, // 增加阴影，提高可见性
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            '&:hover': {
              borderColor: 'text.primary', // PRD 377行：箭头灰色边框变深
              bgcolor: 'action.hover',
              boxShadow: 4,
            },
            '&:active': {
              transform: 'translateY(-50%) scale(0.95)',
              borderColor: 'text.primary',
            },
          }}
        >
          <ArrowForward 
            sx={{ 
              fontSize: '16px',
              width: '9px',
              height: '16px',
              color: 'text.primary', // 确保图标颜色可见
            }} 
          />
        </IconButton>
      )}

      {/* 笔记侧边栏展开按钮（笔记图标气泡，PRD 379行） */}
      {/* 只有当笔记边栏收缩时才显示展开按钮，位置在屏幕右侧边缘 */}
      {!isNoteSidebarExpanded && (
        <IconButton
          data-testid="note-sidebar-expand-button"
          onClick={handleExpandSidebar}
          sx={{
            position: 'fixed',
            right: { xs: '24px', md: '24px' }, // 收缩时，按钮显示在右侧边缘（距离右边缘24px）
            transition: 'right 0.3s ease-in-out, opacity 0.3s ease-in-out', // 添加过渡动画
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px', // 与收缩按钮相同大小
            height: '24px', // 与收缩按钮相同大小
            minWidth: '24px', // 与收缩按钮相同大小
            padding: 0,
            zIndex: 1002, // 确保在分界线之上
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '50%',
            boxShadow: 3, // 增加阴影，提高可见性
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            '&:hover': {
              bgcolor: 'action.hover', // PRD 379行：背景颜色变成加深的灰色
              borderColor: 'text.primary',
              boxShadow: 4,
            },
            '&:active': {
              transform: 'translateY(-50%) scale(0.95)',
            },
          }}
        >
          <StickyNote2 
            sx={{ 
              fontSize: '16px', // 调整图标大小，与收缩按钮的箭头图标大小相近
              color: 'text.primary', // 确保图标颜色可见
            }} 
          />
        </IconButton>
      )}

      {/* 主体区域：左右分栏（统一滚动容器） */}
      {/* 
        布局说明：使用 position: fixed 配合 top 和 bottom 自动计算高度
        这是正确的做法，避免了使用 height: calc(100vh - HEADER_HEIGHT) 可能导致的双重滚动条问题
        当使用 height: 90vh + marginTop: 80px 时，总高度会超过 100vh，导致页面出现全局滚动条
      */}
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
        {/* 左侧：英文字幕区域（根据笔记边栏展开状态调整：展开时70%，收缩时100%） */}
        <Box
          sx={{
            flex: { xs: '1 1 100%', md: isNoteSidebarExpanded ? '0 0 70%' : '1 1 100%' },
            width: { xs: '100%', md: isNoteSidebarExpanded ? '70%' : '100%' },
            maxWidth: { xs: '100%', md: isNoteSidebarExpanded ? '70%' : '100%' },
            px: 2,
            pt: 2,
            pb: 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'visible',
            position: 'relative',
            boxSizing: 'border-box',
            transition: 'flex 0.15s ease-out', // 只过渡 flex 属性，移除 width 和 max-width 的过渡以避免与 flex 布局计算冲突
            willChange: 'flex', // 只优化 flex 属性
          }}
        >
          <SubtitleList 
            currentTime={currentTime}
            duration={duration}
            onCueClick={handleCueClick}
            audioUrl={audioUrl}
            episodeId={episodeId}
            cues={cues}
            scrollContainerRef={mainScrollRef}
            isUserScrollingRef={isUserScrollingRef}
            isInteracting={isInteracting}
            transcriptionStatus={transcriptionStatus}
            segments={segments}
            onHighlightClick={handleHighlightClick}
            onNoteCreate={handleNoteCreate}
            noteDeleteTrigger={noteDeleteTrigger}
          />
        </Box>


        {/* 右侧：笔记区域（30%） */}
        {/* 根据 isNoteSidebarExpanded 状态控制显示：展开时30%，收缩时0 */}
        <Box
          sx={{
            flex: { xs: '0 0 0', md: isNoteSidebarExpanded ? '0 0 30%' : '0 0 0' },
            width: { xs: 0, md: isNoteSidebarExpanded ? '30%' : 0 },
            maxWidth: { xs: 0, md: isNoteSidebarExpanded ? '30%' : 0 },
            px: 2,
            pt: 2,
            pb: 2,
            display: { xs: 'none', md: isNoteSidebarExpanded ? 'flex' : 'none' }, // 收缩时完全隐藏
            flexDirection: 'column',
            bgcolor: 'background.paper',
            overflow: 'visible',
            position: 'relative',
            boxSizing: 'border-box',
            zIndex: 1001, // 确保在音频播放器（zIndex 1000）之上，避免被遮罩覆盖
            transition: 'flex 0.15s ease-out, opacity 0.15s ease-out', // 只过渡 flex 和 opacity，移除 width 和 max-width 的过渡以避免与 flex 布局计算冲突
            opacity: isNoteSidebarExpanded ? 1 : 0, // 收缩时透明度为0
            pointerEvents: isNoteSidebarExpanded ? 'auto' : 'none', // 收缩时禁用交互
            willChange: 'flex, opacity', // 只优化 flex 和 opacity 属性
          }}
        >
          <NoteSidebar 
            ref={noteSidebarRef}
            episodeId={episodeId}
            onNoteClick={handleNoteClick}
            onNoteDelete={handleNoteDelete}
            isExpanded={isNoteSidebarExpanded}
            onExpandedChange={handleNoteSidebarExpandedChange}
            scrollContainerRef={mainScrollRef}
            cues={cues}
          />
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
          onFileImportClick={onFileImportClick}
        />
      )}

      {children}
    </Box>
  );
}

