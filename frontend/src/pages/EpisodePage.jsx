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

  // 从环境变量或 api.js 获取 Base URL（避免硬编码）
  // 优先使用环境变量，否则从 api 实例获取 baseURL，最后使用默认值
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || api.defaults.baseURL || 'http://localhost:8000';

  // 获取 Episode 数据
  // 注意：只有在没有数据时才全页 Loading，避免轮询时页面闪烁
  const fetchEpisode = useCallback(async (isInitialLoad = false) => {
    try {
      // 只有在首次加载时才显示全页 Loading
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      
      const data = await subtitleService.getEpisode(episodeId);
      setEpisode(data);
      
      // 处理音频 URL（健壮的 URL 拼接）
      if (data.audio_path) {
        // 从 audio_path 中提取文件名（file_hash + extension）
        // audio_path 可能是绝对路径（Windows: D:\...\data\audios\xxx.mp3）或相对路径（./data/audios/xxx.mp3）
        const pathParts = data.audio_path.split(/[/\\]/);
        const filename = pathParts[pathParts.length - 1];
        // 如果 audio_path 已经是完整 URL，直接使用；否则拼接
        const url = data.audio_path.startsWith('http') 
          ? data.audio_path 
          : new URL(`/static/audio/${filename}`, API_BASE_URL).href;
        setAudioUrl(url);
      }
    } catch (err) {
      setError(err);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [episodeId, API_BASE_URL]);

  // 初始加载
  useEffect(() => {
    if (episodeId) {
      fetchEpisode(true); // 首次加载，显示 Loading
    }
  }, [episodeId, fetchEpisode]);

  // 轮询转录状态
  // 优化：直接复用 fetchEpisode 进行轮询，避免调用可能不存在的 /status 接口
  useEffect(() => {
    if (!episode || episode.transcription_status === 'completed') {
      return;
    }

    const interval = setInterval(() => {
      // 轮询时调用 fetchEpisode，但不显示全页 Loading（isInitialLoad=false）
      fetchEpisode(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [episode?.transcription_status, fetchEpisode]);

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
            <Button onClick={() => fetchEpisode(true)} size="small">
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
  // 关键：必须传递 episodeId，以便 MainLayout 传给 SubtitleList 加载字幕
  return (
    <MainLayout
      episodeTitle={episode.title}
      showName={episode.show_name || '本地音频'}
      audioUrl={audioUrl}
      episodeId={episodeId}
    />
  );
}

