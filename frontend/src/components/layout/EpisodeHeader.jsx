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
 * 优化点：
 * 1. 增加了文本溢出处理 (noWrap)，防止长标题导致 Header 高度不可控
 * 2. 确保高度稳定性，配合 Layout 进行计算
 * 3. 使用 Tooltip 在标题被截断时显示完整内容
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
import { Box, Typography, Tooltip } from '@mui/material';

export default function EpisodeHeader({ episodeTitle, showName }) {
  return (
    <Box
      component="header"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        backgroundColor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        height: '80px',
        minHeight: '80px',
        maxHeight: '80px',
        px: 3,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.5,
          width: '100%',
        }}
      >
        {showName && (
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{
              fontSize: '0.875rem',
              fontWeight: 400,
              maxWidth: '100%',
            }}
          >
            {showName}
          </Typography>
        )}
        
        <Tooltip title={episodeTitle || '未选择播客'} placement="bottom-start">
          <Typography
            variant="h6"
            component="h1"
            noWrap
            sx={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: episodeTitle ? 'text.primary' : 'text.secondary',
              maxWidth: '100%',
              cursor: 'default',
            }}
          >
            {episodeTitle || '未选择播客'}
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}

