/**
 * ProcessingOverlay 组件
 * 
 * 进度遮罩组件，用于显示文件处理进度
 * 
 * 功能描述：
 * - 显示文件处理进度遮罩（音频上传、字幕加载、字幕识别）
 * - 显示处理状态和进度条
 * - 支持错误处理和重试
 * - 支持字幕识别的暂停/继续控制
 * 
 * 相关PRD：
 * - PRD 6.1.2: 音频处理逻辑和loading界面（159-192行）
 * 
 * @module components/upload/ProcessingOverlay
 */

import { Box, Typography, LinearProgress, IconButton, Stack } from '@mui/material';
import { Refresh, Stop, PlayArrow } from '@mui/icons-material';

/**
 * ProcessingOverlay 组件 Props
 * 
 * @param {string} type - 处理类型：'upload' | 'load' | 'recognize'
 * @param {number} progress - 进度值（0-100）
 * @param {string|null} error - 错误信息（可选）
 * @param {number} audioDuration - 音频时长（秒），用于计算进度（可选）
 * @param {boolean} isPaused - 是否暂停（仅用于 recognize 类型）
 * @param {Function} onRetry - 重试回调（可选）
 * @param {Function} onCancel - 取消回调（可选）
 * @param {Function} onTogglePause - 暂停/继续切换回调（仅用于 recognize 类型，可选）
 */
export default function ProcessingOverlay({
  type,
  progress,
  error = null,
  isPaused = false,
  onRetry = null,
  onTogglePause = null,
}) {
  // 根据类型获取提示文字
  const getMessage = () => {
    if (error) {
      const typeMap = {
        upload: '上传',
        load: '加载',
        recognize: '识别',
      };
      return `${typeMap[type]}失败，错误原因：${error}，请重试`;
    }

    const messageMap = {
      upload: '请稍等，音频上传中',
      load: '请稍等，字幕加载中',
      recognize: '请稍等，努力识别字幕中',
    };
    return messageMap[type] || '处理中...';
  };

  // 渲染错误状态
  if (error) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        <Box
          sx={{
            backgroundColor: 'background.paper',
            borderRadius: 2,
            padding: 3,
            minWidth: 400,
            maxWidth: 600,
            textAlign: 'center',
          }}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            {getMessage()}
          </Typography>
          {onRetry && (
            <IconButton
              onClick={onRetry}
              aria-label="重试"
              sx={{
                '&:hover': { bgcolor: 'action.hover' },
                '&:active': { transform: 'scale(0.95)' },
              }}
            >
              <Refresh />
            </IconButton>
          )}
        </Box>
      </Box>
    );
  }

  // 渲染正常进度状态
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <Box
        sx={{
          backgroundColor: 'background.paper',
          borderRadius: 2,
          padding: 3,
          minWidth: 400,
          maxWidth: 600,
        }}
      >
        <Stack spacing={2}>
          <Typography variant="body1" sx={{ textAlign: 'center' }}>
            {getMessage()}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'primary.main',
                  },
                }}
              />
            </Box>
            
            {/* 仅 recognize 类型显示控制按钮 */}
            {type === 'recognize' && onTogglePause && (
              <IconButton
                onClick={onTogglePause}
                aria-label={isPaused ? '继续识别' : '暂停识别'}
                sx={{
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              >
                {isPaused ? <PlayArrow /> : <Stop />}
              </IconButton>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
