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
 * @param {React.ReactNode} [props.children] - 可选，用于未来扩展
 */
import { Box } from '@mui/material';
import EpisodeHeader from './EpisodeHeader';
import SubtitleList from '../subtitles/SubtitleList';
import NoteSidebar from '../notes/NoteSidebar';
import AudioBarContainer from '../player/AudioBarContainer';

export default function MainLayout({ 
  episodeTitle, 
  showName, 
  audioUrl,
  children 
}) {
  // 计算顶部高度（EpisodeHeader 的高度）
  // 根据 EpisodeHeader 的样式：py: 2 (16px * 2) + Typography 高度（约 48px）
  const headerHeight = 80;
  
  // 根据 PRD 6.2.1，主体区域（英文字幕区域）需要占屏幕的 90%
  // EpisodeHeader 固定在顶部，不占用主体区域空间
  // 主体区域从 EpisodeHeader 下方开始，高度为 90vh
  const contentHeight = '90vh';

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        position: 'relative',
      }}
    >
      {/* 顶部：播客信息头部（固定，不占用主体区域空间） */}
      <EpisodeHeader 
        episodeTitle={episodeTitle}
        showName={showName}
      />

      {/* 主体区域：左右分栏（英文字幕 + 笔记），占屏幕 90% */}
      <Box
        sx={{
          marginTop: `${headerHeight}px`,
          height: contentHeight,
          width: '100%',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* 左侧：英文字幕区域 */}
        <Box
          sx={{
            flex: { xs: '1 1 100%', md: '0 0 58.33%' }, // md: 7/12 = 58.33%
            height: '100%',
            overflowY: 'auto',
            borderRight: { md: 1 },
            borderColor: 'divider',
            px: 2,
            py: 2,
          }}
        >
          <SubtitleList />
        </Box>

        {/* 右侧：笔记区域 */}
        <Box
          sx={{
            flex: { xs: '1 1 100%', md: '0 0 41.67%' }, // md: 5/12 = 41.67%
            height: '100%',
            overflowY: 'auto',
            px: 2,
            py: 2,
            display: { xs: 'none', md: 'block' }, // 移动端隐藏，桌面端显示
          }}
        >
          <NoteSidebar />
        </Box>
      </Box>

      {/* 底部：音频控制面板（固定悬浮，不占用主体区域空间） */}
      {audioUrl && (
        <AudioBarContainer audioUrl={audioUrl} />
      )}

      {/* 可选的子元素（用于未来扩展） */}
      {children}
    </Box>
  );
}

