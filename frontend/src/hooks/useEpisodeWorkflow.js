/**
 * useEpisodeWorkflow Hook
 * 
 * 核心业务逻辑 Hook
 * 职责：
 * 1. 管理 Episode 数据的加载与轮询
 * 2. 管理文件上传过程与模拟进度条 (PRD 6.1.2)
 * 3. 管理字幕识别状态与进度条模拟
 * 4. 决定何时显示 Loading、Overlay 还是 MainLayout
 * 5. 处理状态机逻辑（上传 -> 识别 -> 分段检查 -> 完成）
 * 
 * 相关PRD：
 * - PRD 6.1.2: 音频处理逻辑和loading界面
 * - PRD 6.2: 英文播客学习界面
 * 
 * @module hooks/useEpisodeWorkflow
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { subtitleService } from '../services/subtitleService';
import { episodeService } from '../services/episodeService';
import { readAudioDuration } from '../utils/fileUtils';

const LOCAL_STORAGE_KEY = 'podflow_last_episode_id';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const useEpisodeWorkflow = (urlEpisodeId) => {
  const navigate = useNavigate();
  const [episodeId, setEpisodeId] = useState(urlEpisodeId);
  const [episode, setEpisode] = useState(null);
  const [segments, setSegments] = useState([]);
  
  // 页面级状态
  const [loading, setLoading] = useState(!!urlEpisodeId);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  // 流程控制状态 (Overlay 相关)
  const [processingState, setProcessingState] = useState(null); 
  const [progress, setProgress] = useState(0);
  const [processingError, setProcessingError] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  
  const progressIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const justNavigatedRef = useRef(false);
  const navigateTimeRef = useRef(null);

  // --- 辅助：进度条模拟器 ---
  const startFakeProgress = useCallback((durationMs) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    const startTime = Date.now();
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const nextProgress = Math.min((elapsed / durationMs) * 100, 99);
      setProgress(nextProgress);
      
      if (nextProgress >= 99 && progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }, 100);
  }, []);

  const stopFakeProgress = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // --- 核心：获取数据与状态判断 ---
  const fetchEpisodeData = useCallback(async (targetId, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      // 注意：轮询时不应清除 error，否则如果中途失败一次会导致 UI 闪烁
      // setError(null); 
      
      const data = await subtitleService.getEpisode(targetId);
      setEpisode(data);

      if (data.audio_path) {
        const pathParts = data.audio_path.split(/[/\\]/);
        const filename = pathParts[pathParts.length - 1];
        const url = data.audio_path.startsWith('http') 
          ? data.audio_path 
          : new URL(`/static/audio/${filename}`, API_BASE_URL).href;
        setAudioUrl(url);
      }

      const timeSinceNavigate = navigateTimeRef.current ? Date.now() - navigateTimeRef.current : Infinity;
      const shouldKeepRecognizeAfterNavigate = justNavigatedRef.current && timeSinceNavigate < 2000;

      // 获取 Segments（即使transcription_status是completed，也要获取segments以检查是否有processing的segments）
      let currentSegments = [];
      try {
        currentSegments = await subtitleService.getEpisodeSegments(targetId);
        setSegments(currentSegments || []);
      } catch (err) {
        setSegments([]);
      }

      // 检查是否所有segments都已完成
      const hasProcessingSegments = currentSegments && currentSegments.length > 0 && currentSegments.some(s => s.status === 'processing' || s.status === 'pending');
      
      // 如果完全完成（transcription_status是completed，且所有segments都已完成，且有cues）
      if (data.transcription_status === 'completed' && data.cues && data.cues.length > 0 && !hasProcessingSegments) {
        if (!shouldKeepRecognizeAfterNavigate) {
          setProcessingState(null);
          setProgress(0);
          stopFakeProgress();
          setIsPaused(false);
        }
        return; // 完成后直接返回，不由后续逻辑处理
      }

      const status = data.transcription_status;
      const firstSegment = Array.isArray(currentSegments) && currentSegments.length > 0
        ? currentSegments.find(s => s.segment_index === 0) 
        : null;
      const firstSegmentDone = firstSegment?.status === 'completed';

      // 状态机逻辑
      if (status === 'processing' || status === 'pending') {
        if (status === 'processing') setIsPaused(false);
        else if (status === 'pending') setIsPaused(true);
        
        const shouldKeepRecognize = justNavigatedRef.current && firstSegmentDone && timeSinceNavigate < 2000;
        
        // 如果第一段已完成，隐藏遮罩让用户开始播放
        if (firstSegmentDone && !shouldKeepRecognize) {
          setProcessingState(null);
          setProgress(0);
          stopFakeProgress();
        } else {
          // 第一段未完成，或者为了防闪烁保持显示
          setProcessingState('recognize');
          // 如果后端有真实进度，优先使用
          if (data.transcription_progress > 0) {
             stopFakeProgress(); // 停止模拟
             setProgress(data.transcription_progress);
          } else if (!progressIntervalRef.current && progress === 0) {
            // 否则启动模拟
            const segmentDuration = firstSegment ? firstSegment.duration : 180;
            startFakeProgress(segmentDuration * 0.1 * 1000);
          }
        }
        
        if (justNavigatedRef.current && timeSinceNavigate >= 2000) {
          justNavigatedRef.current = false;
          navigateTimeRef.current = null;
        }
      } else if (status === 'failed') {
        // 如果是失败状态，停止进度条，但 Overlay 保持显示（由 ProcessingOverlay 的 error 属性控制）
        // 这里不需要 setProcessingState(null)，因为我们需要显示错误信息
        stopFakeProgress();
      }

    } catch (err) {
      setError(err);
      setLoading(false);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [startFakeProgress, stopFakeProgress]);

  // --- Effect: 首次加载 ---
  useEffect(() => {
    if (!episodeId) return;
    fetchEpisodeData(episodeId, true);
  }, [episodeId, fetchEpisodeData]);

  // --- Effect: 轮询逻辑 ---
  useEffect(() => {
    if (!episode) return;

    // 只要不是 completed，且不是 failed (failed 由用户手动重试触发)，就持续轮询
    // 关键：防止 failed 状态下轮询导致的 UI 闪烁
    // 另外：即使 episode.transcription_status 是 completed，如果还有 segments 处于 processing 状态，也应该继续轮询
    const hasProcessingSegments = segments && segments.length > 0 && segments.some(s => s.status === 'processing' || s.status === 'pending');
    const shouldPoll = 
      episode.transcription_status === 'processing' || 
      episode.transcription_status === 'pending' ||
      (episode.transcription_status === 'completed' && hasProcessingSegments);

    if (shouldPoll) {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => {
          fetchEpisodeData(episodeId, false);
        }, 3000);
      }
    } else {
      // 停止轮询
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      // 只有在 completed 时才关闭遮罩，failed 时保持遮罩以显示错误
      if (episode.transcription_status === 'completed') {
        // 再次检查 cues，确保数据完整
        if (episode.cues && episode.cues.length > 0) {
            setProcessingState(null);
        }
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [episode, episodeId, fetchEpisodeData]);

  // --- 恢复未完成任务 ---
  useEffect(() => {
    if (!episodeId || !episode) return;
    
    // 只有明确是处理中状态才去尝试恢复
    if (episode.transcription_status === 'processing' || episode.transcription_status === 'pending') {
        const checkAndRecover = async () => {
            try {
                const segmentsData = await subtitleService.getEpisodeSegments(episodeId);
                if (!Array.isArray(segmentsData)) return;
                
                const incompleteSegments = segmentsData.filter(
                s => s.status === 'pending' || (s.status === 'failed' && s.retry_count < 3)
                );
                
                if (incompleteSegments.length > 0) {
                await subtitleService.recoverIncompleteSegments(episodeId);
                }
            } catch (err) { }
        };
        checkAndRecover();
    }
  }, [episodeId, episode]); // 依赖项保持

  // --- Action: 上传 ---
  const handleUpload = useCallback(async (files) => {
    const { audioFile, enableTranscription } = files;
    
    if (enableTranscription) {
      setProcessingState('recognize');
      setProgress(0);
      setProcessingError(null);
    } else {
      setProcessingState('upload');
      setProgress(0);
      setProcessingError(null);
    }

    try {
      let duration = 180;
      try { duration = await readAudioDuration(audioFile); } catch (e) {}
      startFakeProgress(duration * 0.1 * 1000);

      const title = audioFile.name.replace(/\.[^/.]+$/, '');
      const response = await episodeService.uploadEpisode(audioFile, title, null);

      setProgress(100);
      stopFakeProgress();

      const newId = response.episode_id.toString();
      localStorage.setItem(LOCAL_STORAGE_KEY, newId);
      
      const transcriptionStatus = response.status || response.transcription_status;
      
      if (response.is_duplicate && newId === episodeId) {
        fetchEpisodeData(newId, false);
      } else {
        if (transcriptionStatus === 'processing' || transcriptionStatus === 'pending') {
          setProcessingState('recognize');
          setProgress(0);
        } else {
          setProcessingState(null);
          setProgress(0);
        }
        
        setEpisodeId(newId);
        setEpisode(null);
        setAudioUrl(null);
        justNavigatedRef.current = true;
        navigateTimeRef.current = Date.now();
        navigate(`/episodes/${newId}`, { replace: true });
      }

    } catch (err) {
      stopFakeProgress();
      setProcessingError(err.response?.data?.detail || err.message || '上传失败');
    }
  }, [episodeId, navigate, startFakeProgress, stopFakeProgress, fetchEpisodeData]);

  // --- Action: 暂停/继续 ---
  const togglePause = useCallback(async () => {
    if (!episodeId) return;
    try {
      if (isPaused) {
        setProcessingError(null);
        setProcessingState('recognize');
        // 乐观更新状态
        setEpisode(prev => ({ ...prev, transcription_status: 'pending' }));
        
        await subtitleService.restartTranscription(episodeId);
        setIsPaused(false);
        setProgress(0);
        
        // 重新启动模拟
        startFakeProgress(18000); 
      } else {
        await subtitleService.cancelTranscription(episodeId);
        setIsPaused(true);
        stopFakeProgress();
        // 乐观更新
        setEpisode(prev => ({ ...prev, transcription_status: 'pending' }));
      }
    } catch (err) {
      setProcessingError(err.response?.data?.detail || err.message || '操作失败');
    }
  }, [episodeId, isPaused, startFakeProgress, stopFakeProgress]);

  // --- 初始化检查 ---
  useEffect(() => {
    if (urlEpisodeId) {
      if (urlEpisodeId !== episodeId) {
        setEpisode(null);
        setAudioUrl(null);
        setLoading(true);
        setEpisodeId(urlEpisodeId);
      }
    } else {
      const savedEpisodeId = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedEpisodeId) {
        setEpisodeId(savedEpisodeId);
        navigate(`/episodes/${savedEpisodeId}`, { replace: true });
      } else {
        setLoading(false);
      }
    }
  }, [urlEpisodeId, navigate, episodeId]);

  // --- Action: 重试 Fetch ---
  const retryFetch = useCallback(() => {
    if (episodeId) {
      setError(null);
      fetchEpisodeData(episodeId, true);
    }
  }, [episodeId, fetchEpisodeData]);

  // ==================== 关键修复：重试识别逻辑 ====================
// ... (保留前面的代码)

  // --- Action: 重试识别逻辑 ---
  const retryTranscription = useCallback(async () => {
    if (!episodeId) return;
    try {
      // 1. UI 状态立即重置
      setProcessingError(null);
      setProcessingState('recognize');
      setIsPaused(false);
      setProgress(0);
      
      // 2. [关键修复] 清空旧的 segments 数据
      // 防止 fetchEpisodeData 读到旧的 'completed' 状态从而误判关闭遮罩
      setSegments([]); 
      
      // 3. 乐观更新本地数据状态
      setEpisode(prev => ({
        ...prev,
        transcription_status: 'pending'
      }));
      
      // 4. 调用后端接口
      await subtitleService.restartTranscription(episodeId);
      
      // 5. 重启进度条模拟
      // 这里的 try-catch 可以简化，因为我们刚清空了 segments，
      // 不需要立即去 fetch，直接用默认值跑一会进度条，等轮询更新
      startFakeProgress(18000); 

    } catch (err) {
      setProcessingError(err.response?.data?.detail || err.message || '重试失败，请稍后再试');
      // 出错时保持在 recognize 状态，以便显示 Overlay 中的错误信息
      setProcessingState('recognize');
    }
  }, [episodeId, startFakeProgress]);

  // ==============================================================

  return {
    state: {
      episodeId,
      episode,
      segments,
      loading,
      error,
      audioUrl,
      processing: {
        status: processingState,
        progress,
        error: processingError,
        isPaused
      }
    },
    actions: {
      upload: handleUpload,
      retryUpload: () => setProcessingError(null),
      retryFetch,
      togglePause,
      retryTranscription
    }
  };
};
