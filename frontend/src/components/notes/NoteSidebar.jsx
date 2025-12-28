/**
 * NoteSidebar 组件
 * 
 * 笔记侧边栏容器，负责管理笔记的展示、展开/收缩状态，以及笔记列表的循环渲染
 * 
 * 功能描述：
 * - 笔记侧边栏容器
 * - 包含笔记列表循环逻辑（不拆分列表组件，采用逻辑聚合策略）
 * - 管理笔记的显示、筛选、排序等
 * - 展开/收缩逻辑（无笔记时收缩，有笔记时展开）
 * 
 * 相关PRD：
 * - PRD 6.2.4.g: 笔记区域（374-387行）
 * 
 * @module components/notes/NoteSidebar
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { Box, Stack, IconButton, Skeleton, Alert, Typography } from '@mui/material';
import { ArrowForward, StickyNote2 } from '@mui/icons-material';
import { noteService } from '../../services/noteService';
import { highlightService } from '../../services/highlightService';
import { useNotePosition } from '../../hooks/useNotePosition';
import NoteCard from './NoteCard';

// Mock数据（用于开发调试，展示效果）
const mockNotes = [
  {
    id: 1,
    highlight_id: 1,
    content: '这是第一条笔记内容，用于展示笔记卡片的效果。\n支持换行显示。\n还可以使用**加粗**语法。',
    note_type: 'thought',
    origin_ai_query_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    highlight_id: 2,
    content: '这是第二条笔记，来自AI查询的结果。\n\n**taxonomy**\n发音：/tækˈsɒnəmi/\nn. 分类学；分类法；分类系统\n\n解释：\n1. 在生物学中，taxonomy 指对生物体进行分类的科学。\n2. 在更广泛的领域中，taxonomy 也可以指任何事物的分类系统或方法。',
    note_type: 'ai_card',
    origin_ai_query_id: 1,
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  },
  {
    id: 3,
    highlight_id: 3,
    content: '这是一条较长的笔记内容，用于测试笔记卡片的最大高度限制和滚动功能。\n\n当内容超过屏幕一半高度时，会出现垂直滚动条。\n\n标题栏会保持固定，不会随着内容滚动。\n\n这样可以确保用户始终可以看到编辑和删除按钮。',
    note_type: 'thought',
    origin_ai_query_id: null,
    created_at: '2025-01-03T00:00:00Z',
    updated_at: '2025-01-03T00:00:00Z',
  },
];

const mockHighlights = [
  {
    id: 1,
    cue_id: 1,
    highlighted_text: 'test text 1',
    start_offset: 0,
    end_offset: 10,
    color: '#9C27B0',
    highlight_group_id: null,
  },
  {
    id: 2,
    cue_id: 2,
    highlighted_text: 'taxonomy',
    start_offset: 5,
    end_offset: 13,
    color: '#9C27B0',
    highlight_group_id: null,
  },
  {
    id: 3,
    cue_id: 3,
    highlighted_text: 'test text 3',
    start_offset: 0,
    end_offset: 10,
    color: '#9C27B0',
    highlight_group_id: null,
  },
];

/**
 * NoteSidebar 组件
 * 
 * @param {Object} props
 * @param {number|string|null} props.episodeId - Episode ID，用于加载笔记数据
 * @param {Function} [props.onNoteClick] - 点击笔记卡片回调（用于双向链接）
 * @param {Function} [props.onNoteDelete] - 删除笔记回调（用于刷新列表）
 * @param {boolean} [props.isExpanded] - 外部控制的展开/收缩状态（可选，如果不提供则内部管理）
 * @param {Function} [props.onExpandedChange] - 展开/收缩状态变化回调 (isExpanded: boolean) => void
 * @param {React.RefObject} [props.scrollContainerRef] - 左侧字幕滚动容器引用（用于位置同步）
 * @param {Array} [props.cues] - TranscriptCue 数组（用于位置计算）
 */
const NoteSidebar = forwardRef(function NoteSidebar({ 
  episodeId, 
  onNoteClick, 
  onNoteDelete, 
  isExpanded: externalIsExpanded, 
  onExpandedChange,
  scrollContainerRef,
  cues = []
}, ref) {
  // 笔记数据和划线数据
  const [notes, setNotes] = useState([]);
  const [highlights, setHighlights] = useState(new Map());
  
  // 加载状态和错误状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 最前面的笔记卡片（用于z-index管理）
  // 存储当前应该显示在最前面的笔记的highlight_id
  const [frontNoteHighlightId, setFrontNoteHighlightId] = useState(null);
  
  // 展开/收缩状态（如果外部提供则使用外部状态，否则内部管理）
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  
  // 用户是否主动操作过展开/收缩状态
  const hasUserInteractedRef = useRef(false);
  
  
  // 记录已加载的 episodeId，避免重复加载
  const loadedEpisodeIdRef = useRef(null);
  
  // 笔记侧边栏容器引用（用于位置计算）
  const noteSidebarRef = useRef(null);
  
  // 将 highlights Map 转换为数组（用于 useNotePosition）
  const highlightsArray = useMemo(() => {
    return Array.from(highlights.values());
  }, [highlights]);
  
  // 使用 useNotePosition Hook 计算笔记位置
  const notePositions = useNotePosition({
    highlights: highlightsArray,
    cues: cues,
    scrollContainerRef: scrollContainerRef,
    noteSidebarRef: noteSidebarRef
  });

  // 数据加载逻辑
  useEffect(() => {
    // 开发模式：如果没有episodeId或episodeId为'mock'，使用mock数据
    const USE_MOCK_DATA = !episodeId || episodeId === 'mock';
    
    if (USE_MOCK_DATA) {
      // 使用mock数据
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      const highlightMap = new Map(mockHighlights.map(h => [h.id, h]));
      
      setNotes(displayNotes);
      setHighlights(highlightMap);
      setError(null);
      setLoading(false);
      
      // 自动展开（有笔记时）
      if (displayNotes.length > 0 && !hasUserInteractedRef.current) {
        if (externalIsExpanded === undefined) {
          setInternalIsExpanded(true);
        }
        onExpandedChange?.(true);
      } else {
        if (externalIsExpanded === undefined) {
          setInternalIsExpanded(false);
        }
        onExpandedChange?.(false);
      }
      return;
    }
    
    if (!episodeId) {
      // 如果没有episodeId，也使用mock数据（开发调试）
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      const highlightMap = new Map(mockHighlights.map(h => [h.id, h]));
      
      setNotes(displayNotes);
      setHighlights(highlightMap);
      setError(null);
      setLoading(false);
      
      if (displayNotes.length > 0 && !hasUserInteractedRef.current) {
        if (externalIsExpanded === undefined) {
          setInternalIsExpanded(true);
        }
        onExpandedChange?.(true);
      } else {
        if (externalIsExpanded === undefined) {
          setInternalIsExpanded(false);
        }
        onExpandedChange?.(false);
      }
      return;
    }
    
    // 如果已经加载过这个 episodeId 的数据，就不重新加载
    if (loadedEpisodeIdRef.current === episodeId) {
      // 清除错误状态，避免展开时显示错误提示
      if (error) {
        setError(null);
      }
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // 并行加载笔记和划线数据
    Promise.all([
      noteService.getNotesByEpisode(episodeId),
      highlightService.getHighlightsByEpisode(episodeId)
    ])
      .then(([notesData, highlightsData]) => {
        // 过滤 underline 类型（纯划线不显示笔记卡片）
        const displayNotes = notesData.filter(n => n.note_type !== 'underline');
        
        // 建立 Note 与 Highlight 的映射关系
        const highlightMap = new Map(highlightsData.map(h => [h.id, h]));
        
        // 开发模式：如果没有真实数据，使用mock数据（用于展示效果）
        // 注意：在测试环境中（process.env.NODE_ENV === 'test'），不使用 mock 数据
        if (displayNotes.length === 0 && highlightsData.length === 0 && process.env.NODE_ENV !== 'test') {
          console.log('[NoteSidebar] 没有真实数据，使用mock数据展示效果');
          const mockDisplayNotes = mockNotes.filter(n => n.note_type !== 'underline');
          const mockHighlightMap = new Map(mockHighlights.map(h => [h.id, h]));
          
          setNotes(mockDisplayNotes);
          setHighlights(mockHighlightMap);
          loadedEpisodeIdRef.current = episodeId;
          
          if (mockDisplayNotes.length > 0 && !hasUserInteractedRef.current) {
            if (externalIsExpanded === undefined) {
              setInternalIsExpanded(true);
            }
            onExpandedChange?.(true);
          }
          return;
        }
        
        // 更新状态
        setNotes(displayNotes);
        setHighlights(highlightMap);
        loadedEpisodeIdRef.current = episodeId; // 记录已加载的 episodeId
        
        // 自动展开逻辑：仅在初始加载时，如果用户没有主动操作过
        if (displayNotes.length > 0 && !hasUserInteractedRef.current) {
          if (externalIsExpanded === undefined) {
            setInternalIsExpanded(true);
          }
          onExpandedChange?.(true);
        } else if (displayNotes.length === 0) {
          if (externalIsExpanded === undefined) {
            setInternalIsExpanded(false);
          }
          onExpandedChange?.(false);
        }
      })
      .catch((err) => {
        console.error('[NoteSidebar] 加载笔记数据失败，使用mock数据展示效果:', err);
        // 开发模式：加载失败时，使用mock数据（用于展示效果）
        // 注意：在测试环境中（process.env.NODE_ENV === 'test'），显示错误而不是使用 mock 数据
        if (process.env.NODE_ENV === 'test') {
          setError(err);
          setNotes([]);
          setHighlights(new Map());
          loadedEpisodeIdRef.current = episodeId;
          return;
        }
        
        const mockDisplayNotes = mockNotes.filter(n => n.note_type !== 'underline');
        const mockHighlightMap = new Map(mockHighlights.map(h => [h.id, h]));
        
        setNotes(mockDisplayNotes);
        setHighlights(mockHighlightMap);
        setError(null); // 不显示错误，直接使用mock数据
        loadedEpisodeIdRef.current = episodeId; // 记录已加载的 episodeId（使用mock数据）
        
        // 自动展开（有mock数据时）
        if (mockDisplayNotes.length > 0 && !hasUserInteractedRef.current) {
          if (externalIsExpanded === undefined) {
            setInternalIsExpanded(true);
          }
          onExpandedChange?.(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [episodeId]); // 移除 onExpandedChange 依赖，避免无限循环（onExpandedChange 在 useEffect 内部使用，不需要作为依赖）
  
  // 处理收缩按钮点击（如果外部控制状态，则只通知外部；否则更新内部状态）
  const handleCollapse = () => {
    console.log('[NoteSidebar] handleCollapse 被调用');
    console.log('[NoteSidebar] externalIsExpanded:', externalIsExpanded);
    console.log('[NoteSidebar] 当前 isExpanded:', isExpanded);
    if (externalIsExpanded === undefined) {
      console.log('[NoteSidebar] 内部状态模式，更新 internalIsExpanded 为 false');
      setInternalIsExpanded(false);
    } else {
      console.log('[NoteSidebar] 外部状态模式，只调用 onExpandedChange(false)');
    }
    hasUserInteractedRef.current = true;
    onExpandedChange?.(false);
    console.log('[NoteSidebar] handleCollapse 完成');
  };
  
  // 处理展开按钮点击（如果外部控制状态，则只通知外部；否则更新内部状态）
  const handleExpand = () => {
    console.log('[NoteSidebar] handleExpand 被调用');
    console.log('[NoteSidebar] externalIsExpanded:', externalIsExpanded);
    console.log('[NoteSidebar] 当前 isExpanded:', isExpanded);
    if (externalIsExpanded === undefined) {
      console.log('[NoteSidebar] 内部状态模式，更新 internalIsExpanded 为 true');
      setInternalIsExpanded(true);
    } else {
      console.log('[NoteSidebar] 外部状态模式，只调用 onExpandedChange(true)');
    }
    hasUserInteractedRef.current = true;
    onExpandedChange?.(true);
    console.log('[NoteSidebar] handleExpand 完成');
  };
  
  // 刷新笔记列表（公共方法，供内部和外部调用）
  const refreshNotes = useCallback(async (delayMs = 100) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:329',message:'refreshNotes被调用',data:{episodeId,hasEpisodeId:!!episodeId,delayMs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (!episodeId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:330',message:'episodeId为空，提前返回',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    // 添加短暂延迟，确保数据库事务已提交（解决SQLite WAL模式的读取延迟问题）
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:335',message:'开始获取笔记和划线数据',data:{episodeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const [notesData, highlightsData] = await Promise.all([
        noteService.getNotesByEpisode(episodeId),
        highlightService.getHighlightsByEpisode(episodeId)
      ]);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:340',message:'获取到笔记和划线数据',data:{notesCount:notesData?.length,highlightsCount:highlightsData?.length,allNotes:notesData,allHighlights:highlightsData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const displayNotes = notesData.filter(n => n.note_type !== 'underline');
      const highlightMap = new Map(highlightsData.map(h => [h.id, h]));
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:343',message:'准备更新状态',data:{displayNotesCount:displayNotes.length,highlightMapSize:highlightMap.size,displayNotes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setNotes(displayNotes);
      setHighlights(highlightMap);
      loadedEpisodeIdRef.current = episodeId; // 更新已加载标记
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:345',message:'状态已更新',data:{displayNotesCount:displayNotes.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // 如果有新笔记，自动展开
      if (displayNotes.length > 0 && !hasUserInteractedRef.current) {
        if (externalIsExpanded === undefined) {
          setInternalIsExpanded(true);
        }
        onExpandedChange?.(true);
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:354',message:'刷新笔记列表失败',data:{error:err?.message,errorStack:err?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.error('[NoteSidebar] 刷新笔记列表失败:', err);
    }
  }, [episodeId, externalIsExpanded, onExpandedChange]);

  // 处理笔记更新
  const handleUpdateNote = async (noteId, content) => {
    await refreshNotes();
  };

  // 处理笔记删除
  const handleDeleteNote = async (noteId) => {
    if (onNoteDelete) {
      onNoteDelete(noteId);
    }
    
    // 刷新列表（重新加载数据）
    if (episodeId) {
      try {
        const [notesData, highlightsData] = await Promise.all([
          noteService.getNotesByEpisode(episodeId),
          highlightService.getHighlightsByEpisode(episodeId)
        ]);
        
        const displayNotes = notesData.filter(n => n.note_type !== 'underline');
        const highlightMap = new Map(highlightsData.map(h => [h.id, h]));
        
        setNotes(displayNotes);
        setHighlights(highlightMap);
        loadedEpisodeIdRef.current = episodeId;
        
        // 如果删除后没有笔记了，自动收缩
        if (displayNotes.length === 0) {
          if (externalIsExpanded === undefined) {
            setInternalIsExpanded(false);
          }
          onExpandedChange?.(false);
        }
      } catch (err) {
        console.error('[NoteSidebar] 刷新笔记列表失败:', err);
      }
    }
  };
  
  // 按创建时间排序笔记
  const sortedNotes = [...notes].sort((a, b) => {
    const dateA = new Date(a.created_at);
    const dateB = new Date(b.created_at);
    return dateA - dateB;
  });
  
  // 提升笔记卡片到最前面（通过highlight_id）
  const bringNoteToFront = useCallback((highlightId) => {
    setFrontNoteHighlightId(highlightId);
  }, []);

  // 直接添加新笔记到状态（用于创建笔记后立即显示，避免数据库查询延迟）
  const addNoteDirectly = useCallback(async (noteData, highlightData) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:addNoteDirectly',message:'直接添加新笔记到状态',data:{noteData,highlightData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    if (!noteData || noteData.note_type === 'underline') {
      // underline类型不显示，直接返回
      return;
    }
    
    // 添加新笔记到状态
    setNotes((prev) => {
      // 检查是否已存在（避免重复添加）
      const exists = prev.some(n => n.id === noteData.id);
      if (exists) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:addNoteDirectly',message:'笔记已存在，跳过添加',data:{noteId:noteData.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        return prev;
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteSidebar.jsx:addNoteDirectly',message:'添加新笔记到状态',data:{prevCount:prev.length,newNoteId:noteData.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return [...prev, noteData];
    });
    
    // 添加对应的highlight到状态
    if (highlightData) {
      setHighlights((prev) => {
        const newMap = new Map(prev);
        newMap.set(highlightData.id, highlightData);
        return newMap;
      });
    }
    
    // 如果有新笔记，自动展开
    if (!hasUserInteractedRef.current) {
      if (externalIsExpanded === undefined) {
        setInternalIsExpanded(true);
      }
      onExpandedChange?.(true);
    }
  }, [externalIsExpanded, onExpandedChange]);

  // 暴露 ref 给父组件（用于双向链接和刷新）
  // 必须在所有条件返回之前调用，确保 hooks 调用顺序一致
  useImperativeHandle(ref, () => ({
    // 返回容器引用，用于 DOM 查询
    getContainer: () => noteSidebarRef.current,
    // 刷新笔记列表，供外部调用
    refreshNotes: refreshNotes,
    // 直接添加新笔记到状态（用于创建笔记后立即显示）
    addNoteDirectly: addNoteDirectly,
    // 提升笔记卡片到最前面（通过highlight_id）
    bringNoteToFront: bringNoteToFront,
  }), [refreshNotes, addNoteDirectly, bringNoteToFront]);
  
  // 渲染加载状态（只在真正需要加载时显示，避免展开时的闪烁）
  // 如果数据已经加载过（loadedEpisodeIdRef.current === episodeId），就不显示 loading
  if (loading && loadedEpisodeIdRef.current !== episodeId) {
    return (
      <Box
        data-testid="note-sidebar-loading"
        sx={{
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Stack spacing={2}>
          <Skeleton variant="rectangular" height={100} />
          <Skeleton variant="rectangular" height={100} />
          <Skeleton variant="rectangular" height={100} />
        </Stack>
      </Box>
    );
  }
  
  // 渲染错误状态（只在真正需要显示错误时显示，避免展开时的闪烁）
  // 如果数据已经加载过（loadedEpisodeIdRef.current === episodeId），就不显示错误
  if (error && loadedEpisodeIdRef.current !== episodeId) {
    return (
      <Box
        data-testid="note-sidebar-error"
        sx={{
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Alert severity="error">
          加载笔记失败：{error.message || '未知错误'}
        </Alert>
      </Box>
    );
  }
  
  return (
    <Box
      ref={noteSidebarRef}
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1, // 确保笔记卡片在音频播放器之上
      }}
    >
      {/* 收缩按钮（向右箭头图标，PRD 377行） */}
      {/* 注意：如果 isExpanded 由外部控制，按钮在 MainLayout 中渲染；否则在内部渲染（用于测试） */}
      {isExpanded && externalIsExpanded === undefined && (
        <IconButton
          data-testid="note-sidebar-collapse-button"
          onClick={handleCollapse}
          sx={{
            position: 'absolute',
            left: '-28px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            padding: 0,
            zIndex: 1002,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            borderRadius: '4px',
            '&:hover': {
              borderColor: 'text.primary',
              bgcolor: 'action.hover',
            },
            '&:active': {
              transform: 'translateY(-50%) scale(0.95)',
              borderColor: 'text.primary',
            },
          }}
        >
          <ArrowForward 
            sx={{ 
              fontSize: '16px',
              width: '9px',
              height: '16px',
            }} 
          />
        </IconButton>
      )}
      
      {/* 展开按钮（笔记图标气泡，PRD 379行） */}
      {!isExpanded && externalIsExpanded === undefined && (
        <IconButton
          data-testid="note-sidebar-expand-button"
          onClick={handleExpand}
          sx={{
            position: 'absolute',
            left: '-56px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '40px',
            minWidth: '40px',
            zIndex: 1002,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '50%',
            boxShadow: 1,
            '&:hover': {
              bgcolor: 'action.hover',
              borderColor: 'text.primary',
            },
            '&:active': {
              transform: 'translateY(-50%) scale(0.95)',
            },
          }}
        >
          <StickyNote2 
            sx={{ 
              fontSize: '20px',
            }} 
          />
        </IconButton>
      )}
      
      {/* 内容容器 */}
      {isExpanded && (
        <Box
          data-testid="note-sidebar-content"
          sx={{
            width: '100%',
            height: '100%',
            maxHeight: '100%', // 明确限制最大高度
            px: 3, // 距离左右边缘 24px（PRD 390行）
            py: 2,
            overflow: 'visible', // 允许笔记卡片超出容器可见，避免在页面放大时被裁剪
            position: 'relative', // 为绝对定位的笔记卡片提供定位上下文
            boxSizing: 'border-box', // 确保 padding 包含在高度内
          }}
        >
          {sortedNotes.length === 0 ? (
            // 空状态（PRD 382-384行）
            <Box
              data-testid="note-sidebar-empty"
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                暂无笔记
              </Typography>
            </Box>
          ) : (
            // 笔记列表（使用绝对定位，跟随划线源位置）
            <Box
              data-testid="note-sidebar-list"
              sx={{
                width: '100%',
                position: 'relative',
                height: '100%', // 占满父容器高度
                maxHeight: '100%', // 明确限制最大高度
                minHeight: 0, // 防止容器被撑高
                overflow: 'visible', // 允许笔记卡片超出容器可见，避免在页面放大时被裁剪
                contain: 'layout style size', // 使用 contain 属性，避免绝对定位子元素影响父容器高度和大小
                isolation: 'isolate', // 创建新的层叠上下文，进一步隔离绝对定位子元素
                zIndex: 1, // 确保笔记卡片在音频播放器之上
                boxSizing: 'border-box', // 确保容器高度不受绝对定位子元素影响
              }}
            >
              {sortedNotes.map((note) => {
                const highlight = highlights.get(note.highlight_id);
                const position = highlight ? notePositions[highlight.id] : null;
                
                // 如果位置未计算出来，使用默认位置（按创建时间排序）
                const topValue = position !== null && position !== undefined
                  ? `${position - 24}px` // PRD 390行：笔记卡片的顶部在划线源顶部上面24px
                  : 'auto';
                
                // 位置是否已计算完成（用于控制显示和动画）
                const isPositionReady = position !== null && position !== undefined;
                
                // 动态计算z-index：如果这个笔记应该显示在最前面，使用更高的z-index
                const isFrontNote = highlight && highlight.id === frontNoteHighlightId;
                const cardZIndex = isFrontNote ? 1002 : 1001; // 最前面的笔记使用1002，其他使用1001
                
                return (
                  <Box
                    key={note.id}
                    data-note-highlight-id={highlight?.id}
                    sx={{
                      position: 'absolute',
                      top: topValue,
                      left: 0,
                      right: 0,
                      width: '100%',
                      maxWidth: '100%', // 确保不超出容器宽度
                      height: 'auto', // 确保容器高度只包含内容
                      maxHeight: '50vh', // 限制最大高度，与 NoteCard 的 maxHeight 保持一致
                      // 只有在位置已就绪时才应用 transition，避免从 auto 到具体值的动画
                      transition: isPositionReady ? 'top 0.1s ease-out, z-index 0.1s ease-out' : 'none',
                      zIndex: cardZIndex, // 动态z-index：最前面的笔记使用1002，其他使用1001
                      overflow: 'visible', // 允许 NoteCard 内部的滚动条显示
                      // 位置未就绪时隐藏，避免显示在错误位置
                      visibility: isPositionReady ? 'visible' : 'hidden',
                    }}
                  >
                    <NoteCard
                      note={note}
                      highlight={highlight}
                      onClick={() => {
                        // 点击笔记卡片时，提升该笔记卡片的z-index
                        if (highlight) {
                          setFrontNoteHighlightId(highlight.id);
                        }
                        onNoteClick?.(note, highlight);
                      }}
                      onUpdate={handleUpdateNote}
                      onDelete={() => handleDeleteNote(note.id)}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
});

export default NoteSidebar;
