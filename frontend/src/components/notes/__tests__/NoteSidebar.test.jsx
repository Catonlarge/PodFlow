import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoteSidebar from '../NoteSidebar';
import { noteService } from '../../../services/noteService';
import { highlightService } from '../../../services/highlightService';

// Mock noteService
vi.mock('../../../services/noteService', () => ({
  noteService: {
    getNotesByEpisode: vi.fn(),
  },
}));

// Mock highlightService
vi.mock('../../../services/highlightService', () => ({
  highlightService: {
    getHighlightsByEpisode: vi.fn(),
  },
}));

// Mock NoteCard（Task 3.7 实现，这里先占位）
vi.mock('../NoteCard', () => ({
  default: ({ note, highlight, onClick, onDelete }) => (
    <div 
      data-testid={`note-card-${note.id}`}
      onClick={() => onClick?.()}
      data-note-type={note.note_type}
      data-highlight-id={highlight?.id}
    >
      <div data-testid={`note-content-${note.id}`}>
        {note.content || 'No content'}
      </div>
      <button 
        data-testid={`note-delete-${note.id}`}
        onClick={() => onDelete?.()}
      >
        删除
      </button>
    </div>
  ),
}));

describe('NoteSidebar', () => {
  const mockNotes = [
    {
      id: 1,
      highlight_id: 10,
      content: '这是第一条笔记',
      note_type: 'thought',
      origin_ai_query_id: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 2,
      highlight_id: 11,
      content: '这是第二条笔记',
      note_type: 'ai_card',
      origin_ai_query_id: 1,
      created_at: '2025-01-02T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    },
    {
      id: 3,
      highlight_id: 12,
      content: null,
      note_type: 'underline',
      origin_ai_query_id: null,
      created_at: '2025-01-03T00:00:00Z',
      updated_at: '2025-01-03T00:00:00Z',
    },
  ];

  const mockHighlights = [
    {
      id: 10,
      cue_id: 1,
      highlighted_text: 'test text 1',
      start_offset: 0,
      end_offset: 10,
      color: '#9C27B0',
      highlight_group_id: null,
    },
    {
      id: 11,
      cue_id: 2,
      highlighted_text: 'test text 2',
      start_offset: 0,
      end_offset: 10,
      color: '#9C27B0',
      highlight_group_id: null,
    },
    {
      id: 12,
      cue_id: 3,
      highlighted_text: 'test text 3',
      start_offset: 0,
      end_offset: 10,
      color: '#9C27B0',
      highlight_group_id: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    noteService.getNotesByEpisode.mockResolvedValue([]);
    highlightService.getHighlightsByEpisode.mockResolvedValue([]);
  });

  describe('组件渲染', () => {
    it('应该正常渲染组件（无笔记时显示空状态）', async () => {
      render(<NoteSidebar episodeId={1} />);

      // 等待数据加载完成
      await waitFor(() => {
        expect(noteService.getNotesByEpisode).toHaveBeenCalled();
      });

      // 无笔记时应该显示展开按钮（收缩状态）
      await waitFor(() => {
        const expandButton = screen.getByTestId('note-sidebar-expand-button');
        expect(expandButton).toBeInTheDocument();
      });
    });

    it('应该传入 episodeId 后加载笔记数据', async () => {
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        expect(noteService.getNotesByEpisode).toHaveBeenCalledWith(1);
        expect(highlightService.getHighlightsByEpisode).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('展开/收缩逻辑', () => {
    it('应该无笔记时默认收缩（isExpanded = false）', async () => {
      noteService.getNotesByEpisode.mockResolvedValue([]);
      highlightService.getHighlightsByEpisode.mockResolvedValue([]);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        // 应该显示展开按钮（收缩状态）
        const expandButton = screen.getByTestId('note-sidebar-expand-button');
        expect(expandButton).toBeInTheDocument();
      });

      // 不应该显示笔记列表容器
      const noteList = screen.queryByTestId('note-sidebar-list');
      expect(noteList).not.toBeInTheDocument();
    });

    it('应该有笔记时默认展开（isExpanded = true）', async () => {
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        // 应该显示笔记列表（展开状态）
        const noteList = screen.getByTestId('note-sidebar-list');
        expect(noteList).toBeInTheDocument();
      });

      // 应该显示收缩按钮
      const collapseButton = screen.getByTestId('note-sidebar-collapse-button');
      expect(collapseButton).toBeInTheDocument();
    });

    it('应该点击收缩按钮后状态变为 false', async () => {
      const user = userEvent.setup();
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar-list')).toBeInTheDocument();
      });

      // 点击收缩按钮
      const collapseButton = screen.getByTestId('note-sidebar-collapse-button');
      await user.click(collapseButton);

      // 应该隐藏笔记列表，显示展开按钮
      await waitFor(() => {
        expect(screen.queryByTestId('note-sidebar-list')).not.toBeInTheDocument();
        expect(screen.getByTestId('note-sidebar-expand-button')).toBeInTheDocument();
      });
    });

    it('应该点击展开按钮后状态变为 true', async () => {
      const user = userEvent.setup();
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      // 等待数据加载完成，此时应该自动展开（因为有笔记）
      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar-list')).toBeInTheDocument();
      });

      // 先收缩
      const collapseButton = screen.getByTestId('note-sidebar-collapse-button');
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.queryByTestId('note-sidebar-list')).not.toBeInTheDocument();
      });

      // 再点击展开按钮
      const expandButton = screen.getByTestId('note-sidebar-expand-button');
      await user.click(expandButton);

      // 应该显示笔记列表
      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar-list')).toBeInTheDocument();
      });
    });

    it('应该用户主动收起后，即使笔记数量变化也维持收缩状态', async () => {
      const user = userEvent.setup();
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      const { rerender } = render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar-list')).toBeInTheDocument();
      });

      // 用户主动收起
      const collapseButton = screen.getByTestId('note-sidebar-collapse-button');
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.queryByTestId('note-sidebar-list')).not.toBeInTheDocument();
      });

      // 模拟笔记数量变化（新增一条笔记）
      const newNotes = [...mockNotes, {
        id: 4,
        highlight_id: 13,
        content: '新笔记',
        note_type: 'thought',
        created_at: '2025-01-04T00:00:00Z',
        updated_at: '2025-01-04T00:00:00Z',
      }];
      noteService.getNotesByEpisode.mockResolvedValue(newNotes);

      // 重新渲染（模拟数据更新）
      rerender(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        // 应该仍然保持收缩状态（不自动展开）
        expect(screen.queryByTestId('note-sidebar-list')).not.toBeInTheDocument();
        expect(screen.getByTestId('note-sidebar-expand-button')).toBeInTheDocument();
      });
    });
  });

  describe('空状态', () => {
    it('应该无笔记时显示提示文字', async () => {
      const user = userEvent.setup();
      noteService.getNotesByEpisode.mockResolvedValue([]);
      highlightService.getHighlightsByEpisode.mockResolvedValue([]);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar-expand-button')).toBeInTheDocument();
      });

      // 点击展开按钮，显示空状态
      const expandButton = screen.getByTestId('note-sidebar-expand-button');
      await user.click(expandButton);

      await waitFor(() => {
        const emptyState = screen.getByTestId('note-sidebar-empty');
        expect(emptyState).toBeInTheDocument();
      });
    });

    it('应该无笔记时显示悬浮笔记图标', async () => {
      noteService.getNotesByEpisode.mockResolvedValue([]);
      highlightService.getHighlightsByEpisode.mockResolvedValue([]);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        const expandButton = screen.getByTestId('note-sidebar-expand-button');
        expect(expandButton).toBeInTheDocument();
      });
    });

    it('应该点击悬浮笔记图标后展开笔记区域', async () => {
      const user = userEvent.setup();
      noteService.getNotesByEpisode.mockResolvedValue([]);
      highlightService.getHighlightsByEpisode.mockResolvedValue([]);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar-expand-button')).toBeInTheDocument();
      });

      // 点击展开按钮
      const expandButton = screen.getByTestId('note-sidebar-expand-button');
      await user.click(expandButton);

      // 应该显示空状态内容
      await waitFor(() => {
        const emptyState = screen.getByTestId('note-sidebar-empty');
        expect(emptyState).toBeInTheDocument();
      });
    });
  });

  describe('笔记列表循环', () => {
    it('应该有笔记时渲染所有 NoteCard 组件（过滤 underline 类型）', async () => {
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        // 应该只渲染 2 个 NoteCard（过滤掉 underline 类型）
        expect(screen.getByTestId('note-card-1')).toBeInTheDocument();
        expect(screen.getByTestId('note-card-2')).toBeInTheDocument();
        expect(screen.queryByTestId('note-card-3')).not.toBeInTheDocument();
      });
    });

    it('应该笔记列表按创建时间排序（created_at 升序）', async () => {
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        const noteList = screen.getByTestId('note-sidebar-list');
        const noteCards = noteList.querySelectorAll('[data-testid^="note-card-"]');
        
        // 验证顺序：note-1 (2025-01-01) 应该在 note-2 (2025-01-02) 之前
        expect(noteCards[0]).toHaveAttribute('data-testid', 'note-card-1');
        expect(noteCards[1]).toHaveAttribute('data-testid', 'note-card-2');
      });
    });

    it('应该每个 NoteCard 接收正确的 props', async () => {
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        const noteCard1 = screen.getByTestId('note-card-1');
        expect(noteCard1).toHaveAttribute('data-note-type', 'thought');
        expect(noteCard1).toHaveAttribute('data-highlight-id', '10');

        const noteCard2 = screen.getByTestId('note-card-2');
        expect(noteCard2).toHaveAttribute('data-note-type', 'ai_card');
        expect(noteCard2).toHaveAttribute('data-highlight-id', '11');
      });
    });
  });

  describe('数据加载', () => {
    it('应该 episodeId 变化时重新加载笔记数据', async () => {
      noteService.getNotesByEpisode.mockResolvedValue([]);
      highlightService.getHighlightsByEpisode.mockResolvedValue([]);

      const { rerender } = render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        expect(noteService.getNotesByEpisode).toHaveBeenCalledWith(1);
      });

      // 改变 episodeId
      rerender(<NoteSidebar episodeId={2} />);

      await waitFor(() => {
        expect(noteService.getNotesByEpisode).toHaveBeenCalledWith(2);
        expect(highlightService.getHighlightsByEpisode).toHaveBeenCalledWith(2);
      });
    });

    it('应该加载中显示 Loading 状态（Skeleton）', async () => {
      // 延迟返回，模拟加载中
      noteService.getNotesByEpisode.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 100))
      );
      highlightService.getHighlightsByEpisode.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 100))
      );

      render(<NoteSidebar episodeId={1} />);

      // 应该显示 Loading 状态
      const loading = screen.getByTestId('note-sidebar-loading');
      expect(loading).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('note-sidebar-loading')).not.toBeInTheDocument();
      });
    });

    it('应该加载失败显示错误提示', async () => {
      const error = new Error('加载失败');
      noteService.getNotesByEpisode.mockRejectedValue(error);
      highlightService.getHighlightsByEpisode.mockResolvedValue([]);

      render(<NoteSidebar episodeId={1} />);

      await waitFor(() => {
        const errorAlert = screen.getByTestId('note-sidebar-error');
        expect(errorAlert).toBeInTheDocument();
      });
    });
  });

  describe('交互回调', () => {
    it('应该点击笔记卡片时调用 onNoteClick 回调', async () => {
      const user = userEvent.setup();
      const onNoteClick = vi.fn();
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} onNoteClick={onNoteClick} />);

      await waitFor(() => {
        expect(screen.getByTestId('note-card-1')).toBeInTheDocument();
      });

      // 点击笔记卡片
      const noteCard = screen.getByTestId('note-card-1');
      await user.click(noteCard);

      // 验证回调被调用
      await waitFor(() => {
        expect(onNoteClick).toHaveBeenCalledTimes(1);
        expect(onNoteClick).toHaveBeenCalledWith(
          expect.objectContaining({ id: 1 }),
          expect.objectContaining({ id: 10 })
        );
      });
    });

    it('应该删除笔记时调用 onNoteDelete 回调并刷新列表', async () => {
      const user = userEvent.setup();
      const onNoteDelete = vi.fn();
      const displayNotes = mockNotes.filter(n => n.note_type !== 'underline');
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);
      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);

      render(<NoteSidebar episodeId={1} onNoteDelete={onNoteDelete} />);

      await waitFor(() => {
        expect(screen.getByTestId('note-card-1')).toBeInTheDocument();
      });

      // 点击删除按钮
      const deleteButton = screen.getByTestId('note-delete-1');
      await user.click(deleteButton);

      // 验证回调被调用
      await waitFor(() => {
        expect(onNoteDelete).toHaveBeenCalledWith(1);
      });
    });
  });
});

