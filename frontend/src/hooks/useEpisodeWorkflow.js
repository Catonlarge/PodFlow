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

/**
 * useEpisodeWorkflow Hook
 * 
 * @param {string|null} urlEpisodeId - URL 参数中的 episodeId
 * @returns {Object} { state, actions }
 *   - state: { episodeId, episode, segments, loading, error, audioUrl, processing }
 *   - actions: { upload, retryUpload, togglePause }
 */
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
  const [processingState, setProcessingState] = useState(null); // 'upload' | 'recognize' | null
  const [progress, setProgress] = useState(0);
  const [processingError, setProcessingError] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  
  // 引用，用于清除定时器
  const progressIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // --- 辅助：进度条模拟器 ---
  const startFakeProgress = useCallback((durationMs) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    const startTime = Date.now();
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // 最多跑到 99%，剩下 1% 等待实际完成
      const nextProgress = Math.min((elapsed / durationMs) * 100, 99);
      setProgress(nextProgress);
      
      if (nextProgress >= 99) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
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
      if (isInitial) {
        setLoading(true);
      }
      setError(null);
      
      const data = await subtitleService.getEpisode(targetId);
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

      // 如果转录已完成且有字幕数据，优先清除 ProcessingOverlay
      if (data.transcription_status === 'completed' && data.cues && data.cues.length > 0) {
        setProcessingState(null);
        setProgress(0);
        stopFakeProgress();
        setIsPaused(false);
      }

      // 获取 Segments 状态 (用于 PRD 判断：Segment 1 完成即可播放)
      let currentSegments = [];
      try {
        currentSegments = await subtitleService.getEpisodeSegments(targetId);
        setSegments(currentSegments || []);
      } catch (segmentsError) {
        // 如果获取 segment 失败，使用旧的逻辑
        if (data.transcription_status === 'processing' || data.transcription_status === 'pending') {
          setProcessingState('recognize');
          setProgress(data.transcription_progress || 0);
        } else if (data.transcription_status === 'completed') {
          if (data.cues && data.cues.length > 0) {
            setProcessingState(null);
            setProgress(0);
            stopFakeProgress();
            setIsPaused(false);
          }
        }
        return;
      }

      // --- 状态机逻辑 (PRD 6.1.2) ---
      const status = data.transcription_status;
      const hasCues = data.cues && data.cues.length > 0;
      const firstSegment = Array.isArray(currentSegments) 
        ? currentSegments.find(s => s.segment_index === 0) 
        : null;
      const firstSegmentDone = firstSegment?.status === 'completed';

      if (status === 'completed') {
        // 如果已有字幕数据，已经在上面清除了，跳过
        if (!hasCues) {
          // 如果没有字幕数据，检查 segment 状态
          if (firstSegmentDone) {
            // 第一段已完成，隐藏 ProcessingOverlay
            setProcessingState(null);
            setProgress(0);
            stopFakeProgress();
            setIsPaused(false);
          } else {
            // 如果转录完成但没有字幕数据且第一段未完成，清除状态
            setProcessingState(null);
            setProgress(0);
          }
        }
      } else if (status === 'processing' || status === 'pending') {
        // 根据转录状态更新暂停状态
        if (status === 'processing') {
          setIsPaused(false);
        } else if (status === 'pending') {
          setIsPaused(true);
        }
        
        // 检查第一段是否完成，如果完成则隐藏 ProcessingOverlay
        if (firstSegmentDone) {
          // 第一段已完成，隐藏 ProcessingOverlay
          setProcessingState(null);
          setProgress(0);
          stopFakeProgress();
        } else {
          // 第一段未完成，显示 ProcessingOverlay
          setProcessingState('recognize');
          setProgress(0);
          
          // 启动前端模拟进度条（如果还没有启动）
          if (!progressIntervalRef.current) {
            const segmentDuration = firstSegment ? firstSegment.duration : 180;
            // 识别时间 = segment001时长 * 0.1
            const recognitionDuration = segmentDuration * 0.1 * 1000;
            startFakeProgress(recognitionDuration);
          }
        }
      }

    } catch (err) {
      setError(err);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  }, [startFakeProgress, stopFakeProgress]);

  // --- Effect: 首次加载和 URL 参数变化 ---
  useEffect(() => {
    if (!episodeId) {
      return;
    }

    // 立即执行一次
    fetchEpisodeData(episodeId, true);
  }, [episodeId, fetchEpisodeData]);

  // --- Effect: 轮询逻辑（当 episode 状态为 processing/pending 时） ---
  useEffect(() => {
    if (!episode) {
      return;
    }

    // 如果转录完成，清除 ProcessingOverlay（fetchEpisodeData 中已处理，这里再次确认）
    if (episode.transcription_status === 'completed') {
      // 清除轮询
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // 如果正在转录，启动轮询（状态已由 fetchEpisodeData 设置）
    if (episode.transcription_status === 'processing' || episode.transcription_status === 'pending') {
      // 清除旧轮询
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      
      // 启动新轮询（每 3 秒）
      pollIntervalRef.current = setInterval(() => {
        fetchEpisodeData(episodeId, false);
      }, 3000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    } else {
      // 其他状态（如 failed），清除 ProcessingOverlay 和轮询
      setProcessingState(null);
      setProgress(0);
      stopFakeProgress();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [episode, episodeId, fetchEpisodeData, stopFakeProgress]);

  // --- Effect: 页面加载时恢复未完成的 segment ---
  useEffect(() => {
    if (!episodeId || !episode) {
      return;
    }
    
    const checkAndRecover = async () => {
      try {
        const segmentsData = await subtitleService.getEpisodeSegments(episodeId);
        if (!Array.isArray(segmentsData)) {
          return;
        }
        const incompleteSegments = segmentsData.filter(
          s => s.status === 'pending' || (s.status === 'failed' && s.retry_count < 3)
        );
        
        if (incompleteSegments.length > 0) {
          await subtitleService.recoverIncompleteSegments(episodeId);
        }
      } catch (err) {
        // 恢复失败不影响主流程
      }
    };
    
    if (episode.transcription_status === 'processing' || episode.transcription_status === 'pending') {
      checkAndRecover();
    }
  }, [episodeId, episode]);

  // --- Action: 上传文件 ---
  const handleUpload = useCallback(async (files) => {
    const { audioFile } = files;
    
    setProcessingState('upload');
    setProgress(0);
    setProcessingError(null);

    try {
      // 1. 估算时长用于进度条 (PRD: 上传时间 = 0.1 * 音频时长)
      let duration = 180;
      try {
        duration = await readAudioDuration(audioFile);
      } catch (e) {
        // 使用默认值
      }
      
      startFakeProgress(duration * 0.1 * 1000);

      // 2. 执行上传
      const title = audioFile.name.replace(/\.[^/.]+$/, '');
      const response = await episodeService.uploadEpisode(audioFile, title, null);

      // 3. 上传完成
      setProgress(100);
      stopFakeProgress();

      // 4. 处理跳转或状态更新
      const newId = response.episode_id.toString();
      localStorage.setItem(LOCAL_STORAGE_KEY, newId);
      
      const transcriptionStatus = response.status || response.transcription_status;
      
      if (response.is_duplicate && newId === episodeId) {
        // 重复且相同，直接刷新状态
        fetchEpisodeData(newId, false);
      } else {
        // 新文件或不同文件，需要跳转
        setEpisode(null);
        setAudioUrl(null);
        setEpisodeId(newId);
        
        if (transcriptionStatus === 'completed') {
          setProcessingState(null);
          setProgress(0);
          navigate(`/episodes/${newId}`, { replace: true });
        } else if (transcriptionStatus === 'processing' || transcriptionStatus === 'pending') {
          setProcessingState('recognize');
          setProgress(0);
          navigate(`/episodes/${newId}`, { replace: true });
        } else {
          setProcessingState(null);
          setProgress(0);
          navigate(`/episodes/${newId}`, { replace: true });
        }
      }

    } catch (err) {
      stopFakeProgress();
      setProcessingError(err.response?.data?.detail || err.message || '上传失败');
      // 保持 upload 状态让用户重试
    }
  }, [episodeId, navigate, startFakeProgress, stopFakeProgress, fetchEpisodeData]);

  // --- Action: 暂停/继续识别 ---
  const togglePause = useCallback(async () => {
    if (!episodeId) {
      return;
    }
    try {
      if (isPaused) {
        // 当前已暂停，点击继续（重新开始识别）
        await subtitleService.restartTranscription(episodeId);
        setIsPaused(false);
        setProgress(0);
        
        // 重新启动进度条模拟
        try {
          const segmentsData = await subtitleService.getEpisodeSegments(episodeId);
          const firstSegment = Array.isArray(segmentsData) 
            ? segmentsData.find(s => s.segment_index === 0) 
            : null;
          const segmentDuration = firstSegment ? firstSegment.duration : 180;
          const recognitionDuration = segmentDuration * 0.1 * 1000;
          startFakeProgress(recognitionDuration);
        } catch (err) {
          // 如果获取 segment 失败，使用默认值
          startFakeProgress(18000);
        }
      } else {
        // 当前正在识别，点击暂停（取消识别任务）
        await subtitleService.cancelTranscription(episodeId);
        setIsPaused(true);
        stopFakeProgress();
      }
    } catch (err) {
      setProcessingError(err.response?.data?.detail || err.message || '操作失败，请重试');
    }
  }, [episodeId, isPaused, startFakeProgress, stopFakeProgress]);

  // --- 初始化检查 (localStorage 和 URL 参数) ---
  useEffect(() => {
    // 如果有 URL 参数，使用 URL 参数
    if (urlEpisodeId) {
      if (urlEpisodeId !== episodeId) {
        setEpisode(null);
        setAudioUrl(null);
        setLoading(true);
        setEpisodeId(urlEpisodeId);
      }
    } 
    // 如果没有 URL 参数，检查 localStorage
    else {
      const savedEpisodeId = localStorage.getItem(LOCAL_STORAGE_KEY);
      
      // 如果有保存的 episodeId，自动加载
      if (savedEpisodeId) {
        setEpisodeId(savedEpisodeId);
        navigate(`/episodes/${savedEpisodeId}`, { replace: true });
      } else {
        setLoading(false);
      }
    }
  }, [urlEpisodeId, navigate, episodeId]);

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
      togglePause
    }
  };
};

