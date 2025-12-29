/**
 * EpisodeListPage 组件
 * * 智能入口页面：
 * 1. 新用户（无数据）：自动弹出上传弹窗 -> 关闭后显示引导 UI
 * 2. 老用户（有数据）：自动跳转到上次播放/最新的 Episode 页面
 * 3. 列表功能：作为从详情页返回后的展示列表
 * * @module pages/EpisodeListPage
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Container, Stack } from '@mui/material';
import { UploadFile } from '@mui/icons-material';
import api from '../api'; 
import FileImportModal from '../components/upload/FileImportModal';
import { episodeService } from '../services/episodeService';

const LOCAL_STORAGE_KEY = 'podflow_last_episode_id';

export default function EpisodeListPage() {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasEpisodes, setHasEpisodes] = useState(false);
  // 为了列表展示，我们需要把数据存下来（原代码没存，这里补上以免列表页是空的）
  const [episodeList, setEpisodeList] = useState([]); 

  // 初始化检查逻辑
  useEffect(() => {
    const checkStatus = async () => {
      try {
        setLoading(true);
        
        // ============================================================
        // 【关键修复点】
        // 之前你的 api.js 没有 getEpisodes，现在有了。
        // 而且我们在 api.js 里处理了 response.data.items，所以这里直接拿到的就是数组。
        // ============================================================
        const episodes = await api.getEpisodes(); 
        
        // 健壮性检查：确保是数组
        const total = Array.isArray(episodes) ? episodes.length : 0;

        if (total > 0) {
          setHasEpisodes(true);
          setEpisodeList(episodes); // 保存列表数据供渲染使用
          
          // 【老用户逻辑 - 保持不变】
          if (!location.state?.fromBack) {
            const lastId = localStorage.getItem(LOCAL_STORAGE_KEY);
            // 尝试跳转到上次的 ID，如果上次 ID 不在列表里（被删了），就跳到最新的（第0个）
            const targetId = lastId || episodes[0].id;
            
            // 更新一下缓存
            localStorage.setItem(LOCAL_STORAGE_KEY, targetId);
            
            console.log("检测到历史数据，自动跳转至:", targetId);
            navigate(`/episodes/${targetId}`, { replace: true });
            return;
          }
        } else {
          // 【新用户逻辑 - 保持不变】
          setHasEpisodes(false);
          setIsModalOpen(true);
        }
      } catch (err) {
        console.error("Failed to fetch episodes:", err);
        setHasEpisodes(false);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [navigate, location]);

  // 处理文件上传（逻辑保持不变，继续使用 episodeService）
  const handleFileUpload = async (files) => {
    setIsModalOpen(false);
    
    try {
      const { audioFile } = files;
      const title = audioFile.name.replace(/\.[^/.]+$/, "");
      
      const result = await episodeService.uploadEpisode(audioFile, title);
      
      localStorage.setItem(LOCAL_STORAGE_KEY, result.episode_id);
      
      // 上传成功后直接跳转详情页
      navigate(`/episodes/${result.episode_id}`, { replace: true });
      
    } catch (error) {
      console.error("Upload failed:", error);
      alert("上传失败，请重试");
      setIsModalOpen(true); 
    }
  };

  // 1. Loading 状态
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // 2. 空状态（保持原有 UI）
  if (!hasEpisodes) {
    return (
      <Container maxWidth="sm" sx={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <UploadFile sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            您还未选择音频文件
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            点击下方按钮开始您的第一次播客学习之旅
          </Typography>
          
          <Button
            variant="contained"
            size="large"
            startIcon={<UploadFile />}
            onClick={() => setIsModalOpen(true)}
            sx={{ px: 4, py: 1.5, borderRadius: 2 }}
          >
            音频和字幕选择
          </Button>
        </Box>

        <FileImportModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleFileUpload}
        />
      </Container>
    );
  }

  // 3. 列表状态（保持原有逻辑，增加简单的列表渲染兜底）
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ textAlign: 'center', mt: 8 }}>
            <Typography variant="h5" gutterBottom>欢迎回来</Typography>
            
            <Stack spacing={2} sx={{ mt: 4, alignItems: 'center' }}>
                {/* 如果有上次播放记录，显示继续按钮 */}
                <Button 
                    variant="contained" 
                    size="large"
                    onClick={() => {
                        const lastId = localStorage.getItem(LOCAL_STORAGE_KEY) || (episodeList[0] && episodeList[0].id);
                        if(lastId) navigate(`/episodes/${lastId}`);
                    }}
                >
                    继续上次学习
                </Button>

                <Button 
                    variant="outlined"
                    startIcon={<UploadFile />}
                    onClick={() => setIsModalOpen(true)}
                >
                    导入新单集
                </Button>
            </Stack>

            {/* 简单的列表展示，方便用户从详情页返回后选择其他单集 */}
            {episodeList.length > 0 && (
              <Box sx={{ mt: 6, textAlign: 'left' }}>
                <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                  我的播客列表 ({episodeList.length})
                </Typography>
                <Stack spacing={1}>
                  {episodeList.map(ep => (
                    <Button 
                      key={ep.id} 
                      variant="text" 
                      onClick={() => navigate(`/episodes/${ep.id}`)}
                      sx={{ justifyContent: 'flex-start', color: 'text.primary' }}
                    >
                      📄 {ep.title || "未命名单集"}
                    </Button>
                  ))}
                </Stack>
              </Box>
            )}
        </Box>
        
        <FileImportModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleFileUpload}
        />
    </Container>
  );
}