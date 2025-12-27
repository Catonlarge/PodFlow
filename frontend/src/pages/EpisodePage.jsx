/**
 * EpisodePage 组件
 * 
 * Episode 详情页面，显示播客单集的完整信息
 * 
 * 功能描述：
 * - 从 URL 参数获取 episode_id
 * - 调用 API 获取 Episode 详情（包含字幕数据）
 * - 处理音频 URL（从 episode.audio_path 构建完整 URL）
 * - 轮询转录状态（如果正在转录）
 * - 错误处理和 Loading 状态
 * - 传递给 MainLayout 组件渲染
 * - 集成文件上传功能（首次打开逻辑、已选择逻辑、文件上传处理）
 * 
 * 相关PRD：
 * - PRD 6.2: 英文播客学习界面
 * - PRD 6.1.1: 音频和字幕选择弹框
 * - PRD 6.1.2: 音频处理逻辑和loading界面
 * 
 * @module pages/EpisodePage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Alert, Skeleton, Stack, Button, Typography } from '@mui/material';
import { UploadFile } from '@mui/icons-material';
import { subtitleService } from '../services/subtitleService';
import { episodeService } from '../services/episodeService';
import MainLayout from '../components/layout/MainLayout';
import FileImportModal from '../components/upload/FileImportModal';
import ProcessingOverlay from '../components/upload/ProcessingOverlay';
import api from '../api';

const LOCAL_STORAGE_KEY = 'podflow_last_episode_id';

export default function EpisodePage() {
  const { episodeId: urlEpisodeId } = useParams();
  const navigate = useNavigate();
  
  // 状态管理
  const [episodeId, setEpisodeId] = useState(urlEpisodeId);
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  
  // 文件上传相关状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingState, setProcessingState] = useState(null); // 'upload' | 'load' | 'recognize' | null
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingError, setProcessingError] = useState(null);

  // 从环境变量或 api.js 获取 Base URL（避免硬编码）
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || api.defaults.baseURL || 'http://localhost:8000';

  // 获取 Episode 数据
  const fetchEpisode = useCallback(async (targetEpisodeId, isInitialLoad = false) => {
    try {
      // 如果有 processingState（如 upload 或 recognize），不要显示 Loading 状态
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      
      const data = await subtitleService.getEpisode(targetEpisodeId);
      setEpisode(data);
      
      // 处理音频 URL
      if (data.audio_path) {
        const pathParts = data.audio_path.split(/[/\\]/);
        const filename = pathParts[pathParts.length - 1];
        const url = data.audio_path.startsWith('http') 
          ? data.audio_path 
          : new URL(`/static/audio/${filename}`, API_BASE_URL).href;
        setAudioUrl(url);
      }
      
      // 更新转录进度（如果正在转录）
      // 如果之前是 upload 状态，现在应该根据 episode 状态转换为 recognize 或清除
      if (data.transcription_status === 'processing' || data.transcription_status === 'pending') {
        setProcessingState('recognize');
        setUploadProgress(data.transcription_progress || 0);
      } else if (data.transcription_status === 'completed') {
        // 转录完成，清除 ProcessingOverlay
        setProcessingState(null);
        setUploadProgress(0);
      } else {
        // 其他状态（如 failed），只有在非初始加载时才清除（初始加载时由轮询 useEffect 处理）
        if (!isInitialLoad) {
          setProcessingState(null);
          setUploadProgress(0);
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [API_BASE_URL]);

  // 首次打开逻辑：检查 localStorage 或 URL 参数
  useEffect(() => {
    // 如果有 URL 参数，使用 URL 参数
    if (urlEpisodeId) {
      setEpisodeId(urlEpisodeId);
      fetchEpisode(urlEpisodeId, true);
    } 
    // 如果没有 URL 参数，检查 localStorage
    else {
      const savedEpisodeId = localStorage.getItem(LOCAL_STORAGE_KEY);
      
      // 如果有保存的 episodeId，自动加载
      if (savedEpisodeId) {
        setEpisodeId(savedEpisodeId);
        navigate(`/episodes/${savedEpisodeId}`, { replace: true });
        // 注意：navigate 会导致 urlEpisodeId 变化，会触发这个 useEffect 再次执行
        // 下次执行时 urlEpisodeId 会有值，所以不会再次跳转
      } 
      // 如果都没有，自动弹出文件选择弹窗
      else {
        setLoading(false);
        setIsModalOpen(true);
      }
    }
  }, [urlEpisodeId, navigate, fetchEpisode]);

  // 轮询转录状态（仅用于轮询，状态由 fetchEpisode 管理）
  useEffect(() => {
    if (!episode) {
      return;
    }

    // 如果转录完成，清除 ProcessingOverlay（fetchEpisode 中已处理，这里再次确认）
    if (episode.transcription_status === 'completed') {
      setProcessingState(null);
      setUploadProgress(0);
      return;
    }

    // 如果正在转录，启动轮询（状态已由 fetchEpisode 设置）
    if (episode.transcription_status === 'processing' || episode.transcription_status === 'pending') {
      // 轮询更新状态（每 3 秒）
      const interval = setInterval(() => {
        fetchEpisode(episodeId, false);
      }, 3000);

      return () => clearInterval(interval);
    } else {
      // 其他状态（如 failed），清除 ProcessingOverlay
      setProcessingState(null);
      setUploadProgress(0);
    }
  }, [episode, episodeId, fetchEpisode]);

  // 处理文件导入按钮点击
  const handleFileImportClick = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // 处理文件确认
  const handleFileConfirm = useCallback(async (files) => {
    const { audioFile } = files;
    
    // 关闭弹窗
    setIsModalOpen(false);
    
    // 设置上传状态
    setProcessingState('upload');
    setUploadProgress(0);
    setProcessingError(null);

    let progressInterval = null;

    try {
      // 使用音频文件名作为标题（如果后续需要，可以从 metadata 获取）
      const title = audioFile.name.replace(/\.[^/.]+$/, ''); // 移除文件扩展名
      
      // 模拟上传进度（实际可以使用真实的 upload progress event）
      progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            if (progressInterval) {
              clearInterval(progressInterval);
            }
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // 调用上传 API
      const response = await episodeService.uploadEpisode(audioFile, title, null);
      
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      // 检查是否为重复文件（秒传/去重逻辑）
      if (response.is_duplicate) {
        // 重复文件：立即完成，跳过转录等待
        setUploadProgress(100);
        
        // 保存 episodeId 到 localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, response.episode_id.toString());
        
        // 直接跳转（不等待动画）
        setTimeout(() => {
          setProcessingState(null);
          setUploadProgress(0);
          navigate(`/episodes/${response.episode_id}`);
        }, 300); // 短暂延迟，让用户看到进度完成
      } else {
        // 非重复文件：正常流程
        setUploadProgress(100);
        
        // 保存 episodeId 到 localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, response.episode_id.toString());
        
        // 检查转录状态（上传响应中的 status 字段）
        const transcriptionStatus = response.status || response.transcription_status;
        
        // 如果已完成，跳转前清除状态；否则保持 upload 状态，跳转后由 fetchEpisode 根据 episode 数据设置 recognize 状态
        if (transcriptionStatus === 'completed') {
          setProcessingState(null);
          setUploadProgress(0);
        }
        // 其他情况（如 processing）保持 upload 状态，跳转后由 fetchEpisode 处理
        
        // 跳转到 Episode 页面
        setTimeout(() => {
          navigate(`/episodes/${response.episode_id}`);
        }, 500);
      }
    } catch (err) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setProcessingError(err.response?.data?.detail || err.message || '上传失败，请重试');
      setProcessingState('upload');
    }
  }, [navigate]);

  // 处理文件导入弹窗关闭
  const handleModalClose = useCallback(() => {
    // 如果未选择音频文件且点击外部区域，FileImportModal 内部会处理闪烁提示
    // 这里只处理正常关闭
    setIsModalOpen(false);
  }, []);

  // 处理上传重试
  const handleUploadRetry = useCallback(() => {
    setProcessingError(null);
    setProcessingState(null);
    setUploadProgress(0);
    setIsModalOpen(true);
  }, []);

  // 错误处理
  if (error && episodeId) {
    const errorMessage = error.response?.status === 404 
      ? `Episode ${episodeId} 不存在`
      : error.response?.status === 500
      ? '服务器错误，请稍后重试'
      : error.message || '加载失败，请重试';
    
    return (
      <Box sx={{ p: 3 }}>
        <Alert 
          severity="error" 
          action={
            <Button onClick={() => fetchEpisode(episodeId, true)} size="small">
              重试
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      </Box>
    );
  }

  // Loading 状态（如果有 processingState，不显示 Loading，而是显示 processing-overlay）
  if (loading && episodeId && !processingState) {
    return (
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Skeleton variant="text" width="60%" height={40} />
          <Skeleton variant="rectangular" width="100%" height={200} />
        </Stack>
      </Box>
    );
  }

  // 空状态：没有选择音频文件
  if (!episodeId) {
    return (
      <>
        <MainLayout>
          <Box
            sx={{
              position: 'fixed',
              top: 80, // Header height
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
                onClick={handleFileImportClick}
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
          
          {/* 文件导入弹窗 */}
          <FileImportModal
            open={isModalOpen}
            onClose={handleModalClose}
            onConfirm={handleFileConfirm}
          />
        </MainLayout>
        
        {/* 处理进度遮罩（空状态时也需要显示） */}
        {processingState && (
          <ProcessingOverlay
            type={processingState}
            progress={uploadProgress}
            error={processingError}
            onRetry={processingError ? handleUploadRetry : null}
          />
        )}
      </>
    );
  }

  // 正常渲染：有 episodeId（可能有数据，也可能在加载中但有 processingState）
  return (
    <>
      {(episode || !loading || processingState) && (
        <MainLayout
          episodeTitle={episode?.title}
          showName={episode?.show_name || '本地音频'}
          audioUrl={audioUrl}
          episodeId={episodeId}
          onFileImportClick={handleFileImportClick}
          transcriptionStatus={episode?.transcription_status}
        />
      )}
      
      {/* 文件导入弹窗 */}
      <FileImportModal
        open={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleFileConfirm}
      />
      
      {/* 处理进度遮罩 */}
      {processingState && (
        <ProcessingOverlay
          type={processingState}
          progress={uploadProgress}
          error={processingError}
          onRetry={processingError ? handleUploadRetry : null}
        />
      )}
    </>
  );
}
