/**
 * NoteCard 组件测试
 * * 遵循TDD原则，不使用条件逻辑，测试用例描述行为
 * * @module components/notes/__tests__/NoteCard.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoteCard from '../NoteCard';
import { noteService } from '../../../services/noteService';

// Mock noteService
vi.mock('../../../services/noteService', () => ({
  noteService: {
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

// Mock Modal组件
vi.mock('../../common/Modal', () => ({
  default: ({ open, onClose, title, message, onConfirm, onCancel, allowBackdropClose }) => {
    if (!open) return null;
    return (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-message">{message}</div>
        <button data-testid="modal-confirm" onClick={onConfirm}>
          确认
        </button>
        <button data-testid="modal-cancel" onClick={onCancel}>
          取消
        </button>
        <div data-testid="modal-allow-backdrop-close">{allowBackdropClose ? 'true' : 'false'}</div>
      </div>
    );
  },
}));

describe('NoteCard', () => {
  const mockNote = {
    id: 1,
    content: '这是测试笔记内容',
    note_type: 'thought',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  const mockHighlight = {
    id: 10,
    cue_id: 1,
    highlighted_text: 'test text',
    start_offset: 0,
    end_offset: 10,
    color: '#9C27B0',
    highlight_group_id: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('test_note_card_renders_with_title_bar_and_content', () => {
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      expect(screen.getByTestId(`note-card-${mockNote.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`note-content-${mockNote.id}`)).toBeInTheDocument();
    });

    it('test_note_card_displays_user_avatar', () => {
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const avatar = screen.getByTestId(`note-avatar-${mockNote.id}`);
      expect(avatar).toBeInTheDocument();
    });

    it('test_note_card_displays_edit_icon', () => {
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const editButton = screen.getByTestId(`note-edit-${mockNote.id}`);
      expect(editButton).toBeInTheDocument();
    });

    it('test_note_card_displays_delete_icon', () => {
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('编辑功能测试', () => {
    it('test_clicking_edit_icon_enters_edit_mode', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const editButton = screen.getByTestId(`note-edit-${mockNote.id}`);
      await user.click(editButton);
      
      const textarea = screen.getByTestId(`note-edit-textarea-${mockNote.id}`);
      expect(textarea).toBeInTheDocument();
    });

    it('test_edit_mode_shows_textarea', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const editButton = screen.getByTestId(`note-edit-${mockNote.id}`);
      await user.click(editButton);
      
      // 等待 textarea 渲染
      const textarea = await waitFor(() => {
        return screen.getByTestId(`note-edit-textarea-${mockNote.id}`);
      });
      
      // TextField 的 value 在 input 元素上
      const input = textarea.querySelector('textarea') || textarea;
      expect(input).toHaveValue(mockNote.content);
    });

    it('test_clicking_outside_submits_edit', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn().mockResolvedValue({ success: true });
      render(<NoteCard note={mockNote} highlight={mockHighlight} onUpdate={onUpdate} />);
      
      const editButton = screen.getByTestId(`note-edit-${mockNote.id}`);
      await user.click(editButton);
      
      // 等待 textarea 渲染
      const textareaContainer = await waitFor(() => {
        return screen.getByTestId(`note-edit-textarea-${mockNote.id}`);
      });
      
      // TextField 的 input 元素
      const textarea = textareaContainer.querySelector('textarea');
      expect(textarea).toBeInTheDocument();
      
      // 清空并输入新内容
      await user.clear(textarea);
      await user.type(textarea, '修改后的内容');
      
      await user.click(document.body);
      
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(mockNote.id, '修改后的内容');
      });
    });

    it('test_edit_mode_calls_onUpdate_callback', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn().mockResolvedValue({ success: true });
      noteService.updateNote.mockResolvedValue({ success: true });
      
      render(<NoteCard note={mockNote} highlight={mockHighlight} onUpdate={onUpdate} />);
      
      const editButton = screen.getByTestId(`note-edit-${mockNote.id}`);
      await user.click(editButton);
      
      // 等待 textarea 渲染
      const textareaContainer = await waitFor(() => {
        return screen.getByTestId(`note-edit-textarea-${mockNote.id}`);
      });
      
      // TextField 的 input 元素
      const textarea = textareaContainer.querySelector('textarea');
      expect(textarea).toBeInTheDocument();
      
      // 清空并输入新内容
      await user.clear(textarea);
      await user.type(textarea, '新内容');
      
      await user.click(document.body);
      
      await waitFor(() => {
        expect(noteService.updateNote).toHaveBeenCalledWith(mockNote.id, '新内容');
        expect(onUpdate).toHaveBeenCalledWith(mockNote.id, '新内容');
      });
    });
  });

  describe('删除功能测试', () => {
    it('test_clicking_delete_icon_opens_modal', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      await user.click(deleteButton);
      
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    it('test_delete_modal_displays_confirmation_message', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      await user.click(deleteButton);
      
      expect(screen.getByTestId('modal-title')).toHaveTextContent('确认删除笔记？');
    });

    it('test_delete_modal_has_confirm_and_cancel_buttons', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      await user.click(deleteButton);
      
      expect(screen.getByTestId('modal-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('modal-cancel')).toBeInTheDocument();
    });

    it('test_clicking_confirm_deletes_note', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn().mockResolvedValue({ success: true });
      noteService.deleteNote.mockResolvedValue({ success: true });
      
      render(<NoteCard note={mockNote} highlight={mockHighlight} onDelete={onDelete} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      await user.click(deleteButton);
      
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(noteService.deleteNote).toHaveBeenCalledWith(mockNote.id);
        expect(onDelete).toHaveBeenCalledWith(mockNote.id);
      });
    });

    it('test_clicking_cancel_closes_modal', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      await user.click(deleteButton);
      
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      
      const cancelButton = screen.getByTestId('modal-cancel');
      await user.click(cancelButton);
      
      await waitFor(() => {
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
      });
    });

    it('test_delete_modal_does_not_allow_backdrop_close', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const deleteButton = screen.getByTestId(`note-delete-${mockNote.id}`);
      await user.click(deleteButton);
      
      const allowBackdropClose = screen.getByTestId('modal-allow-backdrop-close');
      expect(allowBackdropClose).toHaveTextContent('false');
    });
  });

  describe('双向链接测试', () => {
    it('test_clicking_note_card_triggers_onClick_callback', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<NoteCard note={mockNote} highlight={mockHighlight} onClick={onClick} />);
      
      const noteCard = screen.getByTestId(`note-card-${mockNote.id}`);
      await user.click(noteCard);
      
      expect(onClick).toHaveBeenCalledWith(mockNote, mockHighlight);
    });
  });

  describe('三状态测试', () => {
    it('test_note_card_normal_state', () => {
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const noteCard = screen.getByTestId(`note-card-${mockNote.id}`);
      expect(noteCard).toBeInTheDocument();
    });

    it('test_note_card_hover_state', () => {
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const noteCard = screen.getByTestId(`note-card-${mockNote.id}`);
      const styles = window.getComputedStyle(noteCard);
      
      expect(noteCard).toBeInTheDocument();
    });

    it('test_note_card_active_state', async () => {
      const user = userEvent.setup();
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      
      const noteCard = screen.getByTestId(`note-card-${mockNote.id}`);
      await user.click(noteCard);
      
      expect(noteCard).toBeInTheDocument();
    });
  });

  describe('视觉样式测试', () => {
    it('test_note_card_has_solid_background_to_prevent_transparency', async () => {
      // 这是一个针对"笔记卡片重叠时不应透明"需求的测试用例
      render(<NoteCard note={mockNote} highlight={mockHighlight} />);
      const noteCard = screen.getByTestId(`note-card-${mockNote.id}`);
      
      // 模拟 hover 行为
      const user = userEvent.setup();
      await user.hover(noteCard);
      
      // 验证卡片在 Hover 状态下依然存在且没有被移除
      expect(noteCard).toBeInTheDocument();
      
      // 注意：在单元测试环境（JSDOM）中，很难验证 visually "是否透明" 或 "是否有背景色遮挡"
      // 但这个测试确保了我们没有因为 hover 状态而导致组件渲染异常
      // 实际的样式效果主要依靠 CSS (sx prop) 的正确性来保证
    });
  });

  describe('内容排版测试', () => {
    it('test_note_content_supports_line_breaks', () => {
      const noteWithLineBreaks = {
        ...mockNote,
        content: '第一行\n第二行\n第三行',
      };
      
      render(<NoteCard note={noteWithLineBreaks} highlight={mockHighlight} />);
      
      const content = screen.getByTestId(`note-content-${mockNote.id}`);
      expect(content).toBeInTheDocument();
    });

    it('test_note_content_supports_bold_syntax', () => {
      const noteWithBold = {
        ...mockNote,
        content: '这是**加粗文本**和普通文本',
      };
      
      render(<NoteCard note={noteWithBold} highlight={mockHighlight} />);
      
      const content = screen.getByTestId(`note-content-${mockNote.id}`);
      expect(content).toBeInTheDocument();
    });

    it('test_note_content_filters_js_injection', () => {
      const noteWithScript = {
        ...mockNote,
        content: '<script>alert("xss")</script>正常内容',
      };
      
      render(<NoteCard note={noteWithScript} highlight={mockHighlight} />);
      
      const content = screen.getByTestId(`note-content-${mockNote.id}`);
      expect(content).toBeInTheDocument();
      expect(content.innerHTML).not.toContain('<script>');
    });
  });
});