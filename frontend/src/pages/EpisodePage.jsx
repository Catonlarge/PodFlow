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
 * 
 * 相关PRD：
 * - PRD 6.2: 英文播客学习界面
 * 
 * @module pages/EpisodePage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Alert, Skeleton, Stack, Button } from '@mui/material';
import { subtitleService } from '../services/subtitleService';
import MainLayout from '../components/layout/MainLayout';
import api from '../api';

export default function EpisodePage() {
  const { episodeId } = useParams();
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  // 获取 Episode 数据
  const fetchEpisode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await subtitleService.getEpisode(episodeId);
      setEpisode(data);
      
      // 处理音频 URL
      if (data.audio_path) {
        const baseUrl = 'http://localhost:8000';
        // 从 audio_path 中提取文件名（file_hash + extension）
        // audio_path 可能是绝对路径（Windows: D:\...\data\audios\xxx.mp3）或相对路径（./data/audios/xxx.mp3）
        const pathParts = data.audio_path.split(/[/\\]/);
        const filename = pathParts[pathParts.length - 1];
        // 构建静态文件 URL: /static/audio/{filename}
        const url = `${baseUrl}/static/audio/${filename}`;
        setAudioUrl(url);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  // 初始加载
  useEffect(() => {
    if (episodeId) {
      fetchEpisode();
    }
  }, [episodeId, fetchEpisode]);

  // 轮询转录状态
  useEffect(() => {
    if (!episode || episode.transcription_status !== 'processing') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const statusResponse = await api.get(`/api/episodes/${episodeId}/status`);
        setEpisode(prev => ({
          ...prev,
          transcription_status: statusResponse.transcription_status,
          transcription_progress: statusResponse.transcription_progress,
        }));

        if (statusResponse.transcription_status === 'completed') {
          fetchEpisode();
          clearInterval(interval);
        }
      } catch (err) {
        console.error('[EpisodePage] 轮询状态失败:', err);
      }
    }, 3000); // 每 3 秒轮询一次

    return () => clearInterval(interval);
  }, [episode, episodeId, fetchEpisode]);

  // 错误处理
  if (error) {
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
            <Button onClick={fetchEpisode} size="small">
              重试
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      </Box>
    );
  }

  // Loading 状态
  if (loading || !episode) {
    return (
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Skeleton variant="text" width="60%" height={40} />
          <Skeleton variant="rectangular" width="100%" height={200} />
        </Stack>
      </Box>
    );
  }

  // 正常渲染
  return (
    <MainLayout
      episodeTitle={episode.title}
      showName={episode.show_name || '本地音频'}
      audioUrl={audioUrl}
    />
  );
}

