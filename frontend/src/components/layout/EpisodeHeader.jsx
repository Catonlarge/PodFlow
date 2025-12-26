/**
 * EpisodeHeader 组件
 * 
 * 播客信息头部组件，固定在屏幕顶层矩形区域
 * 
 * 功能描述：
 * - 显示播客 episode 的名称和 show/channel 的名称
 * - 靠左展示基础信息
 * - 传播功能（分享、收藏按钮）暂时不实现，留作占位
 * 
 * 相关PRD：
 * - PRD 6.2.2: 播客源数据展示模块
 * 
 * @module components/layout/EpisodeHeader
 * 
 * @param {Object} props
 * @param {string} [props.episodeTitle] - 播客 episode 的名称
 * @param {string} [props.showName] - episode 归属的 show/channel 名称
 */
import { Box, Typography } from '@mui/material';

export default function EpisodeHeader({ episodeTitle, showName }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        px: 3,
        py: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.5,
        }}
      >
        {showName && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: '0.875rem',
              fontWeight: 400,
            }}
          >
            {showName}
          </Typography>
        )}
        {episodeTitle ? (
          <Typography
            variant="h6"
            component="h1"
            sx={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'text.primary',
            }}
          >
            {episodeTitle}
          </Typography>
        ) : (
          <Typography
            variant="h6"
            component="h1"
            sx={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            未选择播客
          </Typography>
        )}
      </Box>
    </Box>
  );
}

