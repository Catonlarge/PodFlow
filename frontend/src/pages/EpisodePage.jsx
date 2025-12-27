/**
 * EpisodePage 组件
 * 
 * Episode 详情页面，显示播客单集的完整信息
 * 
 * 功能描述：
 * - 从 URL 参数获取 episode_id
 * - 使用 useEpisodeWorkflow Hook 管理业务逻辑
 * - 根据状态渲染不同的 UI（错误、Loading、空状态、正常界面）
 * 
 * 相关PRD：
 * - PRD 6.2: 英文播客学习界面
 * - PRD 6.1.1: 音频和字幕选择弹框
 * - PRD 6.1.2: 音频处理逻辑和loading界面
 * 
 * @module pages/EpisodePage
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Alert, Skeleton, Stack, Button, Typography } from '@mui/material';
import { UploadFile } from '@mui/icons-material';
import { useEpisodeWorkflow } from '../hooks/useEpisodeWorkflow';
import MainLayout from '../components/layout/MainLayout';
import FileImportModal from '../components/upload/FileImportModal';
import ProcessingOverlay from '../components/upload/ProcessingOverlay';

export default function EpisodePage() {
  const { episodeId: urlEpisodeId } = useParams();
  
  // 使用 Hook 管理所有业务逻辑
  const { state, actions } = useEpisodeWorkflow(urlEpisodeId);
  
  // 本地 UI 状态（弹窗开关）
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 解构状态以便使用
  const { episode, segments, loading, error, audioUrl, processing, episodeId } = state;

  // --- UI 渲染分支 ---

  // 分支 1: 致命错误
  if (error && episodeId) {
    const errorMessage = error.response?.status === 404 
      ? `Episode ${episodeId} 不存在`
      : error.response?.status === 500
      ? '服务器错误，请稍后重试'
      : error.message || '加载失败，请重试';
    
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {errorMessage}
        </Alert>
      </Box>
    );
  }

  // 分支 2: 首次加载且无处理状态 (Skeleton)
  // 注意：如果正在 processing（比如 recognize），我们希望显示 MainLayout + Overlay，而不是 Skeleton
  if (loading && !processing.status && !episode) {
    return (
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Skeleton variant="text" width="60%" height={40} />
          <Skeleton variant="rectangular" width="100%" height={200} />
        </Stack>
      </Box>
    );
  }

  // 分支 3: 空状态 (没有 Episode ID)
  if (!episodeId && !loading) {
    return (
      <>
        <MainLayout>
          <Box
            sx={{
              position: 'fixed',
              top: 80,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'background.default',
            }}
          >
            <Stack spacing={3} alignItems="center">
              <Typography variant="h6" color="text.secondary">
                您还未选择音频文件，点击按钮进行选择
              </Typography>
              <Button
                variant="contained"
                startIcon={<UploadFile />}
                onClick={() => setIsModalOpen(true)}
                sx={{
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                  },
                }}
              >
                音频和字幕选择
              </Button>
            </Stack>
          </Box>
        </MainLayout>
        
        {/* 文件导入弹窗 */}
        <FileImportModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={(files) => {
            setIsModalOpen(false);
            actions.upload(files);
          }}
        />

        {/* 处理上传时的 Overlay */}
        {processing.status === 'upload' && (
          <ProcessingOverlay
            type="upload"
            progress={processing.progress}
            error={processing.error}
            onRetry={processing.error ? actions.retryUpload : null}
          />
        )}
      </>
    );
  }

  // 分支 4: 正常主界面 (可能包含 Overlay)
  return (
    <>
      {(episode || !loading || processing.status) && (
        <MainLayout
          episodeTitle={episode?.title}
          showName={episode?.show_name || '本地音频'}
          audioUrl={audioUrl}
          episodeId={episodeId}
          onFileImportClick={() => setIsModalOpen(true)}
          transcriptionStatus={episode?.transcription_status}
          segments={segments}
          cues={episode?.cues || null}
        />
      )}
      
      {/* 文件导入弹窗 */}
      <FileImportModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={(files) => {
          setIsModalOpen(false);
          actions.upload(files);
        }}
      />
      
      {/* 统一的 Overlay 处理 (Upload 或 Recognize) */}
      {processing.status && (
        <ProcessingOverlay
          type={processing.status}
          progress={processing.progress}
          error={processing.error}
          isPaused={processing.isPaused}
          onRetry={processing.error ? actions.retryUpload : null}
          onTogglePause={processing.status === 'recognize' ? actions.togglePause : null}
        />
      )}
    </>
  );
}
