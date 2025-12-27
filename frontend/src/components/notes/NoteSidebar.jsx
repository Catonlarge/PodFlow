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

import { useState, useEffect, useRef } from 'react';
import { Box, Stack, IconButton, Skeleton, Alert, Typography } from '@mui/material';
import { ArrowForward, StickyNote2 } from '@mui/icons-material';
import { noteService } from '../../services/noteService';
import { highlightService } from '../../services/highlightService';
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
 */
export default function NoteSidebar({ episodeId, onNoteClick, onNoteDelete, isExpanded: externalIsExpanded, onExpandedChange }) {
  // 笔记数据和划线数据
  const [notes, setNotes] = useState([]);
  const [highlights, setHighlights] = useState(new Map());
  
  // 加载状态和错误状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 展开/收缩状态（如果外部提供则使用外部状态，否则内部管理）
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  
  // 用户是否主动操作过展开/收缩状态
  const hasUserInteractedRef = useRef(false);
  
  // 调试：监听外部状态变化
  useEffect(() => {
    console.log('[NoteSidebar] externalIsExpanded 变化:', externalIsExpanded);
    console.log('[NoteSidebar] internalIsExpanded 当前值:', internalIsExpanded);
    console.log('[NoteSidebar] isExpanded 最终值:', isExpanded);
  }, [externalIsExpanded, internalIsExpanded, isExpanded]);
  
  // 调试：监听渲染时的展开状态
  useEffect(() => {
    console.log('[NoteSidebar] 渲染内容容器，isExpanded:', isExpanded);
  }, [isExpanded]);
  
  // 记录已加载的 episodeId，避免重复加载
  const loadedEpisodeIdRef = useRef(null);

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
    
    // 如果已经加载过这个 episodeId 的数据，且数据存在，就不重新加载
    if (loadedEpisodeIdRef.current === episodeId && notes.length >= 0) {
      console.log('[NoteSidebar] 数据已加载，跳过重新加载');
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
        if (displayNotes.length === 0 && highlightsData.length === 0) {
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
  }, [episodeId, onExpandedChange]);
  
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
  
  // 处理笔记更新
  const handleUpdateNote = async (noteId, content) => {
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
      } catch (err) {
        console.error('[NoteSidebar] 刷新笔记列表失败:', err);
      }
    }
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
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
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
            px: 3, // 距离左右边缘 24px（PRD 390行）
            py: 2,
            overflowY: 'auto',
            overflowX: 'hidden',
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
            // 笔记列表（PRD 382-384行）
            <Stack
              data-testid="note-sidebar-list"
              spacing={2}
              sx={{
                width: '100%',
              }}
            >
              {sortedNotes.map((note) => {
                const highlight = highlights.get(note.highlight_id);
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    highlight={highlight}
                    onClick={() => onNoteClick?.(note, highlight)}
                    onUpdate={handleUpdateNote}
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                );
              })}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
}
