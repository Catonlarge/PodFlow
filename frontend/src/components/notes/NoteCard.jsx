/**
 * NoteCard 组件
 * 
 * 笔记卡片组件，包含展示态、编辑态、删除功能、双向链接触发等核心功能
 * 
 * 功能描述：
 * - 显示单条笔记内容
 * - 包含展示态、编辑态、删除按钮逻辑
 * - 删除确认直接使用通用的<Modal>组件（不创建DeleteConfirmModal.jsx）
 * 
 * 相关PRD：
 * - PRD 6.2.4.h: 笔记卡片（403-424行）
 * 
 * @module components/notes/NoteCard
 */

import { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Avatar,
  IconButton,
  Typography,
  TextField,
  Box,
} from '@mui/material';
import { Edit, Delete, Person } from '@mui/icons-material';
import Modal from '../common/Modal';
import { noteService } from '../../services/noteService';

/**
 * 简单的Markdown渲染（仅支持**加粗**语法）
 * 
 * @param {string} content - 原始内容
 * @returns {string} 渲染后的HTML字符串
 */
const renderMarkdown = (content) => {
  if (!content) return '';
  // 将 **text** 转换为 <strong>text</strong>
  return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

/**
 * 过滤危险内容（防止JS注入）
 * 
 * @param {string} content - 原始内容
 * @returns {string} 过滤后的内容
 */
const sanitizeContent = (content) => {
  if (!content) return '';
  // 移除 <script>、<iframe>、onclick 等危险标签和属性
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
};

/**
 * NoteCard 组件
 * 
 * @param {Object} props
 * @param {Object} props.note - 笔记数据
 * @param {Object} [props.highlight] - 关联的划线数据
 * @param {Function} [props.onUpdate] - 更新笔记回调 (noteId: number, content: string) => Promise<void>
 * @param {Function} [props.onDelete] - 删除笔记回调 (noteId: number) => Promise<void>
 * @param {Function} [props.onClick] - 点击笔记卡片回调 (note: Object, highlight: Object) => void
 */
export default function NoteCard({ note, highlight, onUpdate, onDelete, onClick }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(note.content || '');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const cardRef = useRef(null);
  const textareaRef = useRef(null);
  const cardContentRef = useRef(null);

  // 当note.content变化时，更新editedContent
  useEffect(() => {
    setEditedContent(note.content || '');
  }, [note.content]);


  // 点击外部提交编辑
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isEditing && cardRef.current && !cardRef.current.contains(event.target)) {
        handleSubmitEdit();
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      // 聚焦到textarea
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, editedContent]);

  // 处理编辑提交
  const handleSubmitEdit = async () => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      await noteService.updateNote(note.id, editedContent);
      if (onUpdate) {
        await onUpdate(note.id, editedContent);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('[NoteCard] 更新笔记失败:', error);
      // 恢复原内容
      setEditedContent(note.content || '');
    } finally {
      setIsUpdating(false);
    }
  };

  // 处理删除确认
  const handleDeleteConfirm = async () => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    try {
      await noteService.deleteNote(note.id);
      if (onDelete) {
        await onDelete(note.id);
      }
      setDeleteModalOpen(false);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteCard.jsx:144',message:'删除笔记失败',data:{noteId:note.id,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error('[NoteCard] 删除笔记失败:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // 处理点击卡片容器
  const handleCardClick = (e) => {
    // 如果点击的是按钮或输入框，不触发onClick
    if (e.target.closest('button') || e.target.closest('textarea') || e.target.closest('input')) {
      return;
    }
    if (onClick) {
      onClick(note, highlight);
    }
  };

  // 处理edit图标点击
  const handleEditClick = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  // 处理delete图标点击
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setDeleteModalOpen(true);
  };

  // 渲染内容（支持换行和加粗）
  const renderContent = () => {
    const sanitized = sanitizeContent(note.content || '');
    const withMarkdown = renderMarkdown(sanitized);
    
    return (
      <Typography
        variant="body1"
        component="div"
        sx={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          '& strong': {
            fontWeight: 'bold',
          },
        }}
        dangerouslySetInnerHTML={{ __html: withMarkdown }}
      />
    );
  };

  return (
    <>
      <Card
        ref={cardRef}
        data-testid={`note-card-${note.id}`}
        onClick={handleCardClick}
        sx={{
          minHeight: '40px',
          maxHeight: '50vh', // PRD 395行：最大为用户屏幕的一半
          // 关键：不设置 height，让 Card 根据内容自适应，但不超过 maxHeight
          // 当内容超出 maxHeight 时，Card 会被限制在 maxHeight，CardContent 会滚动
          display: 'flex',
          flexDirection: 'column',
          cursor: onClick ? 'pointer' : 'default',
          overflow: 'hidden', // 确保 Card 本身不滚动，只有 CardContent 滚动
          boxSizing: 'border-box', // 确保 padding 和 border 包含在高度内
          // 使用 contain 属性，确保 Card 的高度计算不受子元素影响
          contain: 'layout style',
          '&:hover': {
            bgcolor: 'action.hover',
          },
          '&:active': {
            transform: 'scale(0.98)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        {/* 标题栏（常驻，滚动不影响） */}
        <CardHeader
          avatar={
            <Avatar
              data-testid={`note-avatar-${note.id}`}
              sx={{ bgcolor: 'primary.main' }}
            >
              <Person />
            </Avatar>
          }
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                data-testid={`note-edit-${note.id}`}
                size="small"
                onClick={handleEditClick}
                disabled={isEditing || isUpdating}
                sx={{ ml: 3 }}
              >
                <Edit fontSize="small" />
              </IconButton>
              <IconButton
                data-testid={`note-delete-${note.id}`}
                size="small"
                onClick={handleDeleteClick}
                disabled={isDeleting}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          }
          sx={{
            position: 'sticky',
            top: 0,
            bgcolor: 'background.paper',
            zIndex: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 1,
            flexShrink: 0, // 确保 CardHeader 不会被压缩
          }}
        />

        {/* 内容区 */}
        <CardContent
          ref={cardContentRef}
          sx={{
            flex: '1 1 0%', // 使用 0% 作为 flex-basis，确保 flex 子元素能够正确收缩
            overflowY: 'auto', // PRD 395行：当内容超过最大高度时，出现垂直滚动条
            overflowX: 'hidden',
            minHeight: 0, // 重要：允许 flex 子元素缩小，确保滚动条能正常工作
            maxHeight: 'calc(50vh - 60px)', // 明确设置最大高度：50vh 减去 CardHeader 的高度（约 60px）
            py: 1.5,
            boxSizing: 'border-box', // 确保 padding 包含在高度内
            // 自定义滚动条样式，使其更明显
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              '&:hover': {
                background: 'rgba(0, 0, 0, 0.3)',
              },
            },
            '&:last-child': {
              pb: 1.5,
            },
          }}
        >
          {isEditing ? (
            <TextField
              data-testid={`note-edit-textarea-${note.id}`}
              inputRef={textareaRef}
              multiline
              rows={4}
              fullWidth
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl+Enter 或 Cmd+Enter 提交
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitEdit();
                }
                // ESC 取消编辑
                if (e.key === 'Escape') {
                  setEditedContent(note.content || '');
                  setIsEditing(false);
                }
              }}
              disabled={isUpdating}
              sx={{
                '& .MuiInputBase-root': {
                  fontSize: '0.875rem',
                },
              }}
            />
          ) : (
            <Box
              data-testid={`note-content-${note.id}`}
              sx={{
                minHeight: '20px',
              }}
            >
              {note.content ? renderContent() : (
                <Typography variant="body2" color="text.secondary">
                  无内容
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 删除确认弹窗 */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="确认删除笔记？"
        showCancel={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModalOpen(false)}
        allowBackdropClose={false}
      />
    </>
  );
}
