/**
 * EpisodeListPage 组件
 * 
 * Episode 列表页面，显示所有可用的 Episode
 * 
 * 功能描述：
 * - 从 API 获取 Episode 列表
 * - 显示 Episode 卡片（标题、时长、状态等）
 * - 点击卡片跳转到 Episode 详情页
 * 
 * @module pages/EpisodeListPage
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Stack, Skeleton, Alert, Button, Chip } from '@mui/material';
import api from '../api';

export default function EpisodeListPage() {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEpisodes = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get('/api/episodes?page=1&limit=20');
        setEpisodes(response.items || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchEpisodes();
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Skeleton variant="text" width="60%" height={40} />
          <Skeleton variant="rectangular" width="100%" height={200} />
          <Skeleton variant="rectangular" width="100%" height={200} />
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          加载 Episode 列表失败，请检查后端服务是否运行
        </Alert>
      </Box>
    );
  }

  if (episodes.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          暂无 Episode
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          请先通过后端 API 上传音频文件创建 Episode
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          API 端点：POST /api/episodes/upload
        </Typography>
      </Box>
    );
  }

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'processing':
        return 'info';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Episode 列表
      </Typography>
      
      <Stack spacing={2} sx={{ mt: 3 }}>
        {episodes.map((episode) => (
          <Card
            key={episode.id}
            sx={{
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
            onClick={() => navigate(`/episodes/${episode.id}`)}
          >
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    {episode.title}
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      时长: {formatDuration(episode.duration)}
                    </Typography>
                    <Chip
                      label={episode.transcription_status}
                      color={getStatusColor(episode.transcription_status)}
                      size="small"
                    />
                    {episode.transcription_progress !== undefined && (
                      <Typography variant="body2" color="text.secondary">
                        进度: {episode.transcription_progress.toFixed(1)}%
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/episodes/${episode.id}`);
                  }}
                >
                  查看
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

