import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, IconButton, Button, Skeleton, Typography, LinearProgress, Stack, Snackbar, Alert } from '@mui/material';
import { Translate as TranslateIcon, Refresh } from '@mui/icons-material';
import SubtitleRow from './SubtitleRow';
import SelectionMenu from './SelectionMenu';
import DeleteButton from './DeleteButton';
import { useSubtitleSync } from '../../hooks/useSubtitleSync';
import { useTextSelection } from '../../hooks/useTextSelection';
import { getMockCues, getCuesByEpisodeId, getCuesBySegmentRange, subtitleService } from '../../services/subtitleService';
import { highlightService } from '../../services/highlightService';
import { noteService } from '../../services/noteService';
import { aiService } from '../../services/aiService';
import AICard from './AICard';

/**
 * SubtitleList 组件
 * * 字幕列表容器组件，管理字幕列表的滚动和定位
 * * 功能描述：
 * - 字幕列表容器组件
 * - 管理字幕列表的滚动和定位
 * - 配合 useSubtitleSync 实现自动滚动到当前字幕
 * - 处理 speaker 分组显示
 * * 相关PRD：
 * - PRD 6.2.4.1: 英文字幕区域
 * * @module components/subtitles/SubtitleList
 * * @param {Object} props
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
 * @param {Function} [props.onNoteDelete] - 删除笔记成功后的回调函数 (noteId: number) => void
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
  onNoteDelete,
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
  const aiCardHighlightDataRef = useRef(null); // 用于存储 highlight 数据，避免闭包问题
  const isQueryingRef = useRef(false); // 防止重复调用 AI 查询
  const [aiQueryError, setAiQueryError] = useState(null);
  const [aiQueryErrorOpen, setAiQueryErrorOpen] = useState(false);
  
  // Notes Map 状态管理（用于快速查询笔记类型）
  const [notesMap, setNotesMap] = useState(new Map()); // Map<highlight_id, note>
  
  // 删除按钮相关状态
  const [deleteButtonState, setDeleteButtonState] = useState({
    isVisible: false,
    anchorPosition: null,
    noteId: null,
    highlightId: null,
  });
  const deleteButtonNoteIdRef = useRef(null); // 用于存储 noteId，避免闭包问题
  const deleteButtonHighlightIdRef = useRef(null); // 用于存储 highlightId，避免闭包问题
  
  // 使用 props 传入的 highlights，如果没有则使用内部状态
  // 注意：如果 props 传入了 highlights，优先使用 props（父组件管理状态）
  const effectiveHighlights = (highlights && highlights.length > 0) ? highlights : internalHighlights;
  
  const internalContainerRef = useRef(null);
  const internalUserScrollTimeoutRef = useRef(null);
  const internalIsUserScrollingRef = useRef(false);
  const subtitleRefs = useRef({});
  const previousTranscriptionStatusRef = useRef(transcriptionStatus || null);
  const loadingProgressIntervalRef = useRef(null);
  const lastLoadedSegmentIndexRef = useRef(-1); // 记录已加载的最后一个segment索引（初始为-1）
  const isLoadingSubtitlesRef = useRef(false); // 防止重复加载字幕
  const lastLoadedEpisodeIdRef = useRef(null); // 记录已加载的 episodeId，避免重复加载
  const hasErrorRef = useRef(false); // 跟踪是否已经设置了错误状态，避免被重置
  const loadingSegmentsRef = useRef(new Set()); // 防止重复加载同一个segment

  // 使用外部滚动容器或内部滚动容器
  // 当使用外部滚动容器时，containerRef 指向外部容器；否则使用内部容器
  const containerRef = scrollContainerRef || internalContainerRef;

  /**
   * 将技术性错误信息转换为用户友好的提示
   * * @param {string} errorMessage - 原始错误信息
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
      let createdNotes = [];
      try {
        const notePromises = highlightResponse.highlight_ids.map((highlightId) =>
          noteService.createNote(episodeId, highlightId, 'underline', null, null)
        );
        createdNotes = await Promise.all(notePromises);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:279',message:'创建Note成功，准备更新notesMap',data:{createdNotesCount:createdNotes.length,highlightIds:highlightResponse.highlight_ids},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      } catch (noteError) {
        // Note API 可能还未实现，显示错误提示，但不影响下划线显示
        console.warn('[SubtitleList] 创建 Note 失败（可能是后端 API 未实现）:', noteError);
        const errorMessage = noteError.response?.data?.detail || noteError.message || '创建笔记失败';
        setHighlightError(errorMessage);
        setHighlightErrorOpen(true);
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

      // 更新 notesMap：将新创建的 notes 添加到 notesMap 中
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:304',message:'准备更新notesMap，检查createdNotes',data:{createdNotesCount:createdNotes.length,hasCreatedNotes:createdNotes.length>0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (createdNotes.length > 0) {
        setNotesMap((prev) => {
          const newMap = new Map(prev);
          createdNotes.forEach((noteResponse, index) => {
            const highlightId = highlightResponse.highlight_ids[index];
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:312',message:'添加note到notesMap',data:{noteId:noteResponse.id,highlightId:highlightId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            newMap.set(highlightId, {
              id: noteResponse.id,
              highlight_id: highlightId,
              content: null,
              note_type: 'underline',
              origin_ai_query_id: null,
              created_at: noteResponse.created_at || new Date().toISOString(),
              updated_at: noteResponse.created_at || new Date().toISOString(),
            });
          });
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:324',message:'notesMap更新完成',data:{newMapSize:newMap.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          return newMap;
        });
      }

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
      
      // 更新本地 highlights 状态（显示下划线）
      const newHighlights = highlightsToCreate.map((h, index) => ({
        id: highlightResponse.highlight_ids[index],
        cue_id: h.cue_id,
        start_offset: h.start_offset,
        end_offset: h.end_offset,
        highlighted_text: h.highlighted_text,
        color: h.color,
        highlight_group_id: highlightGroupId,
        created_at: new Date().toISOString(), // 添加时间戳
        updated_at: new Date().toISOString(),
      }));
      
      // 更新 ref，确保后续操作能拿到 ID 和数据
      aiCardHighlightIdRef.current = highlightId;
      aiCardHighlightDataRef.current = newHighlights[0]; // 保存第一个 highlight 数据（用于创建笔记）
      
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
      
      // 判断是否为配额超限错误（HTTP 429 或错误信息包含"配额"）
      const isQuotaExceeded = error.response?.status === 429 || 
                              error.response?.data?.detail?.includes('配额') ||
                              error.response?.data?.detail?.includes('quota');
      
      // 统一错误处理：所有AI查询失败都应该删除highlight，不显示下划线
      // 根据错误类型显示不同的错误消息
      let errorMessage = 'AI 查询失败，请重试';
      if (isQuotaExceeded) {
        errorMessage = error.response?.data?.detail || 'AI 查询配额已用完，请稍后重试';
      } else if (isTimeoutError) {
        errorMessage = error.response?.data?.detail || 'AI 查询超时，请重试';
      } else {
        errorMessage = error.response?.data?.detail || error.message || 'AI 查询失败，请重试';
      }
      
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
          // 强制从状态中移除（即使API删除失败）
          setInternalHighlights((prev) => {
            const highlightToDelete = prev.find(h => h.id === errorHighlightId);
            const highlightGroupId = highlightToDelete?.highlight_group_id;
            if (highlightGroupId) {
              return prev.filter(h => h.highlight_group_id !== highlightGroupId);
            } else {
              return prev.filter(h => h.id !== errorHighlightId);
            }
          });
        }
      }
      
      // 关闭 AICard
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
      aiCardHighlightDataRef.current = null;
      isQueryingRef.current = false; // 重置查询状态，允许重试
      
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

      // Step 4: 获取对应的 highlight 信息（用于直接添加到状态）
      // 优先使用 ref 中保存的数据（避免状态更新时序问题）
      const currentHighlightData = aiCardHighlightDataRef.current;
      
      // Step 5: 构建新笔记数据（用于直接添加到状态）
      const newNoteData = {
        id: noteResponse.id,
        highlight_id: currentHighlightId,
        content: noteContent,
        note_type: 'ai_card',
        origin_ai_query_id: queryId,
        created_at: noteResponse.created_at || new Date().toISOString(),
        updated_at: noteResponse.created_at || new Date().toISOString(),
      };
      
      // 使用 ref 中保存的 highlight 数据，如果不存在则从 effectiveHighlights 中查找
      const newHighlightData = currentHighlightData || effectiveHighlights.find(h => h.id === currentHighlightId);
      
      // 清理 ref（避免内存泄漏）
      aiCardHighlightDataRef.current = null;

      // Step 6: 关闭 AICard（但不删除 highlight，因为笔记已创建）
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
      // 注意：不要清除 aiCardHighlightIdRef.current，因为 highlight 需要保留用于显示下划线样式
      // aiCardHighlightIdRef.current = null; // 这行已移除，保留 highlight

      // Step 7: 通知父组件添加新笔记（直接添加到状态，避免数据库查询延迟）
      if (onNoteCreate) {
        onNoteCreate(newNoteData, newHighlightData);
      }

      // Step 8: 重要：不要删除 highlight，因为笔记已经创建，需要保留下划线样式
      // 注意：不要清除 aiCardHighlightIdRef，因为 highlight 需要保留
      // aiCardHighlightIdRef.current = null; // 移除这行，保留 highlight

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

  // 处理关闭 AICard（仅在用户取消查询时调用，不删除 highlight）
  const handleCloseAICard = useCallback(async () => {
    const currentHighlightId = aiCardHighlightIdRef.current;
    
    // 重要：只有在用户主动关闭 AICard（取消查询）时才删除 highlight
    // 如果笔记已经创建（通过 handleAddToNote），则不应该调用此函数删除 highlight
    // 这里保留删除逻辑，因为用户可能取消查询
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

  // 处理划线点击（拦截 onHighlightClick，判断笔记类型）
  const handleHighlightClick = useCallback((highlight) => {
    if (!highlight || !highlight.id) {
      console.warn('[SubtitleList] handleHighlightClick: highlight 无效', highlight);
      return;
    }

    // 从 notesMap 中查询对应的 note
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:733',message:'handleHighlightClick被调用，查询notesMap',data:{highlightId:highlight.id,notesMapSize:notesMap.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const note = notesMap.get(highlight.id);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:735',message:'notesMap查询结果',data:{highlightId:highlight.id,foundNote:!!note,noteType:note?.note_type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // 判断笔记类型：如果是 underline 类型，显示删除按钮
    if (note && note.note_type === 'underline') {
      // 计算 highlight 元素的位置
      if (!containerRef.current) {
        console.warn('[SubtitleList] handleHighlightClick: containerRef 无效');
        return;
      }

      // 查找对应的 highlight 元素
      const highlightElement = containerRef.current.querySelector(
        `[data-highlight-id="${highlight.id}"]`
      );

      if (!highlightElement) {
        console.warn('[SubtitleList] handleHighlightClick: 找不到 highlight 元素', highlight.id);
        return;
      }

      // 获取元素的位置信息
      const rect = highlightElement.getBoundingClientRect();
      const anchorPos = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      // 显示删除按钮
      deleteButtonNoteIdRef.current = note.id;
      deleteButtonHighlightIdRef.current = highlight.id;
      setDeleteButtonState({
        isVisible: true,
        anchorPosition: anchorPos,
        noteId: note.id,
        highlightId: highlight.id,
      });
    } else {
      // 如果不是 underline 类型，调用原来的 onHighlightClick
      if (onHighlightClick) {
        onHighlightClick(highlight);
      }
    }
  }, [notesMap, containerRef, onHighlightClick]);

  // 处理删除划线笔记
  const handleDeleteUnderlineNote = useCallback(async () => {
    // 使用 ref 获取最新值，避免闭包问题
    const noteId = deleteButtonNoteIdRef.current;
    const highlightId = deleteButtonHighlightIdRef.current;
    
    if (!noteId || !episodeId) {
      console.warn('[SubtitleList] handleDeleteUnderlineNote: 缺少必要参数', { noteId, episodeId });
      return;
    }

    try {
      // 调用 API 删除笔记（后端会自动删除对应的 highlight）
      await noteService.deleteNote(noteId);

      // 关闭删除按钮
      deleteButtonNoteIdRef.current = null;
      deleteButtonHighlightIdRef.current = null;
      setDeleteButtonState({
        isVisible: false,
        anchorPosition: null,
        noteId: null,
        highlightId: null,
      });

      // 从 notesMap 中移除
      setNotesMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(highlightId);
        return newMap;
      });

      // 从 internalHighlights 中移除（如果使用内部状态）
      if (!highlights || highlights.length === 0) {
        setInternalHighlights(prev => prev.filter(h => h.id !== highlightId));
      }

      // 通知父组件刷新 highlights（通过 onNoteDelete 回调）
      if (onNoteDelete) {
        onNoteDelete(noteId);
      }

      console.log('[SubtitleList] 删除划线笔记成功', { noteId, highlightId });
    } catch (error) {
      console.error('[SubtitleList] 删除划线笔记失败:', error);
      // 可以在这里显示错误提示
    }
  }, [episodeId, highlights, onNoteDelete]);

  // 关闭删除按钮
  const handleCloseDeleteButton = useCallback(() => {
    deleteButtonNoteIdRef.current = null;
    deleteButtonHighlightIdRef.current = null;
    setDeleteButtonState({
      isVisible: false,
      anchorPosition: null,
      noteId: null,
      highlightId: null,
    });
  }, []);

  // 加载字幕数据
  // 优先级：propsCues > episodeId > mock 数据
  useEffect(() => {
    // 清理之前的加载进度定时器
    // 注意：如果当前已经是错误状态，不要重置它
    if (loadingProgressIntervalRef.current) {
      clearInterval(loadingProgressIntervalRef.current);
      loadingProgressIntervalRef.current = null;
    }
    
    // 如果当前是错误状态且 episodeId 没有变化，不要重置错误状态
    // 这允许用户在错误状态下点击重试按钮
    if (hasErrorRef.current && lastLoadedEpisodeIdRef.current === episodeId && !propsCues) {
      return;
    }
    
    // 重置错误标记（新的加载开始时）
    hasErrorRef.current = false;
    
    if (propsCues) {
      // 如果传入了 cues prop，需要根据segments信息过滤，只使用前3个segment的字幕
      // 这是为了确保异步加载逻辑正常工作，避免一次性加载全部字幕
      requestAnimationFrame(() => {
        let filteredCues = propsCues;
        
        // 如果有segments信息，只保留前3个已完成的segment的字幕
        if (segments && segments.length > 0 && episodeId) {
          const completedSegments = segments
            .filter(s => s.status === 'completed')
            .sort((a, b) => a.segment_index - b.segment_index)
            .slice(0, 3); // 只取前3个
          
          if (completedSegments.length > 0) {
            const firstSegmentIndex = completedSegments[0].segment_index;
            const lastSegmentIndex = completedSegments[completedSegments.length - 1].segment_index;
            
            // 根据segment的时间范围过滤cues
            const firstSegment = segments.find(s => s.segment_index === firstSegmentIndex);
            const lastSegment = segments.find(s => s.segment_index === lastSegmentIndex);
            
            if (firstSegment && lastSegment) {
              filteredCues = propsCues.filter(cue => 
                cue.start_time >= firstSegment.start_time && 
                cue.start_time < lastSegment.end_time
              );
              
              lastLoadedSegmentIndexRef.current = lastSegmentIndex;
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:897',message:'过滤propsCues，只保留前3个segment',data:{originalCuesCount:propsCues.length,filteredCuesCount:filteredCues.length,firstSegmentIndex:firstSegmentIndex,lastSegmentIndex:lastSegmentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            } else {
              // 如果找不到segment信息，清空cues，等待异步加载
              filteredCues = [];
              lastLoadedSegmentIndexRef.current = -1;
            }
          } else {
            // 没有已完成的segment，清空cues，等待异步加载
            filteredCues = [];
            lastLoadedSegmentIndexRef.current = -1;
          }
        } else {
          // 没有segments信息，使用全部cues（向后兼容）
          lastLoadedSegmentIndexRef.current = -1;
        }
        
        setCues(filteredCues);
        setSubtitleLoadingState(null);
        setSubtitleLoadingProgress(0);
        setSubtitleLoadingError(null);
      });
      lastLoadedEpisodeIdRef.current = episodeId; // 保持episodeId，以便后续异步加载
      isLoadingSubtitlesRef.current = false;
    } else if (episodeId) {
      // 如果 episodeId 没有变化且正在加载，跳过重复加载
      // 但如果 propsCues 或 segments 变化，允许重新加载
      if (lastLoadedEpisodeIdRef.current === episodeId && isLoadingSubtitlesRef.current && !hasErrorRef.current) {
        return;
      }
      
      // 标记为正在加载
      isLoadingSubtitlesRef.current = true;
      lastLoadedEpisodeIdRef.current = episodeId;
      
      // 根据PRD：字幕加载过程中，在英文字幕区域中间显示提示"请稍等，字幕加载中"和进度条
      setSubtitleLoadingState('loading');
      setSubtitleLoadingProgress(0);
      setSubtitleLoadingError(null);
      
      // 模拟字幕加载进度条（前端模拟，匀速增长）
      const startTime = Date.now();
      const loadDuration = 2000; // 假设加载需要2秒
      
      // 保存 interval ID，以便在错误时能够清理
      const intervalId = setInterval(() => {
        // 检查是否仍在加载状态，如果已经变为错误状态，停止更新
        if (loadingProgressIntervalRef.current === intervalId) {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / loadDuration) * 100, 99);
          setSubtitleLoadingProgress(progress);
        }
      }, 100);
      loadingProgressIntervalRef.current = intervalId;
      
      // 如果有 episodeId，根据是否有 segments 信息决定加载策略
      // 如果有 segments 信息，只加载前3个segment的字幕（性能优化）
      // 如果没有 segments 信息，加载所有字幕（向后兼容）
      const loadInitialSubtitles = async () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:959',message:'开始初始加载字幕',data:{episodeId:episodeId,hasSegments:!!segments,segmentsLength:segments?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        try {
          let initialCues = [];
          let loadedLastSegmentIndex = -1;
          
          if (segments && segments.length > 0) {
            // 有 segments 信息：只加载前3个已完成的segment的字幕
            const completedSegments = segments
              .filter(s => s.status === 'completed')
              .sort((a, b) => a.segment_index - b.segment_index)
              .slice(0, 3); // 只取前3个
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:966',message:'计算前3个已完成的segment',data:{completedSegmentsCount:completedSegments.length,completedSegmentIndices:completedSegments.map(s=>s.segment_index)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            if (completedSegments.length > 0) {
              const firstSegmentIndex = completedSegments[0].segment_index;
              const lastSegmentIndex = completedSegments[completedSegments.length - 1].segment_index;
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:975',message:'准备加载前3个segment的字幕',data:{firstSegmentIndex:firstSegmentIndex,lastSegmentIndex:lastSegmentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              
              // 加载前3个segment的字幕
              initialCues = await getCuesBySegmentRange(episodeId, firstSegmentIndex, lastSegmentIndex);
              loadedLastSegmentIndex = lastSegmentIndex;
              lastLoadedSegmentIndexRef.current = loadedLastSegmentIndex;
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:977',message:'初始加载完成',data:{initialCuesCount:initialCues.length,loadedLastSegmentIndex:loadedLastSegmentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
            }
          } else {
            // 没有 segments 信息：加载所有字幕（向后兼容）
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:980',message:'没有segments信息，加载所有字幕',data:{episodeId:episodeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            initialCues = await getCuesByEpisodeId(episodeId);
          }
          
          // 清理进度定时器
          if (loadingProgressIntervalRef.current) {
            clearInterval(loadingProgressIntervalRef.current);
            loadingProgressIntervalRef.current = null;
          }
          
          // 加载完成，进度条直接走到100%
          setSubtitleLoadingProgress(100);
          
          // 短暂延迟后清除加载状态
          setTimeout(() => {
            setCues(initialCues);
            setSubtitleLoadingState(null);
            setSubtitleLoadingProgress(0);
            isLoadingSubtitlesRef.current = false;
          }, 300);
        } catch (error) {
          // 立即清理进度定时器（必须在设置错误状态之前）
          // 使用保存的 intervalId 确保清理正确的定时器
          const currentIntervalId = loadingProgressIntervalRef.current;
          if (currentIntervalId) {
            clearInterval(currentIntervalId);
            loadingProgressIntervalRef.current = null;
          }
          
          console.error('[SubtitleList] 加载字幕失败:', error);
          
          // 使用函数式更新确保状态正确设置，避免被其他状态更新覆盖
          const errorMessage = error.response?.data?.detail || error.message || '字幕加载失败，请重试';
          
          // 批量更新状态，确保原子性（React 18 会自动批处理）
          // 设置错误标记，防止 useEffect 重置状态
          hasErrorRef.current = true;
          setSubtitleLoadingProgress(0); // 先重置进度
          setSubtitleLoadingError(errorMessage); // 设置错误消息
          setSubtitleLoadingState('error'); // 最后设置错误状态
          isLoadingSubtitlesRef.current = false;
        }
      };
      
      loadInitialSubtitles();
    } else {
      // 既没有 cues 也没有 episodeId，使用 mock 数据
      lastLoadedEpisodeIdRef.current = null;
      isLoadingSubtitlesRef.current = false;
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
    // 注意：不包含 subtitleLoadingState 在依赖项中，避免错误状态被重置
  }, [propsCues, episodeId, segments]);

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
        // 获取所有笔记，以确保 highlight 有对应的笔记（无论是 underline, thought, 还是 ai_card）
        // 之前只保留 underline 类型的 note，导致 AI 查询和想法的划线在刷新后丢失
        return noteService.getNotesByEpisode(episodeId)
          .then((notes) => {
            // 建立 notesMap（highlight_id -> note），用于快速查询笔记类型
            const newNotesMap = new Map();
            notes.forEach(note => {
              newNotesMap.set(note.highlight_id, note);
            });
            setNotesMap(newNotesMap);
            
            // 找出所有有效笔记对应的 highlight_id
            // 修改：不再仅限于 underline 类型，包含 ai_card 和 thought 类型
            // 这样刷新页面后，AI查询和想法对应的划线也能正确显示
            const validNoteHighlightIds = new Set(
              notes.map(note => note.highlight_id)
            );

            // 只保留有对应笔记的 highlights
            const validHighlights = loadedHighlights.filter(h => 
              validNoteHighlightIds.has(h.id)
            );

            setInternalHighlights(validHighlights);
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
    
    // 只在状态真正变化时才处理
    if (previousStatus === currentStatus) {
      return;
    }
    
    if (
      previousStatus !== 'completed' 
      && currentStatus === 'completed' 
      && !propsCues 
      && episodeId
    ) {
      console.log('[SubtitleList] 转录已完成，重新加载字幕数据（前3个segment）');
      // 重置已加载的segment索引和加载标记
      lastLoadedSegmentIndexRef.current = -1;
      // 注意：不要重置 lastLoadedEpisodeIdRef.current，避免触发加载字幕的 useEffect
      // 而是直接在这里加载，避免重复调用
      isLoadingSubtitlesRef.current = false;
      hasErrorRef.current = false; // 重置错误标记
      
      // 重新加载前3个segment的字幕（性能优化）
      const loadInitialSubtitles = async () => {
        try {
          if (segments && segments.length > 0) {
            // 有 segments 信息：只加载前3个已完成的segment的字幕
            const completedSegments = segments
              .filter(s => s.status === 'completed')
              .sort((a, b) => a.segment_index - b.segment_index)
              .slice(0, 3); // 只取前3个
            
            if (completedSegments.length > 0) {
              const firstSegmentIndex = completedSegments[0].segment_index;
              const lastSegmentIndex = completedSegments[completedSegments.length - 1].segment_index;
              
              // 加载前3个segment的字幕
              const initialCues = await getCuesBySegmentRange(episodeId, firstSegmentIndex, lastSegmentIndex);
              lastLoadedSegmentIndexRef.current = lastSegmentIndex;
              
              if (initialCues && initialCues.length > 0) {
                setCues(initialCues);
                // 更新 lastLoadedEpisodeIdRef，避免加载字幕的 useEffect 重复调用
                lastLoadedEpisodeIdRef.current = episodeId;
              }
            }
          } else {
            // 没有 segments 信息：加载所有字幕（向后兼容）
            const allCues = await getCuesByEpisodeId(episodeId);
            if (allCues && allCues.length > 0) {
              setCues(allCues);
              // 更新 lastLoadedEpisodeIdRef，避免加载字幕的 useEffect 重复调用
              lastLoadedEpisodeIdRef.current = episodeId;
            }
          }
          
          // 清除识别错误状态
          setTranscriptionError(null);
        } catch (error) {
          console.error('[SubtitleList] 转录完成后加载字幕失败:', error);
        }
      };
      
      loadInitialSubtitles();
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
   * * @returns {Array} 处理后的数组，包含字幕和 speaker 标签
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

  // 滚动触发异步加载逻辑
  // 性能优化：只加载下一个segment的字幕，追加到现有列表，而不是重新加载全部
  const checkAndLoadNextSegment = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1331',message:'checkAndLoadNextSegment被调用',data:{episodeId:episodeId,hasSegments:!!segments,segmentsLength:segments?.length,lastLoadedIndex:lastLoadedSegmentIndexRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!episodeId || !segments || segments.length === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1333',message:'checkAndLoadNextSegment提前返回：缺少必要参数',data:{episodeId:episodeId,hasSegments:!!segments},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    // 获取下一个segment索引（基于已加载的最后一个segment索引）
    // 如果 lastLoadedSegmentIndexRef.current 为 -1，说明还没有加载任何segment，从0开始
    const nextSegmentIndex = lastLoadedSegmentIndexRef.current === -1 ? 0 : lastLoadedSegmentIndexRef.current + 1;
    const nextSegment = segments.find(s => s.segment_index === nextSegmentIndex);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1339',message:'计算下一个segment',data:{nextSegmentIndex:nextSegmentIndex,hasNextSegment:!!nextSegment,nextSegmentStatus:nextSegment?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    if (!nextSegment) {
      // 没有下一个segment，说明全部完成
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1342',message:'没有下一个segment，全部完成',data:{nextSegmentIndex:nextSegmentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    // 如果下一个segment已完成，加载该segment的字幕并追加
    if (nextSegment.status === 'completed') {
      // 检查是否正在加载或已加载过这个segment
      if (loadingSegmentsRef.current.has(nextSegmentIndex)) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1347',message:'segment正在加载中，跳过重复加载',data:{nextSegmentIndex:nextSegmentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return;
      }
      
      // 标记为正在加载
      loadingSegmentsRef.current.add(nextSegmentIndex);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1347',message:'下一个segment已完成，开始加载字幕',data:{nextSegmentIndex:nextSegmentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      try {
        // 只加载这一个segment的字幕
        const newCues = await getCuesBySegmentRange(episodeId, nextSegmentIndex, nextSegmentIndex);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1350',message:'获取到新字幕数据',data:{nextSegmentIndex:nextSegmentIndex,newCuesCount:newCues?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (newCues && newCues.length > 0) {
          // 追加到现有cues列表（按时间排序合并，并去重）
          setCues((prevCues) => {
            // 使用Map根据cue.id去重
            const cuesMap = new Map();
            // 先添加已有的cues
            prevCues.forEach(cue => {
              cuesMap.set(cue.id, cue);
            });
            // 再添加新的cues（如果id已存在会被覆盖，但内容应该相同）
            newCues.forEach(cue => {
              cuesMap.set(cue.id, cue);
            });
            // 转换为数组并按时间排序
            const mergedCues = Array.from(cuesMap.values());
            return mergedCues.sort((a, b) => a.start_time - b.start_time);
          });
          
          // 更新已加载的最后一个segment索引
          lastLoadedSegmentIndexRef.current = nextSegmentIndex;
          // 从loadingSegmentsRef中移除，允许后续重新加载（如果需要）
          loadingSegmentsRef.current.delete(nextSegmentIndex);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1361',message:'字幕追加成功，更新lastLoadedSegmentIndex',data:{nextSegmentIndex:nextSegmentIndex,newLastLoadedIndex:lastLoadedSegmentIndexRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        }
      } catch (error) {
        // 加载失败时，从loadingSegmentsRef中移除，允许重试
        loadingSegmentsRef.current.delete(nextSegmentIndex);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1364',message:'加载Segment字幕失败',data:{nextSegmentIndex:nextSegmentIndex,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.error(`[SubtitleList] 加载 Segment ${nextSegmentIndex} 字幕失败:`, error);
      }
    } else if (nextSegment.status === 'pending' || (nextSegment.status === 'failed' && nextSegment.retry_count < 3)) {
      // 如果下一个segment未开始或失败但可重试，触发识别
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1366',message:'触发下一个segment识别',data:{nextSegmentIndex:nextSegmentIndex,status:nextSegment.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      try {
        await subtitleService.triggerSegmentTranscription(episodeId, nextSegmentIndex);
        console.log(`[SubtitleList] 已触发 Segment ${nextSegmentIndex} 的识别任务`);
      } catch (error) {
        console.error(`[SubtitleList] 触发 Segment ${nextSegmentIndex} 识别失败:`, error);
      }
    }
    // 如果status是processing，不处理，等待完成
  }, [episodeId, segments]);
  
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1403',message:'内部滚动容器滚动事件',data:{scrollTop:scrollTop,scrollHeight:scrollHeight,clientHeight:clientHeight,distanceToBottom:distanceToBottom},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (distanceToBottom < 100) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1410',message:'内部滚动到底部，触发加载下一个segment',data:{distanceToBottom:distanceToBottom},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1426',message:'外部滚动容器滚动事件',data:{scrollTop:scrollTop,scrollHeight:scrollHeight,clientHeight:clientHeight,distanceToBottom:distanceToBottom},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (distanceToBottom < 100) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1433',message:'滚动到底部，触发加载下一个segment',data:{distanceToBottom:distanceToBottom},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
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
  
  // 当初始加载完成后，重置 lastLoadedSegmentIndexRef（确保初始加载逻辑正确）
  // 注意：初始加载逻辑已经设置了 lastLoadedSegmentIndexRef，这里主要用于重置场景
  useEffect(() => {
    // 如果 cues 被重置为空数组，说明需要重新初始化
    if (cues && cues.length === 0 && segments && segments.length > 0) {
      lastLoadedSegmentIndexRef.current = -1;
    }
  }, [cues, segments]);

  // 监听segments变化，当有新的segment完成时自动加载（前3个segment范围内）
  // 假设C：segments状态更新时，没有触发字幕重新加载
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1462',message:'监听segments变化',data:{episodeId:episodeId,hasSegments:!!segments,segmentsLength:segments?.length,lastLoadedIndex:lastLoadedSegmentIndexRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (!episodeId || !segments || segments.length === 0) {
      return;
    }
    
    // 检查前3个segment中是否有新完成的segment需要加载
    // 只检查前3个segment（segment_index 0, 1, 2）
    const firstThreeSegments = segments
      .filter(s => s.segment_index >= 0 && s.segment_index <= 2)
      .sort((a, b) => a.segment_index - b.segment_index);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1470',message:'检查前3个segment状态',data:{firstThreeSegmentsCount:firstThreeSegments.length,firstThreeSegmentsStatus:firstThreeSegments.map(s=>({index:s.segment_index,status:s.status})),lastLoadedIndex:lastLoadedSegmentIndexRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // 找到前3个segment中已完成的segment
    const completedFirstThree = firstThreeSegments.filter(s => s.status === 'completed');
    
    if (completedFirstThree.length > 0) {
      const maxCompletedIndex = Math.max(...completedFirstThree.map(s => s.segment_index));
      
      // 如果已加载的最后一个segment索引小于前3个中最大的已完成segment索引，需要加载
      if (lastLoadedSegmentIndexRef.current < maxCompletedIndex) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1478',message:'发现前3个segment中有新完成的，需要加载',data:{lastLoadedIndex:lastLoadedSegmentIndexRef.current,maxCompletedIndex:maxCompletedIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // 加载从 lastLoadedSegmentIndexRef.current + 1 到 maxCompletedIndex 的所有segment
        const startIndex = lastLoadedSegmentIndexRef.current === -1 ? 0 : lastLoadedSegmentIndexRef.current + 1;
        const endIndex = Math.min(maxCompletedIndex, 2); // 最多加载到segment_index 2
        
        if (startIndex <= endIndex) {
          // 检查是否正在加载这些segments
          const segmentsToLoad = [];
          for (let i = startIndex; i <= endIndex; i++) {
            if (!loadingSegmentsRef.current.has(i)) {
              segmentsToLoad.push(i);
              loadingSegmentsRef.current.add(i);
            }
          }
          
          if (segmentsToLoad.length === 0) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1485',message:'所有segments正在加载中，跳过重复加载',data:{startIndex:startIndex,endIndex:endIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return;
          }
          
          const actualStartIndex = Math.min(...segmentsToLoad);
          const actualEndIndex = Math.max(...segmentsToLoad);
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1485',message:'开始自动加载新完成的segment字幕',data:{startIndex:actualStartIndex,endIndex:actualEndIndex,segmentsToLoad:segmentsToLoad},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          getCuesBySegmentRange(episodeId, actualStartIndex, actualEndIndex)
            .then((newCues) => {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1489',message:'自动加载新segment字幕成功',data:{startIndex:startIndex,endIndex:endIndex,newCuesCount:newCues?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              if (newCues && newCues.length > 0) {
                // 使用Map根据cue.id去重
                setCues((prevCues) => {
                  const cuesMap = new Map();
                  // 先添加已有的cues
                  prevCues.forEach(cue => {
                    cuesMap.set(cue.id, cue);
                  });
                  // 再添加新的cues
                  newCues.forEach(cue => {
                    cuesMap.set(cue.id, cue);
                  });
                  // 转换为数组并按时间排序
                  const mergedCues = Array.from(cuesMap.values());
                  return mergedCues.sort((a, b) => a.start_time - b.start_time);
                });
                lastLoadedSegmentIndexRef.current = endIndex;
                // 从loadingSegmentsRef中移除已加载的segments
                for (let i = startIndex; i <= endIndex; i++) {
                  loadingSegmentsRef.current.delete(i);
                }
              }
            })
            .catch((error) => {
              // 加载失败时，从loadingSegmentsRef中移除，允许重试
              for (let i = actualStartIndex; i <= actualEndIndex; i++) {
                loadingSegmentsRef.current.delete(i);
              }
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SubtitleList.jsx:1498',message:'自动加载新segment字幕失败',data:{startIndex:actualStartIndex,endIndex:actualEndIndex,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              console.error(`[SubtitleList] 自动加载 Segment ${actualStartIndex}-${actualEndIndex} 字幕失败:`, error);
            });
        }
      }
    }
  }, [episodeId, segments]);

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
            onClick={async () => {
              // 重新加载字幕
              // 重置加载标记，允许重新加载
              lastLoadedEpisodeIdRef.current = null;
              isLoadingSubtitlesRef.current = false;
              hasErrorRef.current = false; // 重置错误标记
              
              setSubtitleLoadingState('loading');
              setSubtitleLoadingProgress(0);
              setSubtitleLoadingError(null);
              
              if (episodeId) {
                try {
                  // 重置已加载的segment索引
                  lastLoadedSegmentIndexRef.current = -1;
                  
                  let reloadedCues = [];
                  
                  if (segments && segments.length > 0) {
                    // 有 segments 信息：只加载前3个已完成的segment的字幕
                    const completedSegments = segments
                      .filter(s => s.status === 'completed')
                      .sort((a, b) => a.segment_index - b.segment_index)
                      .slice(0, 3);
                    
                    if (completedSegments.length > 0) {
                      const firstSegmentIndex = completedSegments[0].segment_index;
                      const lastSegmentIndex = completedSegments[completedSegments.length - 1].segment_index;
                      
                      reloadedCues = await getCuesBySegmentRange(episodeId, firstSegmentIndex, lastSegmentIndex);
                      lastLoadedSegmentIndexRef.current = lastSegmentIndex;
                    }
                  } else {
                    // 没有 segments 信息：加载所有字幕（向后兼容）
                    reloadedCues = await getCuesByEpisodeId(episodeId);
                  }
                  
                  setCues(reloadedCues);
                  setSubtitleLoadingState(null);
                  setSubtitleLoadingProgress(0);
                  lastLoadedEpisodeIdRef.current = episodeId;
                  isLoadingSubtitlesRef.current = false;
                } catch (error) {
                  setSubtitleLoadingState('error');
                  setSubtitleLoadingError(error.response?.data?.detail || error.message || '字幕加载失败，请重试');
                  isLoadingSubtitlesRef.current = false;
                }
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
                onHighlightClick={handleHighlightClick}
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

      {/* 删除按钮（用于 underline 类型的划线笔记） */}
      {deleteButtonState.isVisible && deleteButtonState.anchorPosition && (
        <DeleteButton
          anchorPosition={deleteButtonState.anchorPosition}
          onDelete={handleDeleteUnderlineNote}
          onClose={handleCloseDeleteButton}
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
 * * 显示字幕列表底部的状态提示
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