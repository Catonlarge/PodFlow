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
import { readAudioDuration } from '../utils/fileUtils';

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
  const [isTranscriptionPaused, setIsTranscriptionPaused] = useState(false); // 字幕识别是否暂停
  
  // Segment 状态（用于检查第一段是否完成）
  const [segments, setSegments] = useState([]);
  const [progressInterval, setProgressInterval] = useState(null);

  // 从环境变量或 api.js 获取 Base URL（避免硬编码）
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || api.defaults.baseURL || 'http://localhost:8000';

  // 获取 Episode 数据
  const fetchEpisode = useCallback(async (targetEpisodeId, isInitialLoad = false) => {
    console.log('[DEBUG fetchEpisode] 开始执行', {
      targetEpisodeId,
      isInitialLoad,
      currentProcessingState: processingState,
      timestamp: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
    });
    
    try {
      // 如果有 processingState（如 upload 或 recognize），不要显示 Loading 状态
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      
      const data = await subtitleService.getEpisode(targetEpisodeId);
      console.log('[DEBUG fetchEpisode] 获取到episode数据', {
        episodeId: data.id,
        transcription_status: data.transcription_status,
        cuesLength: data.cues?.length || 0,
        hasCues: !!(data.cues && data.cues.length > 0),
        currentProcessingState: processingState,
      });
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
      
      // 如果转录已完成且有字幕数据，优先清除 ProcessingOverlay，不显示加载状态
      // 这样可以在后续的segment检查之前就确保不会设置load状态
      if (data.transcription_status === 'completed' && data.cues && data.cues.length > 0) {
        console.log('[DEBUG fetchEpisode] 检测到已完成且有字幕，清除processingState', {
          transcription_status: data.transcription_status,
          cuesLength: data.cues.length,
          currentProcessingState: processingState,
        });
        setProcessingState(null);
        setUploadProgress(0);
        setIsTranscriptionPaused(false);
        if (progressInterval) {
          clearInterval(progressInterval);
          setProgressInterval(null);
        }
      }
      
      // 获取 segment 状态（用于检查第一段是否完成）
      try {
        const segmentsData = await subtitleService.getEpisodeSegments(targetEpisodeId);
        setSegments(segmentsData || []);
        
        // 检查第一段（segment_index=0）是否完成
        const firstSegment = Array.isArray(segmentsData) ? segmentsData.find(s => s.segment_index === 0) : null;
        
        // 如果转录已完成，处理 ProcessingOverlay 状态
        // 注意：如果已有字幕数据，已经在上面清除了，这里不再重复处理
        if (data.transcription_status === 'completed') {
          // 如果已有字幕数据，已经在上面清除了，跳过
          if (!(data.cues && data.cues.length > 0)) {
            // 如果没有字幕数据，检查segment状态
            if (firstSegment && firstSegment.status === 'completed') {
              // 第一段已完成，隐藏 ProcessingOverlay
              setProcessingState(null);
              setUploadProgress(0);
              setIsTranscriptionPaused(false);
              if (progressInterval) {
                clearInterval(progressInterval);
                setProgressInterval(null);
              }
            } else {
              // 如果转录完成但没有字幕数据且第一段未完成，触发字幕加载状态
              // 这种情况可能是字幕数据还在加载中
              if (!processingState || processingState === 'upload') {
                console.log('[DEBUG fetchEpisode] 设置load状态（已完成但无字幕且第一段未完成）', {
                  transcription_status: data.transcription_status,
                  cuesLength: data.cues?.length || 0,
                  firstSegmentStatus: firstSegment?.status,
                  currentProcessingState: processingState,
                  stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
                });
                setProcessingState('load');
                setUploadProgress(0);
              } else {
                console.log('[DEBUG fetchEpisode] 跳过设置load状态（已有其他状态）', {
                  currentProcessingState: processingState,
                });
              }
            }
          }
        } else if (data.transcription_status === 'processing' || data.transcription_status === 'pending') {
          // 根据转录状态更新暂停状态
          if (data.transcription_status === 'processing') {
            setIsTranscriptionPaused(false); // 正在识别，未暂停
          } else if (data.transcription_status === 'pending') {
            setIsTranscriptionPaused(true); // 待处理，视为暂停
          }
          
          // 检查第一段是否完成，如果完成则隐藏 ProcessingOverlay
          if (firstSegment && firstSegment.status === 'completed') {
            // 第一段已完成，隐藏 ProcessingOverlay
            setProcessingState(null);
            setUploadProgress(0);
            if (progressInterval) {
              clearInterval(progressInterval);
              setProgressInterval(null);
            }
          } else {
            // 第一段未完成，显示 ProcessingOverlay
            // 进度条由前端模拟，不从后端获取
            // 确保设置recognize状态，即使当前状态已经是recognize（确保overlay被正确渲染）
            setProcessingState('recognize');
            setUploadProgress(0);
            
            // 启动前端模拟进度条（如果还没有启动）
            // 根据PRD c.i：字幕识别进度条计算方式：基于segment001时长，识别时间0.1X（X为segment001时长）
            if (!progressInterval && data.duration) {
              // 获取第一段（segment001）的时长
              const segmentDuration = firstSegment ? firstSegment.duration : 180; // 默认180秒
              
              // 识别时间 = segment001时长 * 0.1
              const recognitionDuration = segmentDuration * 0.1 * 1000; // 转换为毫秒
              
              // 模拟进度条：从0%到100%，匀速增长
              const startTime = Date.now();
              
              const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min((elapsed / recognitionDuration) * 100, 99); // 最多到99%，等待后端完成
                setUploadProgress(progress);
                
                // 如果达到99%，停止增长（等待后端完成）
                if (progress >= 99) {
                  clearInterval(interval);
                }
              }, 100); // 每100ms更新一次
              
              setProgressInterval(interval);
            }
          }
        }
      } catch (segmentsError) {
        console.error('[EpisodePage] 获取 Segment 状态失败:', segmentsError);
        // 如果获取segment失败，使用旧的逻辑
        if (data.transcription_status === 'processing' || data.transcription_status === 'pending') {
          setProcessingState('recognize');
          setUploadProgress(data.transcription_progress || 0);
        } else if (data.transcription_status === 'completed') {
          // 如果转录完成，清除 ProcessingOverlay
          // 如果已有字幕数据，直接清除；如果没有字幕数据，可能需要加载
          if (data.cues && data.cues.length > 0) {
            setProcessingState(null);
            setUploadProgress(0);
            setIsTranscriptionPaused(false);
            if (progressInterval) {
              clearInterval(progressInterval);
              setProgressInterval(null);
            }
          } else if (!processingState || processingState === 'upload') {
            // 如果没有字幕数据，触发字幕加载状态
            console.log('[DEBUG fetchEpisode] 设置load状态（catch块：已完成但无字幕）', {
              transcription_status: data.transcription_status,
              cuesLength: data.cues?.length || 0,
              currentProcessingState: processingState,
              stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
            });
            setProcessingState('load');
            setUploadProgress(0);
          } else {
            // 已经有其他状态，保持当前状态或清除
            setProcessingState(null);
            setUploadProgress(0);
            setIsTranscriptionPaused(false);
            if (progressInterval) {
              clearInterval(progressInterval);
              setProgressInterval(null);
            }
          }
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [API_BASE_URL, processingState, progressInterval]);

  // 首次打开逻辑：检查 localStorage 或 URL 参数
  useEffect(() => {
    console.log('[DEBUG useEffect-首次打开] 检查URL参数和localStorage', {
      urlEpisodeId,
      timestamp: new Date().toISOString(),
    });
    
    // 如果有 URL 参数，使用 URL 参数
    if (urlEpisodeId) {
      console.log('[DEBUG useEffect-首次打开] 使用URL参数，调用fetchEpisode', { urlEpisodeId });
      // 如果episodeId已经更新（在handleFileConfirm中），不需要再次设置
      if (urlEpisodeId !== episodeId) {
        setEpisode(null);
        setAudioUrl(null); // 同时清空音频URL
        setLoading(true);
        setEpisodeId(urlEpisodeId);
      }
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
  }, [urlEpisodeId, navigate, fetchEpisode, episodeId]);

  // 轮询转录状态（仅用于轮询，状态由 fetchEpisode 管理）
  useEffect(() => {
    if (!episode) {
      return;
    }

    console.log('[DEBUG useEffect-轮询] episode状态变化', {
      episodeId: episode.id,
      transcription_status: episode.transcription_status,
      cuesLength: episode.cues?.length || 0,
      currentProcessingState: processingState,
      timestamp: new Date().toISOString(),
    });

    // 如果转录完成，清除 ProcessingOverlay（fetchEpisode 中已处理，这里再次确认）
    // 注意：如果已有字幕数据，fetchEpisode中已经清除，这里不需要再次处理
    if (episode.transcription_status === 'completed') {
      // 如果已有字幕数据，确保清除 ProcessingOverlay（避免重复设置load状态）
      if (episode.cues && episode.cues.length > 0) {
        console.log('[DEBUG useEffect-轮询] 已完成且有字幕，清除processingState', {
          cuesLength: episode.cues.length,
          currentProcessingState: processingState,
        });
        setProcessingState(null);
        setUploadProgress(0);
        if (progressInterval) {
          clearInterval(progressInterval);
          setProgressInterval(null);
        }
      } else {
        // 如果没有字幕数据，fetchEpisode中应该已经处理，这里只清除其他状态
        if (processingState && processingState !== 'load') {
          setProcessingState(null);
          setUploadProgress(0);
          if (progressInterval) {
            clearInterval(progressInterval);
            setProgressInterval(null);
          }
        }
      }
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
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
    }
  }, [episode, episodeId, fetchEpisode, progressInterval]);
  
  // 清理进度条定时器
  useEffect(() => {
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, [progressInterval]);
  
  // 页面加载时恢复未完成的 segment
  useEffect(() => {
    if (!episodeId || !episode) {
      return;
    }
    
    // 检查是否有未完成的 segment，如果有则触发恢复
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
          // 触发恢复
          await subtitleService.recoverIncompleteSegments(episodeId);
          console.log(`[EpisodePage] 已触发 ${incompleteSegments.length} 个未完成 segment 的恢复`);
        }
      } catch (error) {
        console.error('[EpisodePage] 恢复未完成 segment 失败:', error);
      }
    };
    
    // 只在首次加载时检查
    if (episode.transcription_status === 'processing' || episode.transcription_status === 'pending') {
      checkAndRecover();
    }
  }, [episodeId, episode]);

  // 处理文件导入按钮点击
  const handleFileImportClick = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // 处理文件确认
  const handleFileConfirm = useCallback(async (files) => {
    const { audioFile } = files;
    
    console.log('[DEBUG handleFileConfirm] 开始处理文件确认', {
      fileName: audioFile.name,
      currentProcessingState: processingState,
      currentEpisodeId: episodeId,
      timestamp: new Date().toISOString(),
    });
    
    // 先关闭弹窗，避免后续状态变化导致弹窗闪烁
    setIsModalOpen(false);
    
    // 设置上传状态
    console.log('[DEBUG handleFileConfirm] 设置upload状态');
    setProcessingState('upload');
    setUploadProgress(0);
    setProcessingError(null);

    let progressInterval = null;

    try {
      // 使用音频文件名作为标题（如果后续需要，可以从 metadata 获取）
      const title = audioFile.name.replace(/\.[^/.]+$/, ''); // 移除文件扩展名
      
      // 读取音频时长，用于计算上传进度
      let audioDuration = 0;
      try {
        audioDuration = await readAudioDuration(audioFile);
      } catch (error) {
        console.warn('[EpisodePage] 无法读取音频时长，使用默认值:', error);
        audioDuration = 180; // 默认3分钟
      }
      
      // 根据PRD：如果音频文件时长为X，上传速度为0.1X，按照音频上传为匀速进行显示进度
      // 上传时间 = 音频时长 * 0.1
      const uploadDuration = audioDuration * 0.1 * 1000; // 转换为毫秒
      const startTime = Date.now();
      
      // 模拟上传进度：匀速增长
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / uploadDuration) * 100, 99); // 最多到99%，等待实际上传完成
        setUploadProgress(progress);
        
        // 如果达到99%，停止增长（等待实际上传完成）
        if (progress >= 99) {
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
        }
      }, 100); // 每100ms更新一次

      // 调用上传 API
      const response = await episodeService.uploadEpisode(audioFile, title, null);
      
      // 上传完成后，进度条直接走到100%
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      setUploadProgress(100);
      
      // 检查是否为重复文件（秒传/去重逻辑）
      // 根据PRD d.iii：检测到重复文件时，直接跳转到episode页面
      // 如果已有字幕，直接加载字幕（不显示识别提示）
      // 如果字幕正在识别中，显示识别提示
      // 如果字幕识别失败，显示错误提示和重试按钮
      if (response.is_duplicate) {
        // 检查转录状态，决定是否显示识别提示
        const transcriptionStatus = response.status || response.transcription_status;
        
        // 检查是否是同一个episode
        if (response.episode_id.toString() === episodeId) {
          // 同一个episode，立即清除upload状态，避免显示上传遮罩
          console.log('[DEBUG handleFileConfirm] 重复文件且是同一个episode，立即清除upload状态', {
            transcriptionStatus,
            episodeId: response.episode_id,
          });
          setProcessingState(null);
          setUploadProgress(0);
          // 不清空episode、audioUrl等数据，保持当前页面状态
          return; // 提前返回，不执行后续逻辑
        }
        
        // 不同episode的重复文件，清除upload状态（不显示"音频上传中"遮罩，因为文件已经在数据库中）
        setProcessingState(null);
        setUploadProgress(0);
        
        // 保存 episodeId 到 localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, response.episode_id.toString());
        
        // 根据PRD d.iii：如果已有字幕（completed），直接加载字幕（不显示识别提示）
        if (transcriptionStatus === 'completed') {
          
          // 不同episode，在navigate前同步完成所有状态更新
          // 注意：不设置load状态，因为如果已有字幕，fetchEpisode会清除状态；如果没有字幕，fetchEpisode会设置load状态
          console.log('[DEBUG handleFileConfirm] 重复文件且已完成，清除状态并跳转（不设置load，让fetchEpisode根据字幕数据决定）', {
            transcriptionStatus,
            episodeId: response.episode_id,
          });
          // 弹窗已经在函数开始时关闭了
          setEpisode(null);             // 立即清空数据
          setAudioUrl(null);            // 立即清空音频URL
          // processingState已经在上面清除了
          setEpisodeId(response.episode_id.toString()); // 提前更新episodeId
          navigate(`/episodes/${response.episode_id}`, { replace: true });
        } else if (transcriptionStatus === 'processing' || transcriptionStatus === 'pending') {
          // 检查是否是同一个episode
          if (response.episode_id.toString() === episodeId) {
            // 同一个episode，已经关闭了弹窗，保持当前状态，不执行navigate
            console.log('[DEBUG handleFileConfirm] 重复文件且正在识别，同一个episode，已关闭弹窗', {
              transcriptionStatus,
              episodeId: response.episode_id,
            });
            // 保持recognize状态（如果当前已经是recognize状态），不清空数据
            return;
          }
          
          // 如果字幕正在识别中，直接设置为recognize状态，避免出现load状态
          console.log('[DEBUG handleFileConfirm] 重复文件且正在识别，设置recognize状态', {
            transcriptionStatus,
            episodeId: response.episode_id,
          });
          // 弹窗已经在函数开始时关闭了
          setEpisode(null);
          setAudioUrl(null);
          setProcessingState('recognize');
          setUploadProgress(0);
          setEpisodeId(response.episode_id.toString());
          navigate(`/episodes/${response.episode_id}`, { replace: true });
        } else if (transcriptionStatus === 'failed') {
          // 检查是否是同一个episode
          if (response.episode_id.toString() === episodeId) {
            // 同一个episode，已经关闭了弹窗，保持当前状态，不执行navigate
            console.log('[DEBUG handleFileConfirm] 重复文件且失败，同一个episode，已关闭弹窗', {
              transcriptionStatus,
              episodeId: response.episode_id,
            });
            // 不清空数据，保持当前页面状态
            return;
          }
          
          // 如果字幕识别失败，清除上传状态，跳转后由SubtitleList显示错误提示和重试按钮
          // 弹窗已经在函数开始时关闭了
          setEpisode(null);
          setAudioUrl(null);
          // processingState已经在上面清除了
          setEpisodeId(response.episode_id.toString());
          navigate(`/episodes/${response.episode_id}`, { replace: true });
        }
      } else {
        // 非重复文件：正常流程
        setUploadProgress(100);
        
        // 保存 episodeId 到 localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, response.episode_id.toString());
        
        // 检查转录状态（上传响应中的 status 字段）
        const transcriptionStatus = response.status || response.transcription_status;
        
        // 根据PRD：音频上传成功->加载字幕
        // 如果已完成，跳转后触发字幕加载状态
        // 如果正在识别中（processing/pending），直接设置recognize状态，跳转后由fetchEpisode继续处理
        if (transcriptionStatus === 'completed') {
          // 上传完成，不设置load状态，让fetchEpisode根据是否有字幕数据来决定
          console.log('[DEBUG handleFileConfirm] 非重复文件且已完成，清除状态并跳转（不设置load，让fetchEpisode根据字幕数据决定）', {
            transcriptionStatus,
            episodeId: response.episode_id,
          });
          // 弹窗已经在函数开始时关闭了
          setEpisode(null);             // 立即清空数据
          setAudioUrl(null);            // 立即清空音频URL
          setProcessingState(null);     // 不设置load状态，让fetchEpisode根据是否有字幕数据来决定
          setUploadProgress(0);
          setEpisodeId(response.episode_id.toString()); // 提前更新episodeId
          navigate(`/episodes/${response.episode_id}`, { replace: true });
        } else if (transcriptionStatus === 'processing' || transcriptionStatus === 'pending') {
          // 如果正在识别中，直接设置为recognize状态，避免出现load状态
          console.log('[DEBUG handleFileConfirm] 非重复文件且正在识别，设置recognize状态', {
            transcriptionStatus,
            episodeId: response.episode_id,
          });
          // 弹窗已经在函数开始时关闭了
          setEpisode(null);
          setAudioUrl(null);
          setProcessingState('recognize');
          setUploadProgress(0);
          setEpisodeId(response.episode_id.toString());
          navigate(`/episodes/${response.episode_id}`, { replace: true });
        } else {
          // 其他情况（如failed）保持upload状态，跳转后由fetchEpisode处理
          // 弹窗已经在函数开始时关闭了
          setEpisode(null);
          setAudioUrl(null);
          setEpisodeId(response.episode_id.toString());
          navigate(`/episodes/${response.episode_id}`, { replace: true });
        }
      }
    } catch (err) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setProcessingError(err.response?.data?.detail || err.message || '上传失败，请重试');
      setProcessingState('upload');
      // 出错时也要关闭弹窗
      setIsModalOpen(false);
    }
  }, [navigate, episodeId]);

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

  // 处理字幕识别暂停/继续切换
  // 根据PRD c.i：方形（Stop图标）= 识别中，点击暂停（取消识别任务）；三角形（PlayArrow图标）= 已暂停，点击继续（重新开始识别）
  const handleToggleTranscriptionPause = useCallback(async () => {
    if (!episodeId) {
      return;
    }

    try {
      if (isTranscriptionPaused) {
        // 当前已暂停，点击继续（重新开始识别）
        await subtitleService.restartTranscription(episodeId);
        setIsTranscriptionPaused(false);
        // 重新开始识别后，进度条重置为0
        setUploadProgress(0);
        // 重新启动进度条模拟
        if (episode && episode.duration) {
          const segmentsData = await subtitleService.getEpisodeSegments(episodeId);
          const firstSegment = Array.isArray(segmentsData) ? segmentsData.find(s => s.segment_index === 0) : null;
          const segmentDuration = firstSegment ? firstSegment.duration : 180;
          const recognitionDuration = segmentDuration * 0.1 * 1000;
          const startTime = Date.now();
          
          const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / recognitionDuration) * 100, 99);
            setUploadProgress(progress);
            
            if (progress >= 99) {
              clearInterval(interval);
            }
          }, 100);
          
          setProgressInterval(interval);
        }
      } else {
        // 当前正在识别，点击暂停（取消识别任务）
        await subtitleService.cancelTranscription(episodeId);
        setIsTranscriptionPaused(true);
        // 暂停时，停止进度条增长
        if (progressInterval) {
          clearInterval(progressInterval);
          setProgressInterval(null);
        }
      }
    } catch (error) {
      console.error('[EpisodePage] 切换识别暂停/继续状态失败:', error);
      setProcessingError(error.response?.data?.detail || error.message || '操作失败，请重试');
    }
  }, [episodeId, isTranscriptionPaused, episode, progressInterval]);

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
          segments={segments}
          cues={episode?.cues || null}
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
          isPaused={isTranscriptionPaused}
          onRetry={processingError ? handleUploadRetry : null}
          onTogglePause={processingState === 'recognize' ? handleToggleTranscriptionPause : null}
        />
      )}
    </>
  );
}
