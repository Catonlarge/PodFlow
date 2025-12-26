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
  // 定义常量，方便维护
  const HEADER_HEIGHT = 80; // 与 EpisodeHeader 中的 height 保持一致
  const PLAYER_HEIGHT = 90; // 预估底部播放器的高度（根据 AudioBar 实际情况调整）

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

      {/* 主体区域：左右分栏 */}
      <Box
        component="main"
        sx={{
          marginTop: `${HEADER_HEIGHT}px`,
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          width: '100%',
          display: 'flex',
        }}
      >
        {/* 左侧：英文字幕区域 */}
        <Box
          sx={{
            flex: { xs: '1 1 100%', md: '0 0 58.33%' },
            height: '100%',
            overflowY: 'auto',
            borderRight: { md: 1 },
            borderColor: 'divider',
            px: 2,
            pt: 2,
            pb: audioUrl ? `${PLAYER_HEIGHT + 20}px` : 2,
          }}
        >
          <SubtitleList />
        </Box>

        {/* 右侧：笔记区域 */}
        <Box
          sx={{
            flex: { xs: '1 1 100%', md: '0 0 41.67%' },
            height: '100%',
            overflowY: 'auto',
            px: 2,
            pt: 2,
            pb: audioUrl ? `${PLAYER_HEIGHT + 20}px` : 2,
            display: { xs: 'none', md: 'block' },
            bgcolor: 'background.paper',
          }}
        >
          <NoteSidebar />
        </Box>
      </Box>

      {/* 底部：音频控制面板 */}
      {audioUrl && (
        <AudioBarContainer audioUrl={audioUrl} />
      )}

      {children}
    </Box>
  );
}

