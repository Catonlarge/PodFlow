import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, IconButton, Button, Skeleton, Typography, LinearProgress, Stack, Snackbar, Alert } from '@mui/material';
import { Translate as TranslateIcon, Refresh } from '@mui/icons-material';
import SubtitleRow from './SubtitleRow';
import SelectionMenu from './SelectionMenu';
import { useSubtitleSync } from '../../hooks/useSubtitleSync';
import { useTextSelection } from '../../hooks/useTextSelection';
import { getMockCues, getCuesByEpisodeId, subtitleService } from '../../services/subtitleService';
import { highlightService } from '../../services/highlightService';
import { noteService } from '../../services/noteService';
import { aiService } from '../../services/aiService';
import AICard from './AICard';

/**
 * SubtitleList 组件
 * 
 * 字幕列表容器组件，管理字幕列表的滚动和定位
 * 
 * 功能描述：
 * - 字幕列表容器组件
 * - 管理字幕列表的滚动和定位
 * - 配合 useSubtitleSync 实现自动滚动到当前字幕
 * - 处理 speaker 分组显示
 * 
 * 相关PRD：
 * - PRD 6.2.4.1: 英文字幕区域
 * 
 * @module components/subtitles/SubtitleList
 * 
 * @param {Object} props
 * @param {Array} [props.cues] - 字幕数组（可选，无数据时使用 mock 数据）
 * @param {number} props.currentTime - 当前播放时间（秒）
 * @param {number} props.duration - 音频总时长（秒）
 * @param {Function} [props.onCueClick] - 字幕点击回调函数 (startTime) => void
 * @param {string} [props.audioUrl] - 音频 URL（用于后续对接 API）
 * @param {number} [props.episodeId] - Episode ID（用于后续对接 API）
 * @param {React.RefObject} [props.scrollContainerRef] - 外部滚动容器引用（如果提供，将使用外部容器滚动；否则使用内部滚动）
 * @param {boolean} [props.isInteracting] - 用户是否正在进行交互操作（划线、查询卡片展示等），用于阻断自动滚动
 * @param {Array} [props.highlights] - 划线数据数组，格式为 [{ cue_id, start_offset, end_offset, highlighted_text, color }]
 * @param {Function} [props.onHighlightClick] - 点击划线源的回调函数 (highlight) => void
 * @param {boolean} [props.isLoading] - 是否处于加载状态
 * @param {string} [props.transcriptionStatus] - 转录状态（pending/processing/completed/failed），用于在识别完成后触发字幕重新加载
 * @param {Array} [props.segments] - Segment 状态数组，用于显示底部状态提示
 * @param {Function} [props.onNoteCreate] - 创建笔记成功后的回调函数 () => void
 * @param {number} [props.noteDeleteTrigger] - 笔记删除触发器，当值变化时触发 highlights 刷新
 */
export default function SubtitleList({
  cues: propsCues,
  currentTime = 0,
  onCueClick,
  episodeId,
  scrollContainerRef,
  isUserScrollingRef: externalIsUserScrollingRef,
  isInteracting = false,
  highlights = [],
  onHighlightClick,
  isLoading = false,
  transcriptionStatus,
  segments = [],
  onNoteCreate,
  noteDeleteTrigger = 0,
}) {
  const [cues, setCues] = useState(propsCues || []);
  const [showTranslation, setShowTranslation] = useState(false);
  const [subtitleLoadingState, setSubtitleLoadingState] = useState(null); // 'loading' | 'error' | null
  const [subtitleLoadingProgress, setSubtitleLoadingProgress] = useState(0);
  const [subtitleLoadingError, setSubtitleLoadingError] = useState(null);
  const [transcriptionError, setTranscriptionError] = useState(null); // 字幕识别失败错误信息
  
  // Highlights 状态管理（如果 props 没有传入，则内部管理）
  const [internalHighlights, setInternalHighlights] = useState([]);
  const [highlightError, setHighlightError] = useState(null);
  const [highlightErrorOpen, setHighlightErrorOpen] = useState(false);
  
  // AI 查询相关状态
  const [aiCardState, setAiCardState] = useState({
    isVisible: false,
    anchorPosition: null,
    queryText: null,
    responseData: null,
    isLoading: false,
    queryId: null,
    highlightId: null, // 存储用于查询的 highlight_id
  });
  const aiCardAnchorElementRef = useRef(null);
  const aiCardHighlightIdRef = useRef(null); // 用于存储 highlightId，避免闭包问题
  const isQueryingRef = useRef(false); // 防止重复调用 AI 查询
  const [aiQueryError, setAiQueryError] = useState(null);
  const [aiQueryErrorOpen, setAiQueryErrorOpen] = useState(false);
  
  // 使用 props 传入的 highlights，如果没有则使用内部状态
  // 注意：如果 props 传入了 highlights，优先使用 props（父组件管理状态）
  const effectiveHighlights = (highlights && highlights.length > 0) ? highlights : internalHighlights;
  
  const internalContainerRef = useRef(null);
  const internalUserScrollTimeoutRef = useRef(null);
  const internalIsUserScrollingRef = useRef(false);
  const subtitleRefs = useRef({});
  const previousTranscriptionStatusRef = useRef(transcriptionStatus || null);
  const loadingProgressIntervalRef = useRef(null);

  // 使用外部滚动容器或内部滚动容器
  // 当使用外部滚动容器时，containerRef 指向外部容器；否则使用内部容器
  const containerRef = scrollContainerRef || internalContainerRef;

  /**
   * 将技术性错误信息转换为用户友好的提示
   * 
   * @param {string} errorMessage - 原始错误信息
   * @returns {string} 用户友好的错误提示
   */
  const formatUserFriendlyError = useCallback((errorMessage) => {
    if (!errorMessage) {
      return '模型处理失败，请重试';
    }

    const errorLower = errorMessage.toLowerCase();

    // 网络相关错误
    if (errorLower.includes('network') || errorLower.includes('connection') || 
        errorLower.includes('timeout') || errorLower.includes('连接') || 
        errorLower.includes('网络')) {
      return '网络问题，请检查网络连接后重试';
    }

    // 模型相关错误
    if (errorLower.includes('model') || errorLower.includes('whisper') || 
        errorLower.includes('模型') || errorLower.includes('transcription') || 
        errorLower.includes('识别')) {
      return '模型处理失败，请重试';
    }

    // 文件相关错误
    if (errorLower.includes('file') || errorLower.includes('audio') || 
        errorLower.includes('ffmpeg') || errorLower.includes('文件') || 
        errorLower.includes('音频')) {
      return '音频处理失败，请重试';
    }

    // 内存相关错误
    if (errorLower.includes('memory') || errorLower.includes('out of memory') || 
        errorLower.includes('内存')) {
      return '内存不足，请稍后重试';
    }

    // 默认提示
    return '模型处理失败，请重试';
  }, []);

  // 使用 useSubtitleSync hook 获取当前高亮字幕索引
  const { currentSubtitleIndex, registerSubtitleRef } = useSubtitleSync({
    currentTime,
    cues,
  });

  // 使用 useTextSelection hook 处理文本选择
  const {
    selectedText,
    selectionRange,
    affectedCues,
    clearSelection,
  } = useTextSelection({
    cues: cues,
    containerRef: containerRef,
    enabled: true,
  });

  // 计算 SelectionMenu 和 AICard 的锚点位置
  // 保存完整的矩形信息，以便在点击查询按钮时也能使用（此时window.getSelection可能已失效）
  const anchorPosition = useMemo(() => {
    if (!selectedText || !selectionRange) {
      return null;
    }

    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // 保存完整的矩形信息，同时提供中心点（用于SelectionMenu向后兼容）
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        // 中心点（用于SelectionMenu，保持向后兼容）
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } catch (error) {
      console.error('[SubtitleList] 计算锚点位置失败:', error);
      return null;
    }
  }, [selectedText, selectionRange]);

  /**
   * 生成 UUID（用于跨 cue 划线的分组 ID）
   * 使用浏览器原生的 crypto.randomUUID()，如果不支持则使用简单实现
   */
  const generateUUID = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // 降级方案：简单的 UUID v4 实现
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }, []);

  // 处理纯划线回调
  const handleUnderline = useCallback(async () => {
    if (!episodeId || !affectedCues || affectedCues.length === 0) {
      console.warn('[SubtitleList] 无法创建划线：缺少必要参数');
      clearSelection();
      return;
    }

    try {
      // 判断是单 cue 还是跨 cue 划线
      const isCrossCue = affectedCues.length > 1;
      const highlightGroupId = isCrossCue ? generateUUID() : null;

      // 构建 highlights 数组
      const highlightsToCreate = affectedCues.map((affectedCue) => {
        const cue = affectedCue.cue;
        const startOffset = affectedCue.startOffset;
        const endOffset = affectedCue.endOffset;
        const highlightedText = cue.text.substring(startOffset, endOffset);

        return {
          cue_id: cue.id,
          start_offset: startOffset,
          end_offset: endOffset,
          highlighted_text: highlightedText,
          color: '#9C27B0', // 紫色，与 PRD 一致
        };
      });

      // 1. 创建 Highlight
      const highlightResponse = await highlightService.createHighlights(
        episodeId,
        highlightsToCreate,
        highlightGroupId
      );

      if (!highlightResponse || !highlightResponse.highlight_ids || highlightResponse.highlight_ids.length === 0) {
        throw new Error('创建划线失败：服务器返回无效数据');
      }

      // 2. 为每个 Highlight 创建 Note（underline 类型）
      // 注意：如果后端 Note API 还未实现（Task 3.9），这里会失败，但不影响下划线显示
      try {
        const notePromises = highlightResponse.highlight_ids.map((highlightId) =>
          noteService.createNote(episodeId, highlightId, 'underline', null, null)
        );
        await Promise.all(notePromises);
      } catch (noteError) {
        // Note API 可能还未实现，只记录警告，不影响下划线显示
        console.warn('[SubtitleList] 创建 Note 失败（可能是后端 API 未实现）:', noteError);
        // 不抛出错误，继续执行，让下划线能够显示
      }

      // 3. 更新本地状态（添加新创建的 highlights）
      const newHighlights = highlightsToCreate.map((h, index) => ({
        id: highlightResponse.highlight_ids[index],
        cue_id: h.cue_id,
        start_offset: h.start_offset,
        end_offset: h.end_offset,
        highlighted_text: h.highlighted_text,
        color: h.color,
        highlight_group_id: highlightGroupId,
      }));

      // 使用函数式更新，避免闭包问题
      // 如果使用 props 传入的 highlights，只更新内部状态（用于显示）
      // 注意：如果父组件传入了 highlights prop，这里更新内部状态不会影响 props
      // 但可以确保 UI 立即更新，后续可以通过 onHighlightsChange 回调通知父组件
      setInternalHighlights((prev) => [...prev, ...newHighlights]);

      // 4. 清除文本选择
      clearSelection();
    } catch (error) {
      console.error('[SubtitleList] 创建划线失败:', error);
      
      // 显示错误提示
      const errorMessage = error.response?.data?.detail || error.message || '创建划线失败，请重试';
      setHighlightError(errorMessage);
      setHighlightErrorOpen(true);
      
      // 清除文本选择（即使失败也要清除，避免 UI 卡住）
      clearSelection();
    }
  }, [episodeId, affectedCues, highlights, generateUUID, clearSelection]);

  // 处理 AI 查询回调
  const handleQuery = useCallback(async () => {
    console.log('[SubtitleList] handleQuery 被调用', { episodeId, affectedCuesLength: affectedCues?.length, selectedText });
    
    // 防止重复调用
    if (isQueryingRef.current) {
      console.warn('[SubtitleList] AI 查询正在进行中，忽略重复调用');
      return;
    }
    
    if (!episodeId || !affectedCues || affectedCues.length === 0 || !selectedText) {
      console.warn('[SubtitleList] 无法进行 AI 查询：缺少必要参数');
      clearSelection();
      return;
    }

    // 标记为正在查询
    isQueryingRef.current = true;

    try {
      console.log('[SubtitleList] handleQuery 开始执行，准备显示 AICard');
      // Step 1: 复用已计算的 anchorPosition（因为此时window.getSelection可能已失效）
      let computedAnchorPosition = null;
      
      if (anchorPosition && 'top' in anchorPosition && 'left' in anchorPosition) {
        // 从已保存的anchorPosition中提取矩形信息
        computedAnchorPosition = {
          top: anchorPosition.top,
          left: anchorPosition.left,
          right: anchorPosition.right,
          bottom: anchorPosition.bottom,
        };
      } else {
        // 如果anchorPosition不可用，使用默认位置（屏幕中心）
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const defaultSize = 100;
        computedAnchorPosition = {
          top: viewportHeight / 2 - defaultSize / 2,
          left: viewportWidth / 2 - defaultSize / 2,
          right: viewportWidth / 2 + defaultSize / 2,
          bottom: viewportHeight / 2 + defaultSize / 2,
        };
      }

      // 获取划线源的 DOM 元素引用（用于 IntersectionObserver）
      let anchorElement = null;
      if (affectedCues.length > 0) {
        const firstCue = affectedCues[0].cue;
        const cueElement = subtitleRefs.current[firstCue.id]?.current;
        if (cueElement) {
          anchorElement = cueElement;
        }
      }

      // Step 2: ✨ 立即显示 AICard（Loading 状态），不等待 API
      // 注意：此时还没有 highlightId，不能进行"添加到笔记"操作，但这对于 Loading 状态是可以接受的
      console.log('[SubtitleList] 设置 AICard 状态为可见', { computedAnchorPosition, selectedText });
      setAiCardState({
        isVisible: true,
        anchorPosition: computedAnchorPosition,
        queryText: selectedText,
        responseData: null,
        isLoading: true, // 显示转圈
        queryId: null,
        highlightId: null, // 暂时为 null，创建 Highlight 后再更新
      });
      aiCardAnchorElementRef.current = anchorElement;
      console.log('[SubtitleList] AICard 状态已设置');

      // Step 3: 构建高亮数据
      const isCrossCue = affectedCues.length > 1;
      const highlightGroupId = isCrossCue ? generateUUID() : null;

      const highlightsToCreate = affectedCues.map((affectedCue) => {
        const cue = affectedCue.cue;
        const startOffset = affectedCue.startOffset;
        const endOffset = affectedCue.endOffset;
        const highlightedText = cue.text.substring(startOffset, endOffset);

        return {
          cue_id: cue.id,
          start_offset: startOffset,
          end_offset: endOffset,
          highlighted_text: highlightedText,
          color: '#9C27B0', // 紫色，与 PRD 一致
        };
      });

      // Step 4: 调用 API 创建高亮
      const highlightResponse = await highlightService.createHighlights(
        episodeId,
        highlightsToCreate,
        highlightGroupId
      );

      if (!highlightResponse || !highlightResponse.highlight_ids || highlightResponse.highlight_ids.length === 0) {
        throw new Error('创建划线失败：服务器返回无效数据');
      }

      // 使用第一个 Highlight ID 进行查询（单 cue 时只有一个，跨 cue 时使用第一个）
      const highlightId = highlightResponse.highlight_ids[0];
      
      // 更新 ref，确保后续操作能拿到 ID
      aiCardHighlightIdRef.current = highlightId;

      // 更新本地 highlights 状态（显示下划线）
      const newHighlights = highlightsToCreate.map((h, index) => ({
        id: highlightResponse.highlight_ids[index],
        cue_id: h.cue_id,
        start_offset: h.start_offset,
        end_offset: h.end_offset,
        highlighted_text: h.highlighted_text,
        color: h.color,
        highlight_group_id: highlightGroupId,
      }));
      setInternalHighlights((prev) => [...prev, ...newHighlights]);

      // Step 5: 调用 AI 查询 API
      const queryResponse = await aiService.queryAI(highlightId);

      // Step 6: 更新 AICard（显示结果）
      setAiCardState((prev) => ({
        ...prev,
        responseData: queryResponse.response,
        isLoading: false,
        queryId: queryResponse.query_id,
        highlightId: highlightId, // 补全 highlightId，现在可以添加到笔记了
      }));

      // 清除文本选择（但保持 AICard 显示）
      clearSelection();
    } catch (error) {
      console.error('[SubtitleList] AI 查询失败:', error);
      console.error('[SubtitleList] 错误详情:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      // 判断是否为超时错误（HTTP 504 或错误信息包含"超时"）
      const isTimeoutError = error.response?.status === 504 || 
                            error.response?.data?.detail?.includes('超时') ||
                            error.message?.includes('超时');
      
      if (isTimeoutError) {
        // 超时错误：先显示 AICard 显示"AI查询失败"提示，然后自动消失
        setAiCardState((prev) => ({
          ...prev,
          responseData: null, // 设置为 null 以显示错误提示
          isLoading: false,
        }));
        
        // 3秒后自动关闭 AICard
        setTimeout(() => {
          setAiCardState({
            isVisible: false,
            anchorPosition: null,
            queryText: null,
            responseData: null,
            isLoading: false,
            queryId: null,
            highlightId: null,
          });
          aiCardAnchorElementRef.current = null;
          // 注意：不删除 highlight，保留划线以便用户重试
        }, 3000);
      } else {
        // 其他错误：显示 Snackbar 提示，关闭 AICard，删除 highlight
        const errorMessage = error.response?.data?.detail || error.message || 'AI 查询失败，请重试';
        setAiQueryError(errorMessage);
        setAiQueryErrorOpen(true);
        
        // 关闭 AICard 并删除 highlight（如果已创建）
        const errorHighlightId = aiCardHighlightIdRef.current;
        
        if (errorHighlightId) {
          try {
            // 使用函数式更新获取最新的 internalHighlights 状态，避免闭包问题
            let highlightGroupId = null;
            setInternalHighlights((prev) => {
              // 从 internalHighlights 中找到对应的 highlight，获取 highlight_group_id
              const highlightToDelete = prev.find(h => h.id === errorHighlightId);
              highlightGroupId = highlightToDelete?.highlight_group_id;
              // 先返回原状态，等 API 调用成功后再更新
              return prev;
            });
            
            // 调用 API 删除 highlight（后端会自动处理按组删除）
            await highlightService.deleteHighlight(errorHighlightId);
            
            // 从 internalHighlights 状态中移除对应的 highlight(s)
            setInternalHighlights((prev) => {
              if (highlightGroupId) {
                // 跨 cue 划线：删除整组
                return prev.filter(h => h.highlight_group_id !== highlightGroupId);
              } else {
                // 单 cue 划线：只删除当前 highlight
                return prev.filter(h => h.id !== errorHighlightId);
              }
            });
          } catch (deleteError) {
            console.error('[SubtitleList] AI 查询失败后删除 highlight 失败:', deleteError);
            // 即使删除失败，也继续关闭 AICard
          }
        }
        
        setAiCardState({
          isVisible: false,
          anchorPosition: null,
          queryText: null,
          responseData: null,
          isLoading: false,
          queryId: null,
          highlightId: null,
        });
        aiCardAnchorElementRef.current = null;
        aiCardHighlightIdRef.current = null;
      }
      
      // 清除文本选择
      clearSelection();
    } finally {
      // 重置查询状态，允许下次查询
      isQueryingRef.current = false;
    }
  }, [episodeId, affectedCues, selectedText, generateUUID, clearSelection, anchorPosition]);

  // 处理添加到笔记
  const handleAddToNote = useCallback(async (responseData, queryId) => {
    if (!episodeId || !responseData || !queryId) {
      console.warn('[SubtitleList] 无法添加到笔记：缺少必要参数');
      return;
    }

    try {
      // Step 1: 根据 responseData.type 格式化笔记内容
      let noteContent = '';
      
      if (responseData.type === 'word' || responseData.type === 'phrase') {
        // word/phrase 类型：definition + explanation
        const parts = [];
        if (responseData.content.definition) {
          parts.push(responseData.content.definition);
        }
        if (responseData.content.explanation) {
          parts.push(responseData.content.explanation);
        }
        noteContent = parts.join('\n');
      } else if (responseData.type === 'sentence') {
        // sentence 类型：translation + highlight_vocabulary
        const parts = [];
        if (responseData.content.translation) {
          parts.push(responseData.content.translation);
        }
        if (responseData.content.highlight_vocabulary && responseData.content.highlight_vocabulary.length > 0) {
          parts.push('\n难点词汇：');
          responseData.content.highlight_vocabulary.forEach((vocab) => {
            parts.push(`- ${vocab.term}: ${vocab.definition}`);
          });
        }
        noteContent = parts.join('\n');
      }

      // Step 2: 使用存储的 highlightId（从 ref 获取，避免闭包问题）
      const currentHighlightId = aiCardHighlightIdRef.current;
      if (!currentHighlightId) {
        throw new Error('找不到对应的划线记录 ID');
      }

      // Step 3: 创建 Note
      const noteResponse = await noteService.createNote(
        episodeId,
        currentHighlightId,
        'ai_card',
        noteContent,
        queryId
      );

      // Step 4: 关闭 AICard
      setAiCardState({
        isVisible: false,
        anchorPosition: null,
        queryText: null,
        responseData: null,
        isLoading: false,
        queryId: null,
        highlightId: null,
      });
      aiCardAnchorElementRef.current = null;

      // Step 5: 通知父组件刷新笔记列表
      if (onNoteCreate) {
        onNoteCreate();
      }

      // Step 6: 更新 highlights（下划线已经显示，无需额外更新）
      // Note: highlights 已经在 handleQuery 中更新，这里不需要再次更新
    } catch (error) {
      console.error('[SubtitleList] 添加到笔记失败:', error);
      
      // 显示错误提示
      const errorMessage = error.response?.data?.detail || error.message || '添加到笔记失败，请重试';
      setAiQueryError(errorMessage);
      setAiQueryErrorOpen(true);
    }
  }, [episodeId, onNoteCreate]);

  // 处理关闭 AICard
  const handleCloseAICard = useCallback(async () => {
    const currentHighlightId = aiCardHighlightIdRef.current;
    
    // 如果有 highlightId，删除对应的 highlight（包括跨 cue 的情况）
    if (currentHighlightId) {
      try {
        // 使用函数式更新获取最新的 internalHighlights 状态，避免闭包问题
        let highlightGroupId = null;
        setInternalHighlights((prev) => {
          // 从 internalHighlights 中找到对应的 highlight，获取 highlight_group_id
          const highlightToDelete = prev.find(h => h.id === currentHighlightId);
          highlightGroupId = highlightToDelete?.highlight_group_id;
          // 先返回原状态，等 API 调用成功后再更新
          return prev;
        });
        
        // 调用 API 删除 highlight（后端会自动处理按组删除）
        await highlightService.deleteHighlight(currentHighlightId);
        
        // 从 internalHighlights 状态中移除对应的 highlight(s)
        setInternalHighlights((prev) => {
          if (highlightGroupId) {
            // 跨 cue 划线：删除整组
            return prev.filter(h => h.highlight_group_id !== highlightGroupId);
          } else {
            // 单 cue 划线：只删除当前 highlight
            return prev.filter(h => h.id !== currentHighlightId);
          }
        });
      } catch (error) {
        console.error('[SubtitleList] 删除 highlight 失败:', error);
        // 即使删除失败，也继续关闭 AICard，避免界面卡住
      }
    }
    
    setAiCardState({
      isVisible: false,
      anchorPosition: null,
      queryText: null,
      responseData: null,
      isLoading: false,
      queryId: null,
      highlightId: null,
    });
    aiCardAnchorElementRef.current = null;
    aiCardHighlightIdRef.current = null;
  }, []);

  // 处理记录想法回调
  const handleThought = useCallback(() => {
    // TODO: 后续 Task 3.7 实现笔记卡片功能
    // 暂时使用占位逻辑
    console.log('[SubtitleList] 记录想法操作:', {
      selectedText,
      selectionRange,
      affectedCues,
    });
    clearSelection();
  }, [selectedText, selectionRange, affectedCues, clearSelection]);

  // 加载字幕数据
  // 优先级：propsCues > episodeId > mock 数据
  useEffect(() => {
    // 清理之前的加载进度定时器
    if (loadingProgressIntervalRef.current) {
      clearInterval(loadingProgressIntervalRef.current);
      loadingProgressIntervalRef.current = null;
    }
    
    if (propsCues) {
      // 如果传入了 cues prop，直接使用
      // 使用 requestAnimationFrame 避免在 effect 中同步调用 setState
      requestAnimationFrame(() => {
        setCues(propsCues);
        setSubtitleLoadingState(null);
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(null);
      });
    } else if (episodeId) {
      // 根据PRD：字幕加载过程中，在英文字幕区域中间显示提示"请稍等，字幕加载中"和进度条
      setSubtitleLoadingState('loading');
      setSubtitleLoadingProgress(0);
      setSubtitleLoadingError(null);
      // 根据PRD：字幕加载过程中，在英文字幕区域中间显示提示"请稍等，字幕加载中"和进度条
      setSubtitleLoadingState('loading');
      setSubtitleLoadingProgress(0);
      setSubtitleLoadingError(null);
      
      // 模拟字幕加载进度条（前端模拟，匀速增长）
      const startTime = Date.now();
      const loadDuration = 2000; // 假设加载需要2秒
      
      loadingProgressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / loadDuration) * 100, 99);
        setSubtitleLoadingProgress(progress);
      }, 100);
      
      // 如果有 episodeId，从 API 加载字幕数据
      getCuesByEpisodeId(episodeId).then((cues) => {
        // 清理进度定时器
        if (loadingProgressIntervalRef.current) {
          clearInterval(loadingProgressIntervalRef.current);
          loadingProgressIntervalRef.current = null;
        }
        
        // 加载完成，进度条直接走到100%
        setSubtitleLoadingProgress(100);
        
        // 短暂延迟后清除加载状态
        setTimeout(() => {
          setCues(cues);
          setSubtitleLoadingState(null);
          setSubtitleLoadingProgress(0);
        }, 300);
      }).catch((error) => {
        // 清理进度定时器
        if (loadingProgressIntervalRef.current) {
          clearInterval(loadingProgressIntervalRef.current);
          loadingProgressIntervalRef.current = null;
        }
        
        console.error('[SubtitleList] 加载字幕失败:', error);
        setSubtitleLoadingState('error');
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(error.response?.data?.detail || error.message || '字幕加载失败，请重试');
        
        // 如果 API 失败，不降级到 mock 数据（根据PRD，应该显示错误提示）
      });
    } else {
      // 既没有 cues 也没有 episodeId，使用 mock 数据
      getMockCues().then((mockCues) => {
        setCues(mockCues);
        setSubtitleLoadingState(null);
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(null);
      });
    }
    
    // 清理函数
    return () => {
      if (loadingProgressIntervalRef.current) {
        clearInterval(loadingProgressIntervalRef.current);
        loadingProgressIntervalRef.current = null;
      }
    };
  }, [propsCues, episodeId]);

  // 记录已加载 highlights 的 episodeId，避免重复加载
  const loadedHighlightsEpisodeIdRef = useRef(null);
  
  // 加载已有 highlights（当 episodeId 变化时，或 noteDeleteTrigger 变化时）
  useEffect(() => {
    // 如果使用 props 传入的 highlights，不加载
    if (highlights && highlights.length > 0) {
      return;
    }
    
    // 如果没有 episodeId，不加载
    if (!episodeId) {
      return;
    }
    
    // 如果 noteDeleteTrigger 变化，重置加载标记以强制重新加载
    if (noteDeleteTrigger > 0) {
      loadedHighlightsEpisodeIdRef.current = null;
    }
    
    // 如果已经加载过这个 episodeId 的 highlights，且没有刷新触发，不重复加载
    if (loadedHighlightsEpisodeIdRef.current === episodeId) {
      return;
    }

    // 标记为正在加载
    loadedHighlightsEpisodeIdRef.current = episodeId;

    // 从 API 加载 highlights
    highlightService.getHighlightsByEpisode(episodeId)
      .then((loadedHighlights) => {
        // 获取所有笔记（不管类型），找出所有有笔记的 highlights
        // 只要笔记存在，对应的 highlight 就应该显示下划线
        return noteService.getNotesByEpisode(episodeId)
          .then((notes) => {
            // 找出所有笔记对应的 highlight_id（不管笔记类型）
            const noteHighlightIds = new Set(
              notes.map(note => note.highlight_id)
            );

            // 保留所有有笔记的 highlights（不管笔记类型）
            // 这样所有类型的笔记（ai_card、thought、underline）对应的下划线都会显示
            const highlightsWithNotes = loadedHighlights.filter(h => 
              noteHighlightIds.has(h.id)
            );

            setInternalHighlights(highlightsWithNotes);
          });
      })
      .catch((error) => {
        console.error('[SubtitleList] 加载 highlights 失败:', error);
        // 网络错误（后端未运行）时，保持标记，避免无限重试
        // 其他错误也保持标记，避免频繁重试
        // 不显示错误提示，避免干扰用户（highlights 加载失败不影响主要功能）
      });
  }, [episodeId, noteDeleteTrigger]); // 添加 noteDeleteTrigger 依赖，当笔记删除时触发刷新

  // 监听转录状态变化：当状态变为 completed 时，重新加载字幕；当状态变为 failed 时，显示错误提示
  useEffect(() => {
    // 如果没有 transcriptionStatus，跳过
    if (!transcriptionStatus) {
      // 仍然需要更新 ref，以便后续比较
      previousTranscriptionStatusRef.current = transcriptionStatus || null;
      return;
    }
    
    // 如果转录状态从非 completed 变为 completed，且没有传入 propsCues，则重新加载字幕
    const previousStatus = previousTranscriptionStatusRef.current;
    const currentStatus = transcriptionStatus;
    
    if (
      previousStatus !== 'completed' 
      && currentStatus === 'completed' 
      && !propsCues 
      && episodeId
    ) {
      console.log('[SubtitleList] 转录已完成，重新加载字幕数据');
      getCuesByEpisodeId(episodeId).then((cues) => {
        if (cues && cues.length > 0) {
          setCues(cues);
        }
        // 清除识别错误状态
        setTranscriptionError(null);
      }).catch((error) => {
        console.error('[SubtitleList] 转录完成后加载字幕失败:', error);
      });
    }
    
    // 根据PRD c.ii：如果转录状态为 failed，显示错误提示
    if (currentStatus === 'failed') {
      // 尝试从segments中获取错误信息（从失败的segment中获取）
      // 如果没有错误信息，使用默认消息
      let rawErrorMessage = null;
      if (segments && segments.length > 0) {
        const failedSegment = segments.find(s => s.status === 'failed' && s.error_message);
        if (failedSegment && failedSegment.error_message) {
          rawErrorMessage = failedSegment.error_message;
        }
      }
      // 将技术性错误转换为用户友好的提示
      const friendlyError = formatUserFriendlyError(rawErrorMessage);
      setTranscriptionError(friendlyError);
    } else if (currentStatus !== 'failed') {
      // 如果状态不是failed，清除错误信息
      setTranscriptionError(null);
    }
    
    // 更新上一次的状态
    previousTranscriptionStatusRef.current = currentStatus;
  }, [transcriptionStatus, propsCues, episodeId, segments, formatUserFriendlyError]);

  /**
   * 处理 speaker 分组，为每个新的 speaker 添加 speaker 标签
   * 根据 PRD 6.2.4.1，speaker 标签单独占据一行，显示在每个 speaker 开始说的第一句话的上面
   * 
   * @returns {Array} 处理后的数组，包含字幕和 speaker 标签
   */
  const processedItems = useMemo(() => {
    if (!cues || cues.length === 0) {
      return [];
    }

    const items = [];
    let previousSpeaker = null;

    cues.forEach((cue, index) => {
      // 如果是新的 speaker，添加 speaker 标签
      if (cue.speaker !== previousSpeaker) {
        items.push({
          type: 'speaker',
          speaker: cue.speaker,
          cue: cue,
          index: index,
        });
        previousSpeaker = cue.speaker;
      }

      // 添加字幕行
      items.push({
        type: 'subtitle',
        cue: cue,
        index: index,
        showSpeaker: false,
      });
    });

    return items;
  }, [cues]);

  /**
   * 创建字幕行的 ref 回调
   */
  const createSubtitleRef = useCallback((index) => {
    return (element) => {
      if (element) {
        const refObj = { current: element };
        subtitleRefs.current[index] = refObj;
        registerSubtitleRef(index, refObj);
      }
    };
  }, [registerSubtitleRef]);

  /**
   * 自动滚动到当前播放的字幕
   * 根据 PRD 6.2.4.1：
   * - 如果用户在界面上没有进行任何操作（如点击、滚动等），当高亮字幕在不可见区域时，自动滚动，让高亮字幕保持在屏幕上1/3处
   * - 如果用户使用滚轮操作屏幕，则停止滚动，用户鼠标没有动作之后5s，重新回到滚动状态
   * - 如果用户在页面上进行划线操作、"查询和想法操作弹框"展示或者是"AI查询卡片"在展示的时候，不自动滚动
   */
  useEffect(() => {
    // 如果用户正在滚动，不执行自动滚动
    const scrollingRef = externalIsUserScrollingRef || internalIsUserScrollingRef;
    if (scrollingRef.current) {
      return;
    }

    // 如果用户正在进行交互操作（划线、查询卡片展示等），不执行自动滚动
    if (isInteracting) {
      return;
    }

    if (currentSubtitleIndex !== null && containerRef.current) {
      const ref = subtitleRefs.current[currentSubtitleIndex];
      if (ref && ref.current) {
        const element = ref.current;
        const container = containerRef.current;
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 检查元素是否完全在可见区域内
        // 元素在可见区域：元素的顶部 >= 容器的顶部 && 元素的底部 <= 容器的底部
        const isInViewport = 
          elementRect.top >= containerRect.top && 
          elementRect.bottom <= containerRect.bottom;

        // 调试信息
        const containerScrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const containerWidth = container.clientWidth;
        const elementTopRelativeToContainer = elementRect.top - containerRect.top + containerScrollTop;
        const elementHeight = elementRect.height;
        
        const scrollingRef = externalIsUserScrollingRef || internalIsUserScrollingRef;

        // 只有当高亮字幕不在可见区域时，才自动滚动
        if (!isInViewport) {
          // 计算元素相对于滚动容器的位置
          // 使用 getBoundingClientRect 获取相对于视口的位置，然后加上容器的 scrollTop
          
          // 滚动到屏幕上1/3处（让元素顶部距离容器顶部为容器高度的1/3）
          // 这样高亮字幕会显示在屏幕上半部分，更符合用户预期
          const scrollTarget = elementTopRelativeToContainer - containerHeight / 3;
          const finalScrollTarget = Math.max(0, scrollTarget);

          container.scrollTo({
            top: finalScrollTarget,
            behavior: 'smooth',
          });
        } else {
          // 即使在可见区域内，也记录当前位置信息，帮助调试
          const currentPositionRatio = (elementRect.top - containerRect.top) / containerHeight;
          const expectedPositionRatio = 1 / 3;
          const positionDiff = currentPositionRatio - expectedPositionRatio;
          
        }
      }
    }
      }, [currentSubtitleIndex, containerRef, externalIsUserScrollingRef, isInteracting]);

  // 已加载的segment索引集合（防止重复加载）
  const loadedSegmentIndicesRef = useRef(new Set());
  
  // 滚动触发异步加载逻辑
  // 根据PRD d.ix：优化滚动加载字幕去重，避免重复加载已加载的segment
  const checkAndLoadNextSegment = useCallback(async () => {
    if (!episodeId || !segments || segments.length === 0) {
      return;
    }
    
    // 基于当前cues，找到已加载的最后一个segment索引
    let lastLoadedIndex = -1;
    if (cues && cues.length > 0) {
      // 找到cues中的最大时间戳
      const maxCueTime = Math.max(...cues.map(cue => cue.end_time || 0));
      
      // 找到包含这个时间戳的最后一个segment
      const loadedSegments = segments
        .filter(s => s.status === 'completed' && maxCueTime >= s.start_time)
        .sort((a, b) => b.segment_index - a.segment_index);
      
      if (loadedSegments.length > 0) {
        lastLoadedIndex = loadedSegments[0].segment_index;
      }
    }
    
    // 检查下一个segment
    const nextSegmentIndex = lastLoadedIndex + 1;
    const nextSegment = segments.find(s => s.segment_index === nextSegmentIndex);
    
    if (!nextSegment) {
      // 没有下一个segment，说明全部完成
      return;
    }
    
    // 检查是否已经加载过（双重检查，防止重复加载）
    if (loadedSegmentIndicesRef.current.has(nextSegmentIndex)) {
      return;
    }
    
    // 如果下一个segment已完成，加载字幕
    if (nextSegment.status === 'completed') {
      // 标记为已加载（在加载前标记，防止重复触发）
      loadedSegmentIndicesRef.current.add(nextSegmentIndex);
      
      // 重新加载字幕数据（包含新完成的segment）
      try {
        const newCues = await getCuesByEpisodeId(episodeId);
        // 只有当新cues数量大于当前cues数量时，才更新（避免重复加载）
        if (!cues || newCues.length > cues.length) {
          setCues(newCues);
        }
      } catch (error) {
        console.error('[SubtitleList] 加载新segment字幕失败:', error);
        // 加载失败时，移除标记，允许重试
        loadedSegmentIndicesRef.current.delete(nextSegmentIndex);
      }
    } else if (nextSegment.status === 'pending' || (nextSegment.status === 'failed' && nextSegment.retry_count < 3)) {
      // 如果下一个segment未开始或失败但可重试，触发识别
      // 注意：这里不标记为已加载，因为segment还未完成
      try {
        await subtitleService.triggerSegmentTranscription(episodeId, nextSegmentIndex);
        console.log(`[SubtitleList] 已触发 Segment ${nextSegmentIndex} 的识别任务`);
      } catch (error) {
        console.error(`[SubtitleList] 触发 Segment ${nextSegmentIndex} 识别失败:`, error);
      }
    }
    // 如果status是processing，不处理，等待完成
  }, [episodeId, segments, cues]);
  
  /**
   * 监听用户滚动事件（仅当使用内部滚动容器时）
   * 根据 PRD 6.2.4.1，用户使用滚轮操作屏幕时，停止滚动，用户鼠标没有动作之后5s，重新回到滚动状态
   * 同时检查是否滚动到底部，触发下一个segment的加载
   */
  const handleScroll = useCallback(() => {
    if (scrollContainerRef) {
      // 如果使用外部滚动容器，滚动事件在外部处理
      return;
    }
    
    // 只使用内部 ref，避免修改外部传入的 ref
    internalIsUserScrollingRef.current = true;

    // 清除之前的定时器
    if (internalUserScrollTimeoutRef.current) {
      clearTimeout(internalUserScrollTimeoutRef.current);
    }

    // 5秒后恢复自动滚动
    internalUserScrollTimeoutRef.current = setTimeout(() => {
      internalIsUserScrollingRef.current = false;
    }, 5000);
    
    // 检查是否滚动到底部（距离底部 < 100px）
    const container = internalContainerRef.current;
    if (container) {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceToBottom < 100) {
        // 滚动到底部，触发检查下一个segment
        checkAndLoadNextSegment();
      }
    }
  }, [scrollContainerRef, checkAndLoadNextSegment]);
  
  // 监听外部滚动容器的滚动事件
  useEffect(() => {
    if (!scrollContainerRef || !scrollContainerRef.current) {
      return;
    }
    
    const container = scrollContainerRef.current;
    let scrollTimeout = null;
    
    const handleExternalScroll = () => {
      // 检查是否滚动到底部
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceToBottom < 100) {
        // 滚动到底部，触发检查下一个segment
        // 使用防抖，避免频繁触发
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
          checkAndLoadNextSegment();
        }, 300); // 300ms防抖
      }
    };
    
    container.addEventListener('scroll', handleExternalScroll);
    return () => {
      container.removeEventListener('scroll', handleExternalScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [scrollContainerRef, checkAndLoadNextSegment]);
  
  // 当segments或cues变化时，重新计算已加载的segment索引
  // 根据PRD d.ix：基于当前已加载的cues对应的segment，计算已加载的segment索引
  useEffect(() => {
    if (!segments || segments.length === 0) {
      loadedSegmentIndicesRef.current.clear();
      return;
    }
    
    // 基于当前cues的时间范围，计算已加载的segment索引
    // 如果cues为空，则没有已加载的segment
    if (!cues || cues.length === 0) {
      loadedSegmentIndicesRef.current.clear();
      return;
    }
    
    // 找到cues中的最大时间戳
    const maxCueTime = Math.max(...cues.map(cue => cue.end_time || 0));
    
    // 根据时间戳，找到对应的segment索引
    // segment的时间范围：start_time <= cueTime < end_time
    const loadedIndices = new Set();
    segments.forEach(segment => {
      // 如果cues的最大时间戳 >= segment的start_time，说明这个segment的字幕已经加载
      // 并且segment状态为completed
      if (segment.status === 'completed' && maxCueTime >= segment.start_time) {
        loadedIndices.add(segment.segment_index);
      }
    });
    
    loadedSegmentIndicesRef.current = loadedIndices;
  }, [segments, cues]);

  // 清理定时器（仅当使用内部滚动容器时）
  useEffect(() => {
    if (scrollContainerRef) {
      // 如果使用外部滚动容器，定时器在外部处理
      return;
    }
    
    return () => {
      if (internalUserScrollTimeoutRef.current) {
        clearTimeout(internalUserScrollTimeoutRef.current);
      }
    };
  }, [scrollContainerRef]);

  // Loading 状态：显示 Skeleton
  if (isLoading) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} sx={{ mb: 1 }} />
        <Skeleton variant="text" height={60} />
      </Box>
    );
  }

  // 字幕加载状态：显示加载提示和进度条（根据PRD：在英文字幕区域中间显示）
  if (subtitleLoadingState === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <Typography variant="body1" sx={{ color: 'text.primary' }}>
          请稍等，字幕加载中
        </Typography>
        <Box sx={{ width: '60%', maxWidth: 400 }}>
          <LinearProgress
            variant="determinate"
            value={subtitleLoadingProgress}
            sx={{
              height: 8,
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                backgroundColor: 'primary.main',
              },
            }}
          />
        </Box>
      </Box>
    );
  }

  // 字幕加载失败状态：显示错误提示和重试按钮（根据PRD：在英文字幕区域中间显示）
  if (subtitleLoadingState === 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body1" sx={{ color: 'text.primary' }}>
            字幕加载失败，错误原因：{subtitleLoadingError}，请重试
          </Typography>
          <IconButton
            onClick={() => {
              // 重新加载字幕
              setSubtitleLoadingState('loading');
              setSubtitleLoadingProgress(0);
              setSubtitleLoadingError(null);
              
              if (episodeId) {
                // 重新触发加载
                getCuesByEpisodeId(episodeId).then((cues) => {
                  setCues(cues);
                  setSubtitleLoadingState(null);
                  setSubtitleLoadingProgress(0);
                }).catch((error) => {
                  setSubtitleLoadingState('error');
                  setSubtitleLoadingError(error.response?.data?.detail || error.message || '字幕加载失败，请重试');
                });
              }
            }}
            aria-label="重试"
            sx={{
              '&:hover': { bgcolor: 'action.hover' },
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>
    );
  }

  // 根据PRD c.ii：字幕识别失败状态：显示错误提示和重试按钮（在英文字幕区域中间显示）
  if (transcriptionStatus === 'failed') {
    // 如果没有错误信息，使用默认提示
    const displayError = transcriptionError || formatUserFriendlyError(null);
    
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 3,
          px: 3,
        }}
      >
        <Typography 
          variant="body1" 
          sx={{ 
            color: 'text.primary',
            textAlign: 'center',
            mb: 1,
          }}
        >
          {displayError}
        </Typography>
        <Button
          variant="contained"
          startIcon={<Refresh />}
          onClick={async () => {
            // 根据PRD c.ii：点击重试按钮，重新调用API进行字幕识别和说话人识别
            if (episodeId) {
              try {
                setTranscriptionError(null);
                // 调用重新开始识别API
                await subtitleService.restartTranscription(episodeId);
                // 重新开始识别后，状态会变为processing，错误提示会自动清除
              } catch (error) {
                console.error('[SubtitleList] 重新开始识别失败:', error);
                const rawError = error.response?.data?.detail || error.message;
                const friendlyError = formatUserFriendlyError(rawError);
                setTranscriptionError(friendlyError);
              }
            }
          }}
          sx={{
            '&:hover': { 
              bgcolor: 'primary.dark',
              transform: 'translateY(-1px)',
              boxShadow: 4,
            },
            '&:active': { 
              transform: 'translateY(0px)',
              boxShadow: 2,
            },
            transition: 'all 0.2s ease-in-out',
          }}
        >
          请重试
        </Button>
      </Box>
    );
  }

  // 如果没有字幕数据，显示占位内容
  if (!cues || cues.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
        }}
      >
        暂无字幕数据
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: scrollContainerRef ? 'auto' : '100%',
        minHeight: scrollContainerRef ? '100%' : 'auto',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: scrollContainerRef ? 'visible' : 'hidden',
      }}
    >
      {/* 显示翻译按钮（占位，暂不实现功能） */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          zIndex: 1,
        }}
      >
        <IconButton
          onClick={() => setShowTranslation(!showTranslation)}
          color={showTranslation ? 'primary' : 'default'}
          size="small"
          aria-label="显示翻译"
        >
          <TranslateIcon />
        </IconButton>
      </Box>

      {/* 字幕列表容器 */}
      <Box
        ref={internalContainerRef}
        onScroll={scrollContainerRef ? undefined : handleScroll}
        data-subtitle-container={scrollContainerRef ? undefined : true}
        sx={{
          width: '100%',
          height: scrollContainerRef ? 'auto' : '100%',
          overflowY: scrollContainerRef ? 'visible' : 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {processedItems.map((item) => {
          if (item.type === 'speaker') {
            // 渲染 speaker 标签行
            return (
              <SubtitleRow
                key={`speaker-${item.cue.id}`}
                cue={item.cue}
                index={item.index}
                isHighlighted={false}
                isPast={false}
                showSpeaker={true}
              />
            );
          } else {
            // 渲染字幕行
            const isHighlighted = currentSubtitleIndex === item.index;
            const isPast = currentSubtitleIndex !== null && item.index < currentSubtitleIndex;

            // 计算单词高亮进度 (0 到 1 之间的小数)
            let progress = 0;
            if (isPast) {
              progress = 1; // 过去的时间，全亮
            } else if (isHighlighted) {
              // 当前行：计算线性进度
              const cueDuration = item.cue.end_time - item.cue.start_time;
              if (cueDuration > 0) {
                // 限制在 0-1 之间
                progress = Math.min(1, Math.max(0, (currentTime - item.cue.start_time) / cueDuration));
              }
            }
            // 未来的行 progress 默认为 0

            // 获取当前 cue 的 highlights
            const cueHighlights = effectiveHighlights.filter(h => h.cue_id === item.cue.id);

            // 判断当前 cue 是否被选中
            const isSelected = affectedCues.some(ac => ac.cue.id === item.cue.id);
            
            // 获取当前 cue 的选择范围信息
            const cueSelectionRange = affectedCues.find(ac => ac.cue.id === item.cue.id) || null;

            return (
              <SubtitleRow
                key={`subtitle-${item.cue.id}`}
                ref={createSubtitleRef(item.index)}
                cue={item.cue}
                index={item.index}
                isHighlighted={isHighlighted}
                isPast={isPast}
                onClick={onCueClick}
                showSpeaker={false}
                showTranslation={showTranslation}
                progress={progress}
                highlights={cueHighlights}
                onHighlightClick={onHighlightClick}
                isSelected={isSelected}
                selectionRange={cueSelectionRange}
              />
            );
          }
        })}
      </Box>
      
      {/* 底部状态提示区域（后续静默识别） */}
      <SubtitleListFooter
        segments={segments}
        transcriptionStatus={transcriptionStatus}
        episodeId={episodeId}
      />

      {/* 文本选择菜单 */}
      {selectedText && anchorPosition && (
        <SelectionMenu
          anchorPosition={anchorPosition}
          selectedText={selectedText}
          affectedCues={affectedCues}
          onUnderline={handleUnderline}
          onQuery={handleQuery}
          onThought={handleThought}
          onClose={clearSelection}
        />
      )}

      {/* AI 查询卡片 */}
      {aiCardState.isVisible && (
        <AICard
          anchorPosition={aiCardState.anchorPosition}
          anchorElementRef={aiCardAnchorElementRef}
          queryText={aiCardState.queryText}
          responseData={aiCardState.responseData}
          isLoading={aiCardState.isLoading}
          onAddToNote={handleAddToNote}
          onClose={handleCloseAICard}
          queryId={aiCardState.queryId}
        />
      )}

      {/* 错误提示 Snackbar */}
      <Snackbar
        open={highlightErrorOpen}
        autoHideDuration={6000}
        onClose={() => setHighlightErrorOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setHighlightErrorOpen(false)}
          severity="error"
          sx={{ width: '100%' }}
        >
          {highlightError}
        </Alert>
      </Snackbar>

      {/* AI 查询错误提示 Snackbar */}
      <Snackbar
        open={aiQueryErrorOpen}
        autoHideDuration={6000}
        onClose={() => setAiQueryErrorOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setAiQueryErrorOpen(false)}
          severity="error"
          sx={{ width: '100%' }}
        >
          {aiQueryError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/**
 * SubtitleListFooter 组件
 * 
 * 显示字幕列表底部的状态提示
 * 根据PRD d.x：
 * - 如果下一个segment正在识别中：显示"……请稍等，努力识别字幕中……"
 * - 如果segment识别失败且可重试，自动触发重试（最多3次）
 * - 如果所有segment已完成：显示"-END-"
 */
function SubtitleListFooter({ segments, transcriptionStatus, episodeId }) {
  const [nextSegmentStatus, setNextSegmentStatus] = useState(null);
  const [allCompleted, setAllCompleted] = useState(false);
  const [nextSegment, setNextSegment] = useState(null);
  const retryTimeoutRef = useRef(null);
  
  useEffect(() => {
    if (!segments || segments.length === 0) {
      setNextSegmentStatus(null);
      setAllCompleted(false);
      setNextSegment(null);
      return;
    }
    
    // 找到已加载字幕对应的最后一个segment
    // 这里简化处理：找到最后一个status为completed的segment
    const completedSegments = segments.filter(s => s.status === 'completed');
    const lastCompletedIndex = completedSegments.length > 0
      ? Math.max(...completedSegments.map(s => s.segment_index))
      : -1;
    
    // 检查下一个segment
    const next = segments.find(s => s.segment_index === lastCompletedIndex + 1);
    
    if (!next) {
      // 没有下一个segment，说明全部完成
      setAllCompleted(true);
      setNextSegmentStatus(null);
      setNextSegment(null);
    } else {
      setAllCompleted(false);
      setNextSegmentStatus(next.status);
      setNextSegment(next);
    }
  }, [segments]);
  
  // 根据PRD d.x：如果segment识别失败且可重试，自动触发重试（最多3次）
  useEffect(() => {
    // 清理之前的重试定时器
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    // 如果下一个segment失败且可重试（retry_count < 3），自动触发重试
    if (nextSegment && nextSegment.status === 'failed' && nextSegment.retry_count < 3 && episodeId) {
      // 延迟1秒后自动重试，避免频繁触发
      retryTimeoutRef.current = setTimeout(async () => {
        try {
          await subtitleService.triggerSegmentTranscription(episodeId, nextSegment.segment_index);
          console.log(`[SubtitleListFooter] 已自动重试 Segment ${nextSegment.segment_index} 的识别任务（重试次数：${nextSegment.retry_count + 1}）`);
        } catch (error) {
          console.error(`[SubtitleListFooter] 自动重试 Segment ${nextSegment.segment_index} 失败:`, error);
        }
      }, 1000);
    }
    
    // 清理函数
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [nextSegment, episodeId]);
  
  // 如果转录已完成，显示-END-
  if (transcriptionStatus === 'completed' || allCompleted) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 2,
          color: 'text.secondary',
          fontSize: '0.875rem',
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          -END-
        </Typography>
      </Box>
    );
  }
  
  // 如果下一个segment正在识别中，显示提示
  // 根据PRD d.vi：如果下1个segment在识别过程中，则在屏幕底部居中显示一行字"……请稍等，努力识别字幕中……"
  if (nextSegmentStatus === 'processing' || nextSegmentStatus === 'pending') {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 2,
          color: 'text.secondary',
          fontSize: '0.875rem',
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          ……请稍等，努力识别字幕中……
        </Typography>
      </Box>
    );
  }
  
  // 其他情况不显示
  return null;
}
