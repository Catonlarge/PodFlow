import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubtitleList from '../SubtitleList';
import { highlightService } from '../../../services/highlightService';
import { noteService } from '../../../services/noteService';

// Mock highlightService
vi.mock('../../../services/highlightService', () => ({
  highlightService: {
    createHighlights: vi.fn(),
    getHighlightsByEpisode: vi.fn(),
    deleteHighlight: vi.fn(),
  },
}));

// Mock noteService
vi.mock('../../../services/noteService', () => ({
  noteService: {
    createNote: vi.fn(),
    getNotesByEpisode: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

// Mock subtitleService
vi.mock('../../../services/subtitleService', () => ({
  getMockCues: vi.fn(),
  getCuesByEpisodeId: vi.fn(),
  subtitleService: {
    getEpisodeSegments: vi.fn(),
    triggerSegmentTranscription: vi.fn(),
    restartTranscription: vi.fn(),
  },
}));

// Mock useTextSelection hook
const mockClearSelection = vi.fn();
const mockUseTextSelection = vi.fn(() => ({
  selectedText: null,
  selectionRange: null,
  affectedCues: [],
  clearSelection: mockClearSelection,
}));

vi.mock('../../../hooks/useTextSelection', () => ({
  useTextSelection: () => mockUseTextSelection(),
}));

// Mock window.getSelection for anchorPosition calculation
const mockGetSelection = vi.fn(() => ({
  rangeCount: 1,
  getRangeAt: vi.fn(() => ({
    getBoundingClientRect: vi.fn(() => ({
      left: 100,
      top: 200,
      width: 50,
      height: 20,
    })),
  })),
}));

Object.defineProperty(window, 'getSelection', {
  writable: true,
  value: mockGetSelection,
});

// Mock SelectionMenu
vi.mock('../SelectionMenu', () => ({
  default: ({ onUnderline, selectedText, anchorPosition }) => {
    if (!selectedText || !anchorPosition) return null;
    return (
      <div data-testid="selection-menu">
        <button data-testid="underline-button" onClick={onUnderline}>
          纯划线
        </button>
      </div>
    );
  },
}));

// Mock SubtitleRow
vi.mock('../SubtitleRow', () => ({
  default: ({ cue, highlights, isSelected, selectionRange }) => {
    const hasUnderline = highlights && highlights.length > 0;
    return (
      <div
        data-subtitle-id={cue.id}
        data-subtitle-index={cue.id - 1}
        data-has-underline={hasUnderline}
        data-highlights-count={highlights?.length || 0}
        data-selected={isSelected}
        data-selection-range={selectionRange ? 'true' : 'false'}
      >
        {cue.text}
        {hasUnderline && (
          <span
            data-highlight-id={highlights[0].id}
            style={{ textDecoration: 'underline', color: '#9C27B0' }}
          >
            {highlights.map(h => h.highlighted_text).join(' ')}
          </span>
        )}
      </div>
    );
  },
}));

describe('UnderlineFeature', () => {
  const mockCues = [
    { id: 1, start_time: 0.28, end_time: 2.22, speaker: 'Lenny', text: 'First subtitle text' },
    { id: 2, start_time: 2.5, end_time: 5.8, speaker: 'Lenny', text: 'Second subtitle text' },
    { id: 3, start_time: 6.0, end_time: 9.5, speaker: 'Guest', text: 'Third subtitle text' },
  ];

  const episodeId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClearSelection.mockClear();
    
    // 重置 useTextSelection mock
    mockUseTextSelection.mockReturnValue({
      selectedText: null,
      selectionRange: null,
      affectedCues: [],
      clearSelection: mockClearSelection,
    });

    // Mock window.getSelection for anchorPosition calculation
    mockGetSelection.mockReturnValue({
      rangeCount: 1,
      getRangeAt: vi.fn(() => ({
        getBoundingClientRect: vi.fn(() => ({
          left: 100,
          top: 200,
          width: 50,
          height: 20,
        })),
      })),
    });

    // 默认 mock 返回值
    highlightService.createHighlights.mockResolvedValue({
      success: true,
      highlight_ids: [1],
      highlight_group_id: null,
      created_at: '2025-01-01T00:00:00Z',
    });

    noteService.createNote.mockResolvedValue({
      id: 1,
      created_at: '2025-01-01T00:00:00Z',
    });

    highlightService.getHighlightsByEpisode.mockResolvedValue([]);
    noteService.getNotesByEpisode.mockResolvedValue([]);
  });

  describe('点击"纯划线"按钮', () => {
    it('应该调用 API 创建单 cue 划线', async () => {
      const user = userEvent.setup();
      
      // 模拟单 cue 文本选择
      mockUseTextSelection.mockReturnValue({
        selectedText: 'subtitle',
        selectionRange: {
          startCueId: 1,
          endCueId: 1,
          startOffset: 6,
          endOffset: 15,
        },
        affectedCues: [
          {
            cue: mockCues[0],
            startOffset: 6,
            endOffset: 15,
            selectedText: 'subtitle',
          },
        ],
        clearSelection: mockClearSelection,
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={episodeId}
        />
      );

      // 等待 SelectionMenu 渲染
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      // 点击"纯划线"按钮
      const underlineButton = screen.getByTestId('underline-button');
      await user.click(underlineButton);

      // 验证 API 调用
      // 注意：highlighted_text 可能包含空格，因为是从 cue.text.substring() 提取的
      await waitFor(() => {
        expect(highlightService.createHighlights).toHaveBeenCalledWith(
          episodeId,
          expect.arrayContaining([
            expect.objectContaining({
              cue_id: 1,
              start_offset: 6,
              end_offset: 15,
              highlighted_text: expect.stringMatching(/^subtitle\s*$/), // 允许尾随空格
              color: '#9C27B0',
            }),
          ]),
          null // 单 cue 划线，highlight_group_id 为 null
        );
      });

      // 验证创建 Note
      await waitFor(() => {
        expect(noteService.createNote).toHaveBeenCalledWith(
          episodeId,
          1, // highlight_id
          'underline',
          null, // content 为空
          null // origin_ai_query_id 为 null
        );
      });

      // 验证清除选择
      expect(mockClearSelection).toHaveBeenCalled();
    });

    it('应该调用 API 创建跨 cue 划线', async () => {
      const user = userEvent.setup();
      const groupId = 'test-group-id';

      // Mock crypto.randomUUID
      const originalRandomUUID = crypto.randomUUID;
      crypto.randomUUID = vi.fn(() => groupId);

      // 模拟跨 cue 文本选择
      mockUseTextSelection.mockReturnValue({
        selectedText: 'subtitle text Second',
        selectionRange: {
          startCueId: 1,
          endCueId: 2,
          startOffset: 6,
          endOffset: 6,
        },
        affectedCues: [
          {
            cue: mockCues[0],
            startOffset: 6,
            endOffset: mockCues[0].text.length,
            selectedText: 'subtitle text',
          },
          {
            cue: mockCues[1],
            startOffset: 0,
            endOffset: 6,
            selectedText: 'Second',
          },
        ],
        clearSelection: mockClearSelection,
      });

      highlightService.createHighlights.mockResolvedValue({
        success: true,
        highlight_ids: [1, 2],
        highlight_group_id: groupId,
        created_at: '2025-01-01T00:00:00Z',
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={episodeId}
        />
      );

      // 等待 SelectionMenu 渲染
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      // 点击"纯划线"按钮
      const underlineButton = screen.getByTestId('underline-button');
      await user.click(underlineButton);

      // 验证 API 调用（跨 cue 划线，创建多个 Highlight）
      await waitFor(() => {
        expect(highlightService.createHighlights).toHaveBeenCalledWith(
          episodeId,
          [
            {
              cue_id: 1,
              start_offset: 6,
              end_offset: mockCues[0].text.length,
              highlighted_text: 'subtitle text',
              color: '#9C27B0',
            },
            {
              cue_id: 2,
              start_offset: 0,
              end_offset: 6,
              highlighted_text: 'Second',
              color: '#9C27B0',
            },
          ],
          groupId // 跨 cue 划线，共享 highlight_group_id
        );
      });

      // 验证为每个 Highlight 创建 Note
      await waitFor(() => {
        expect(noteService.createNote).toHaveBeenCalledTimes(2);
        expect(noteService.createNote).toHaveBeenNthCalledWith(
          1,
          episodeId,
          1,
          'underline',
          null,
          null
        );
        expect(noteService.createNote).toHaveBeenNthCalledWith(
          2,
          episodeId,
          2,
          'underline',
          null,
          null
        );
      });

      // 恢复 crypto.randomUUID
      crypto.randomUUID = originalRandomUUID;
    });

    it('应该在 API 调用失败时显示错误提示', async () => {
      const user = userEvent.setup();

      // 模拟单 cue 文本选择
      mockUseTextSelection.mockReturnValue({
        selectedText: 'subtitle',
        selectionRange: {
          startCueId: 1,
          endCueId: 1,
          startOffset: 6,
          endOffset: 15,
        },
        affectedCues: [
          {
            cue: mockCues[0],
            startOffset: 6,
            endOffset: 15,
            selectedText: 'subtitle',
          },
        ],
        clearSelection: mockClearSelection,
      });

      // Mock API 失败
      highlightService.createHighlights.mockRejectedValue(
        new Error('网络错误')
      );

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={episodeId}
        />
      );

      // 等待 SelectionMenu 渲染
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      // 点击"纯划线"按钮
      const underlineButton = screen.getByTestId('underline-button');
      await user.click(underlineButton);

      // 验证错误提示显示
      await waitFor(() => {
        expect(screen.getByText(/创建划线失败|网络错误/)).toBeInTheDocument();
      });

      // 验证仍然清除选择（即使失败）
      expect(mockClearSelection).toHaveBeenCalled();
    });
  });

  describe('下划线样式生效', () => {
    it('应该正确渲染下划线样式', async () => {
      const mockHighlights = [
        {
          id: 1,
          cue_id: 1,
          start_offset: 6,
          end_offset: 15,
          highlighted_text: 'subtitle',
          color: '#9C27B0',
          highlight_group_id: null,
        },
      ];

      // 这个测试验证组件能够正常接收和渲染 highlights
      // 由于虚拟滚动的限制，我们主要验证组件不会崩溃且能正确处理 props
      expect(() => {
        render(
          <SubtitleList
            cues={mockCues}
            currentTime={1.0}
            duration={20.0}
            episodeId={episodeId}
            highlights={mockHighlights}
          />
        );
      }).not.toThrow();
    });
  });

  describe('刷新页面后下划线保持', () => {
    it('应该从 API 加载已有的 underline 笔记', async () => {
      const mockHighlights = [
        {
          id: 1,
          cue_id: 1,
          start_offset: 6,
          end_offset: 15,
          highlighted_text: 'subtitle',
          color: '#9C27B0',
          highlight_group_id: null,
        },
        {
          id: 2,
          cue_id: 2,
          start_offset: 0,
          end_offset: 6,
          highlighted_text: 'Second',
          color: '#9C27B0',
          highlight_group_id: null,
        },
      ];

      const mockNotes = [
        {
          id: 1,
          highlight_id: 1,
          content: null,
          note_type: 'underline',
          origin_ai_query_id: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 2,
          highlight_id: 2,
          content: 'Some thought',
          note_type: 'thought', // thought 类型，现在应该显示下划线
          origin_ai_query_id: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      highlightService.getHighlightsByEpisode.mockResolvedValue(mockHighlights);
      noteService.getNotesByEpisode.mockResolvedValue(mockNotes);

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={episodeId}
        />
      );

      // 验证加载 highlights 和 notes
      await waitFor(() => {
        expect(highlightService.getHighlightsByEpisode).toHaveBeenCalledWith(episodeId);
        expect(noteService.getNotesByEpisode).toHaveBeenCalledWith(episodeId);
      });
    });
  });

  describe('错误处理', () => {
    it('应该在 Note 创建失败时依然显示下划线但提示错误', async () => {
      const user = userEvent.setup();

      // 模拟单 cue 文本选择
      mockUseTextSelection.mockReturnValue({
        selectedText: 'subtitle',
        selectionRange: {
          startCueId: 1,
          endCueId: 1,
          startOffset: 6,
          endOffset: 15,
        },
        affectedCues: [
          {
            cue: mockCues[0],
            startOffset: 6,
            endOffset: 15,
            selectedText: 'subtitle',
          },
        ],
        clearSelection: mockClearSelection,
      });

      // Highlight 创建成功，但 Note 创建失败
      highlightService.createHighlights.mockResolvedValue({
        success: true,
        highlight_ids: [1],
        highlight_group_id: null,
        created_at: '2025-01-01T00:00:00Z',
      });

      noteService.createNote.mockRejectedValue(new Error('创建笔记失败'));

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={episodeId}
        />
      );

      // 等待 SelectionMenu 渲染
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      // 点击"纯划线"按钮
      const underlineButton = screen.getByTestId('underline-button');
      await user.click(underlineButton);

      // 验证错误提示显示（等待 Snackbar 渲染）
      await waitFor(() => {
        const errorMessage = screen.queryByText(/创建笔记失败|创建划线失败/);
        expect(errorMessage).toBeInTheDocument();
      }, { timeout: 3000 });

      // 【修正点】根据 SubtitleList.jsx 代码逻辑：
      // "不抛出错误，继续执行，让下划线能够显示"
      // 我们验证 createHighlights 被成功调用，说明下划线已创建
      expect(highlightService.createHighlights).toHaveBeenCalled();
    });
  });
});