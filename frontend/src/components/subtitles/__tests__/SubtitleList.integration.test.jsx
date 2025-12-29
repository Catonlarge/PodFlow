import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubtitleList from '../SubtitleList';
import { useTextSelection } from '../../../hooks/useTextSelection';
import { getMockCues, getCuesByEpisodeId, subtitleService } from '../../../services/subtitleService';
import { highlightService } from '../../../services/highlightService';
import { noteService } from '../../../services/noteService';
import { aiService } from '../../../services/aiService';

// Mock subtitleService
vi.mock('../../../services/subtitleService', () => ({
  getMockCues: vi.fn(),
  getCuesByEpisodeId: vi.fn(),
  getEpisodeSegments: vi.fn(),
  triggerSegmentTranscription: vi.fn(),
  subtitleService: {
    getMockCues: vi.fn(),
    getCuesByEpisodeId: vi.fn(),
    getEpisodeSegments: vi.fn(),
    triggerSegmentTranscription: vi.fn(),
    restartTranscription: vi.fn(),
  },
}));

// Mock useTextSelection hook
vi.mock('../../../hooks/useTextSelection', () => ({
  useTextSelection: vi.fn(() => ({
    selectedText: null,
    selectionRange: null,
    affectedCues: [],
    clearSelection: vi.fn(),
  })),
}));

// Mock SelectionMenu
vi.mock('../SelectionMenu', () => ({
  default: ({ selectedText, anchorPosition, onQuery }) => {
    // 必须同时有 selectedText 和 anchorPosition 才显示
    if (!selectedText || !anchorPosition) return null;
    return (
      <div data-testid="selection-menu">
        <button
          data-testid="query-button"
          onClick={onQuery}
        >
          查询
        </button>
      </div>
    );
  },
}));

// Mock SubtitleRow
vi.mock('../SubtitleRow', () => ({
  default: ({ cue, showSpeaker, isHighlighted, progress, highlights, isSelected, selectionRange }) => {
    if (showSpeaker) {
      return <div data-testid={`speaker-${cue.speaker}`}>{cue.speaker}：</div>;
    }
    return (
      <div
        data-testid={`subtitle-${cue.id}`}
        data-highlighted={isHighlighted}
        data-progress={progress}
        data-highlights-count={highlights?.length || 0}
        data-selected={isSelected}
        data-selection-range={selectionRange ? 'true' : 'false'}
      >
        {cue.text}
      </div>
    );
  },
}));

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

// Mock aiService
vi.mock('../../../services/aiService', () => ({
  aiService: {
    queryAI: vi.fn(),
  },
}));

// Mock AICard
vi.mock('../AICard', () => ({
  default: ({ isLoading, responseData, queryText, onAddToNote, anchorPosition, queryId }) => {
    // 实际 AICard 组件会检查 anchorPosition，如果为 null 则不渲染
    // 在测试中，如果 anchorPosition 为 null，仍然渲染（测试环境）
    // 注意：SubtitleList 通过条件渲染控制是否显示 AICard，所以这里不需要检查 isVisible
    return (
      <div data-testid="ai-card">
        {isLoading && <div data-testid="ai-card-loading">Loading...</div>}
        {responseData && (
          <div data-testid="ai-card-content">
            <div data-testid="ai-card-type">{responseData.type}</div>
            {responseData.content && (
              <div data-testid="ai-card-content-data">
                {JSON.stringify(responseData.content)}
              </div>
            )}
          </div>
        )}
        {queryText && <div data-testid="ai-card-query-text">{queryText}</div>}
        {!isLoading && responseData && (
          <button
            data-testid="add-to-note-button"
            onClick={() => onAddToNote(responseData, queryId || 1)}
          >
            添加到笔记
          </button>
        )}
      </div>
    );
  },
}));

describe('SubtitleList AI 查询集成测试', () => {
  const mockCues = [
    { id: 1, start_time: 0.28, end_time: 2.22, speaker: 'Lenny', text: 'First subtitle' },
    { id: 2, start_time: 2.5, end_time: 5.8, speaker: 'Lenny', text: 'Second subtitle' },
    { id: 3, start_time: 6.0, end_time: 9.5, speaker: 'Guest', text: 'Third subtitle' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getMockCues.mockResolvedValue(mockCues);
    getCuesByEpisodeId.mockResolvedValue(mockCues);
    subtitleService.getEpisodeSegments.mockResolvedValue([]);
    subtitleService.triggerSegmentTranscription.mockResolvedValue({});
    highlightService.createHighlights.mockResolvedValue({
      success: true,
      highlight_ids: [1],
      highlight_group_id: null,
      created_at: '2025-01-01T00:00:00Z',
    });
    highlightService.getHighlightsByEpisode.mockResolvedValue([]);
    noteService.getNotesByEpisode.mockResolvedValue([]);
    noteService.createNote.mockResolvedValue({
      id: 1,
      created_at: '2025-01-01T00:00:00Z',
    });
  });

  describe('完整 AI 查询流程', () => {
    it('应该完成完整流程（划线 → 点击查询 → 显示卡片 → 添加到笔记）', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 5,
          selectedText: 'First',
        },
      ];

      // Mock window.getSelection（必须在组件渲染前设置）
      const mockRange = {
        getBoundingClientRect: vi.fn(() => ({
          left: 100,
          top: 100,
          right: 150,
          bottom: 120,
          width: 50,
          height: 20,
        })),
      };
      const mockSelection = {
        rangeCount: 1,
        getRangeAt: vi.fn(() => mockRange),
      };
      global.window.getSelection = vi.fn(() => mockSelection);

      // Mock 文本选择
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { 
          startCueId: 1,
          endCueId: 1,
          startOffset: 0, 
          endOffset: 5 
        },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });

      // Mock AI 查询响应
      aiService.queryAI.mockResolvedValue({
        query_id: 1,
        status: 'completed',
        response: {
          type: 'word',
          content: {
            phonetic: '/fɜːst/',
            definition: '第一；首先',
            explanation: '这是一个序数词，表示顺序中的第一个。',
          },
        },
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // Step 1: 验证 SelectionMenu 显示
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      // Step 2: 点击查询按钮
      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      // Step 3: 验证显示 AICard（Loading 状态）
      // 注意：优化后的代码会立即显示 AICard（在创建 Highlight 之前），提升用户体验
      await waitFor(() => {
        expect(screen.getByTestId('ai-card')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 验证 AICard 处于 Loading 状态（如果 API 调用很快，可能已经完成，所以使用 queryByTestId）
      // 注意：如果 API 调用立即返回，loading 状态可能已经结束
      const loadingIcon = screen.queryByTestId('ai-card-loading');
      if (loadingIcon) {
        expect(loadingIcon).toBeInTheDocument();
      } else {
        // 如果 loading 已经结束，验证 AICard 显示了结果
        expect(screen.getByTestId('ai-card-content')).toBeInTheDocument();
      }

      // Step 4: 验证创建 Highlight（在 AICard 显示后）
      await waitFor(() => {
        expect(highlightService.createHighlights).toHaveBeenCalled();
      }, { timeout: 3000 });

      // 验证调用参数
      expect(highlightService.createHighlights).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            cue_id: 1,
            start_offset: 0,
            end_offset: 5,
            highlighted_text: 'First',
          }),
        ]),
        null
      );

      // Step 5: 验证调用 AI 查询 API
      await waitFor(() => {
        expect(aiService.queryAI).toHaveBeenCalledWith(1);
      });

      // Step 6: 验证显示查询结果
      await waitFor(() => {
        expect(screen.queryByTestId('ai-card-loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('ai-card-content')).toBeInTheDocument();
        expect(screen.getByTestId('ai-card-type')).toHaveTextContent('word');
      });

      // Step 7: 点击"添加到笔记"按钮
      const addToNoteButton = screen.getByTestId('add-to-note-button');
      await user.click(addToNoteButton);

      // Step 8: 验证创建 Note
      await waitFor(() => {
        expect(noteService.createNote).toHaveBeenCalledWith(
          1,
          1,
          'ai_card',
          expect.stringContaining('第一；首先'),
          1
        );
      });

      // Step 9: 验证 AICard 关闭
      await waitFor(() => {
        expect(screen.queryByTestId('ai-card')).not.toBeInTheDocument();
      });
    });

    it('应该在创建笔记后调用 onNoteCreate 回调', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockOnNoteCreate = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 5,
          selectedText: 'First',
        },
      ];

      // Mock window.getSelection（必须在组件渲染前设置）
      const mockRange = {
        getBoundingClientRect: vi.fn(() => ({
          left: 100,
          top: 100,
          right: 150,
          bottom: 120,
          width: 50,
          height: 20,
        })),
      };
      const mockSelection = {
        rangeCount: 1,
        getRangeAt: vi.fn(() => mockRange),
      };
      global.window.getSelection = vi.fn(() => mockSelection);

      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { 
          startCueId: 1,
          endCueId: 1,
          startOffset: 0, 
          endOffset: 5 
        },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });

      highlightService.createHighlights.mockResolvedValue({
        highlight_ids: [1],
        highlight_group_id: null,
      });

      noteService.createNote.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01T00:00:00Z',
      });

      aiService.queryAI.mockResolvedValue({
        query_id: 1,
        status: 'completed',
        response: {
          type: 'word',
          content: {
            phonetic: '/fɜːst/',
            definition: '第一；首先',
            explanation: '这是一个序数词，表示顺序中的第一个。',
          },
        },
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
          onNoteCreate={mockOnNoteCreate}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      await waitFor(() => {
        expect(screen.getByTestId('ai-card')).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(screen.queryByTestId('ai-card-loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('add-to-note-button')).toBeInTheDocument();
      }, { timeout: 3000 });

      const addToNoteButton = screen.getByTestId('add-to-note-button');
      await user.click(addToNoteButton);

      await waitFor(() => {
        expect(noteService.createNote).toHaveBeenCalled();
        expect(mockOnNoteCreate).toHaveBeenCalledTimes(1);
      });
    });

    it('应该处理跨 cue 划线的 AI 查询', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 6,
          endOffset: 13,
          selectedText: 'subtitle',
        },
        {
          cue: mockCues[1],
          startOffset: 0,
          endOffset: 6,
          selectedText: 'Second',
        },
      ];

      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'subtitle Second',
        selectionRange: { startOffset: 6, endOffset: 6 },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });
      
      // Mock window.getSelection
      global.window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        getRangeAt: vi.fn(() => ({
          getBoundingClientRect: vi.fn(() => ({
            left: 100,
            top: 100,
            right: 200,
            bottom: 120,
            width: 100,
            height: 20,
          })),
        })),
      }));

      highlightService.createHighlights.mockResolvedValue({
        success: true,
        highlight_ids: [1, 2],
        highlight_group_id: 'group-123',
        created_at: '2025-01-01T00:00:00Z',
      });

      aiService.queryAI.mockResolvedValue({
        query_id: 1,
        status: 'completed',
        response: {
          type: 'phrase',
          content: {
            phonetic: '/sʌbtaɪtl sekənd/',
            definition: '副标题第二',
            explanation: '这是一个短语，表示第二个副标题。',
          },
        },
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      // 验证创建了多个 Highlight（跨 cue）
      await waitFor(() => {
        expect(highlightService.createHighlights).toHaveBeenCalledWith(
          1,
          expect.arrayContaining([
            expect.objectContaining({ cue_id: 1 }),
            expect.objectContaining({ cue_id: 2 }),
          ]),
          expect.any(String) // highlight_group_id
        );
      });
    });
  });

  describe('错误场景', () => {
    it('应该处理网络错误', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 5,
          selectedText: 'First',
        },
      ];

      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { startOffset: 0, endOffset: 5 },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });
      
      // Mock window.getSelection
      global.window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        getRangeAt: vi.fn(() => ({
          getBoundingClientRect: vi.fn(() => ({
            left: 100,
            top: 100,
            right: 150,
            bottom: 120,
            width: 50,
            height: 20,
          })),
        })),
      }));

      // Mock 网络错误
      aiService.queryAI.mockRejectedValue({
        response: {
          data: {
            detail: '网络连接失败',
          },
        },
        message: 'Network Error',
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      // 等待 createHighlights 和 queryAI 被调用
      await waitFor(() => {
        expect(highlightService.createHighlights).toHaveBeenCalled();
        expect(aiService.queryAI).toHaveBeenCalled();
      }, { timeout: 3000 });

      // 验证错误提示显示（Snackbar 中的 Alert 有 alert role）
      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/网络连接失败|AI 查询失败/i);
      }, { timeout: 3000 });

      // 验证 AICard 关闭
      await waitFor(() => {
        expect(screen.queryByTestId('ai-card')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('应该处理 API 错误', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 5,
          selectedText: 'First',
        },
      ];

      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { startOffset: 0, endOffset: 5 },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });
      
      // Mock window.getSelection
      global.window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        getRangeAt: vi.fn(() => ({
          getBoundingClientRect: vi.fn(() => ({
            left: 100,
            top: 100,
            right: 150,
            bottom: 120,
            width: 50,
            height: 20,
          })),
        })),
      }));

      // Mock API 错误
      aiService.queryAI.mockRejectedValue({
        response: {
          data: {
            detail: 'AI 查询失败：API 调用超时',
          },
        },
        message: 'Request timeout',
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      // 等待 createHighlights 和 queryAI 被调用
      await waitFor(() => {
        expect(highlightService.createHighlights).toHaveBeenCalled();
        expect(aiService.queryAI).toHaveBeenCalled();
      }, { timeout: 3000 });

      // 验证错误提示显示（Snackbar 中的 Alert 有 alert role）
      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/AI 查询失败/i);
      }, { timeout: 3000 });
    });
  });

  describe('笔记内容格式化', () => {
    it('应该正确格式化 word 类型笔记内容', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 5,
          selectedText: 'First',
        },
      ];

      // Mock window.getSelection（必须在组件渲染前设置）
      const mockRange = {
        getBoundingClientRect: vi.fn(() => ({
          left: 100,
          top: 100,
          right: 150,
          bottom: 120,
          width: 50,
          height: 20,
        })),
      };
      const mockSelection = {
        rangeCount: 1,
        getRangeAt: vi.fn(() => mockRange),
      };
      global.window.getSelection = vi.fn(() => mockSelection);

      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { 
          startCueId: 1,
          endCueId: 1,
          startOffset: 0, 
          endOffset: 5 
        },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });

      aiService.queryAI.mockResolvedValue({
        query_id: 1,
        status: 'completed',
        response: {
          type: 'word',
          content: {
            phonetic: '/fɜːst/',
            definition: '第一；首先',
            explanation: '这是一个序数词，表示顺序中的第一个。',
          },
        },
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待 SelectionMenu 显示
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      // 等待 AICard 显示并加载完成
      await waitFor(() => {
        expect(screen.getByTestId('ai-card')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.queryByTestId('ai-card-loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('add-to-note-button')).toBeInTheDocument();
      });

      const addToNoteButton = screen.getByTestId('add-to-note-button');
      await user.click(addToNoteButton);

      // 验证笔记内容格式化正确
      await waitFor(() => {
        expect(noteService.createNote).toHaveBeenCalledWith(
          1,
          1,
          'ai_card',
          expect.stringMatching(/第一；首先[\s\S]*这是一个序数词/),
          1
        );
      });
    });

    it('应该正确格式化 sentence 类型笔记内容', async () => {
      const user = userEvent.setup();
      const mockClearSelection = vi.fn();
      const mockAffectedCues = [
        {
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 13,
          selectedText: 'First subtitle',
        },
      ];

      // Mock window.getSelection（必须在组件渲染前设置）
      const mockRange = {
        getBoundingClientRect: vi.fn(() => ({
          left: 100,
          top: 100,
          right: 200,
          bottom: 120,
          width: 100,
          height: 20,
        })),
      };
      const mockSelection = {
        rangeCount: 1,
        getRangeAt: vi.fn(() => mockRange),
      };
      global.window.getSelection = vi.fn(() => mockSelection);

      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First subtitle',
        selectionRange: { 
          startCueId: 1,
          endCueId: 1,
          startOffset: 0, 
          endOffset: 13 
        },
        affectedCues: mockAffectedCues,
        clearSelection: mockClearSelection,
      });

      aiService.queryAI.mockResolvedValue({
        query_id: 1,
        status: 'completed',
        response: {
          type: 'sentence',
          content: {
            translation: '第一个副标题',
            highlight_vocabulary: [
              { term: 'First', definition: '第一' },
              { term: 'subtitle', definition: '副标题' },
            ],
          },
        },
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待 SelectionMenu 显示
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      const queryButton = screen.getByTestId('query-button');
      await user.click(queryButton);

      // 等待 AICard 显示并加载完成
      await waitFor(() => {
        expect(screen.getByTestId('ai-card')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.queryByTestId('ai-card-loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('add-to-note-button')).toBeInTheDocument();
      });

      const addToNoteButton = screen.getByTestId('add-to-note-button');
      await user.click(addToNoteButton);

      // 验证笔记内容格式化正确（包含翻译和难点词汇）
      await waitFor(() => {
        const createNoteCall = noteService.createNote.mock.calls[0];
        expect(createNoteCall[2]).toBe('ai_card');
        expect(createNoteCall[3]).toContain('第一个副标题');
        expect(createNoteCall[3]).toContain('难点词汇');
        expect(createNoteCall[3]).toContain('First');
        expect(createNoteCall[3]).toContain('subtitle');
      });
    });
  });
});

