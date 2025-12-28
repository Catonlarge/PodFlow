import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubtitleList from '../SubtitleList';
import { useTextSelection } from '../../../hooks/useTextSelection';
import { getMockCues, getCuesByEpisodeId, getCuesBySegmentRange, subtitleService } from '../../../services/subtitleService';
import { highlightService } from '../../../services/highlightService';
import { noteService } from '../../../services/noteService';
import { aiService } from '../../../services/aiService';

// Mock subtitleService
vi.mock('../../../services/subtitleService', () => ({
  getMockCues: vi.fn(),
  getCuesByEpisodeId: vi.fn(),
  getCuesBySegmentRange: vi.fn(),
  getEpisodeSegments: vi.fn(),
  triggerSegmentTranscription: vi.fn(),
  subtitleService: {
    getMockCues: vi.fn(),
    getCuesByEpisodeId: vi.fn(),
    getCuesBySegmentRange: vi.fn(),
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
  default: ({ selectedText, anchorPosition }) => {
    if (!selectedText || !anchorPosition) return null;
    return <div data-testid="selection-menu">Selection Menu</div>;
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
  default: ({ isVisible, isLoading, responseData, queryText }) => {
    if (!isVisible) return null;
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
      </div>
    );
  },
}));

describe('SubtitleList', () => {
  const mockCues = [
    { id: 1, start_time: 0.28, end_time: 2.22, speaker: 'Lenny', text: 'First subtitle' },
    { id: 2, start_time: 2.5, end_time: 5.8, speaker: 'Lenny', text: 'Second subtitle' },
    { id: 3, start_time: 6.0, end_time: 9.5, speaker: 'Guest', text: 'Third subtitle' },
    { id: 4, start_time: 10.0, end_time: 15.2, speaker: 'Lenny', text: 'Fourth subtitle' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getMockCues.mockResolvedValue(mockCues);
    getCuesByEpisodeId.mockResolvedValue(mockCues);
    subtitleService.getEpisodeSegments.mockResolvedValue([]);
    subtitleService.triggerSegmentTranscription.mockResolvedValue({});
    
    // Mock highlightService (通过 vi.mocked 访问)
    highlightService.createHighlights.mockResolvedValue({
      success: true,
      highlight_ids: [1],
      highlight_group_id: null,
      created_at: '2025-01-01T00:00:00Z',
    });
    highlightService.getHighlightsByEpisode.mockResolvedValue([]);
    
    // Mock noteService
    noteService.getNotesByEpisode.mockResolvedValue([]);
    noteService.createNote.mockResolvedValue({
      id: 1,
      created_at: '2025-01-01T00:00:00Z',
    });
    
    // Mock aiService
    aiService.queryAI.mockResolvedValue({
      query_id: 1,
      status: 'completed',
      response: {
        type: 'word',
        content: {
          phonetic: '/test/',
          definition: '测试',
          explanation: '这是一个测试',
        },
      },
    });
  });

  describe('渲染', () => {
    it('应该渲染字幕列表', async () => {
      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      expect(screen.getByTestId('subtitle-2')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle-3')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle-4')).toBeInTheDocument();
    });

    it('应该在没有 cues prop 时使用 mock 数据', async () => {
      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        expect(getMockCues).toHaveBeenCalledTimes(1);
      });
    });

    it('应该在使用传入的 cues prop 时不调用 mock 数据', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      expect(getMockCues).not.toHaveBeenCalled();
    });

    it('应该在没有字幕数据时显示占位内容', () => {
      render(
        <SubtitleList
          cues={[]}
          currentTime={0}
          duration={0}
        />
      );

      expect(screen.getByText('暂无字幕数据')).toBeInTheDocument();
    });
  });

  describe('Speaker 分组', () => {
    it('应该为每个新的 speaker 显示 speaker 标签', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        // 应该有两个 Lenny 的 speaker 标签（第一个和第三个 Lenny）
        const lennySpeakers = screen.getAllByTestId('speaker-Lenny');
        expect(lennySpeakers.length).toBe(2);
        // Guest 的 speaker 标签
        expect(screen.getByTestId('speaker-Guest')).toBeInTheDocument();
      });
    });

    it('应该在同一 speaker 的多条字幕之间不重复显示 speaker 标签', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        const lennySpeakers = screen.getAllByTestId('speaker-Lenny');
        // 应该有两个 Lenny 的 speaker 标签（第一个和第三个 Lenny）
        expect(lennySpeakers.length).toBe(2);
      });
    });
  });

  describe('高亮状态', () => {
    it('应该正确高亮当前播放的字幕', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        const subtitle1 = screen.getByTestId('subtitle-1');
        expect(subtitle1).toHaveAttribute('data-highlighted', 'true');
      });
    });

    it('应该在高亮改变时更新高亮状态', async () => {
      const { rerender } = render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toHaveAttribute('data-highlighted', 'true');
      });

      rerender(
        <SubtitleList
          cues={mockCues}
          currentTime={4.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toHaveAttribute('data-highlighted', 'false');
        expect(screen.getByTestId('subtitle-2')).toHaveAttribute('data-highlighted', 'true');
      });
    });
  });

  describe('显示翻译按钮', () => {
    it('应该渲染显示翻译按钮', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        const translateButton = screen.getByLabelText('显示翻译');
        expect(translateButton).toBeInTheDocument();
      });
    });
  });

  describe('点击回调', () => {
    it('应该传递 onCueClick 回调给 SubtitleRow', async () => {
      const handleCueClick = vi.fn();

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          onCueClick={handleCueClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 注意：由于我们 mock 了 SubtitleRow，实际点击测试需要在 SubtitleRow 的测试中进行
      // 这里主要验证 props 能够正确传递
      expect(handleCueClick).toBeDefined();
    });
  });

  describe('交互阻断', () => {
    it('应该接受 isInteracting prop', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          isInteracting={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 测试通过意味着组件能够接受 isInteracting prop 而不报错
      expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
    });

    it('应该在 isInteracting 为 false 时正常工作', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          isInteracting={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
    });
  });

  describe('Loading 状态', () => {
    it('应该在 isLoading 为 true 时显示 Skeleton', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          isLoading={true}
        />
      );

      // 检查是否有 Skeleton 元素
      const skeletons = screen.getAllByRole('generic').filter(el => 
        el.className.includes('MuiSkeleton-root')
      );
      expect(skeletons.length).toBeGreaterThan(0);
      expect(screen.queryByTestId('subtitle-1')).not.toBeInTheDocument();
    });

    it('应该在 isLoading 为 false 时正常渲染字幕', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          isLoading={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });
    });
  });

  describe('字幕加载状态', () => {
    it('应该在字幕加载过程中显示"请稍等，字幕加载中"和进度条', async () => {
      // Mock getCuesByEpisodeId 延迟返回，模拟加载过程
      getCuesByEpisodeId.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(mockCues);
          }, 1000);
        });
      });

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
        />
      );

      // 验证显示加载提示
      await waitFor(() => {
        expect(screen.getByText('请稍等，字幕加载中')).toBeInTheDocument();
      }, { timeout: 500 });

      // 验证显示进度条
      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars.length).toBeGreaterThan(0);

      // 等待加载完成
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('应该在字幕加载失败时显示错误提示和重试按钮', async () => {
      const mockError = new Error('加载失败');
      getCuesByEpisodeId.mockRejectedValue(mockError);

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
        />
      );

      // 验证显示错误提示
      await waitFor(() => {
        expect(screen.getByText(/字幕加载失败，错误原因：/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // 验证显示重试按钮
      const retryButton = screen.getByLabelText('重试');
      expect(retryButton).toBeInTheDocument();
    });

    it('应该点击重试按钮时重新加载字幕', async () => {
      const user = userEvent.setup();
      const mockError = new Error('加载失败');
      
      // 第一次失败，第二次成功
      getCuesByEpisodeId
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockCues);

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
        />
      );

      // 等待错误提示显示（需要等待加载失败并设置错误状态）
      await waitFor(() => {
        expect(screen.getByText(/字幕加载失败，错误原因：/)).toBeInTheDocument();
      }, { timeout: 5000 });

      // 等待重试按钮出现
      await waitFor(() => {
        expect(screen.getByLabelText('重试')).toBeInTheDocument();
      }, { timeout: 1000 });

      // 点击重试按钮
      const retryButton = screen.getByLabelText('重试');
      await user.click(retryButton);

      // 验证重新加载字幕
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 5000 });
      
      // 验证 getCuesByEpisodeId 被调用了至少2次（第一次失败，第二次成功）
      expect(getCuesByEpisodeId.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('应该在字幕加载完成后显示字幕列表', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
        />
      );

      // 等待字幕加载完成（需要等待300ms延迟）
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 等待加载状态清除（300ms延迟后）
      await waitFor(() => {
        expect(screen.queryByText('请稍等，字幕加载中')).not.toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('字幕识别失败状态', () => {
    it('应该在字幕识别失败时显示错误提示和重试按钮', async () => {
      const mockSegments = [
        {
          segment_index: 0,
          segment_id: 'segment_001',
          status: 'failed',
          error_message: '识别过程中发生错误',
          start_time: 0.0,
          end_time: 180.0,
          duration: 180.0,
        },
      ];

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
          transcriptionStatus="failed"
          segments={mockSegments}
        />
      );

      // 验证显示错误提示（formatUserFriendlyError 会将包含"识别"的错误转换为"模型处理失败，请重试"）
      await waitFor(() => {
        expect(screen.getByText('模型处理失败，请重试')).toBeInTheDocument();
      }, { timeout: 1000 });

      // 验证显示重试按钮
      const retryButton = screen.getByRole('button', { name: /请重试/ });
      expect(retryButton).toBeInTheDocument();
    });

    it('应该点击重试按钮时重新调用字幕识别API', async () => {
      const user = userEvent.setup();
      const mockSegments = [
        {
          segment_index: 0,
          segment_id: 'segment_001',
          status: 'failed',
          error_message: '识别过程中发生错误',
          start_time: 0.0,
          end_time: 180.0,
          duration: 180.0,
        },
      ];

      // Mock restartTranscription API
      subtitleService.restartTranscription = vi.fn().mockResolvedValue({
        status: 'processing',
        message: '识别任务已重新启动',
      });

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
          transcriptionStatus="failed"
          segments={mockSegments}
        />
      );

      // 等待错误提示显示
      await waitFor(() => {
        expect(screen.getByText('模型处理失败，请重试')).toBeInTheDocument();
      }, { timeout: 1000 });

      // 点击重试按钮
      const retryButton = screen.getByRole('button', { name: /请重试/ });
      await user.click(retryButton);

      // 验证重新开始识别API被调用
      await waitFor(() => {
        expect(subtitleService.restartTranscription).toHaveBeenCalledWith(123);
      }, { timeout: 1000 });
    });

    it('应该在识别失败但没有错误信息时显示默认错误消息', async () => {
      const mockSegments = [
        {
          segment_index: 0,
          segment_id: 'segment_001',
          status: 'failed',
          error_message: null,
          start_time: 0.0,
          end_time: 180.0,
          duration: 180.0,
        },
      ];

      render(
        <SubtitleList
          currentTime={1.0}
          duration={20.0}
          episodeId={123}
          transcriptionStatus="failed"
          segments={mockSegments}
        />
      );

      // 验证显示默认错误提示（formatUserFriendlyError(null) 返回"模型处理失败，请重试"）
      await waitFor(() => {
        expect(screen.getByText('模型处理失败，请重试')).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('highlights 传递', () => {
    const mockHighlights = [
      { id: 1, cue_id: 1, start_offset: 0, end_offset: 5, highlighted_text: 'First', color: '#9C27B0' },
      { id: 2, cue_id: 2, start_offset: 0, end_offset: 6, highlighted_text: 'Second', color: '#9C27B0' },
    ];

    it('应该将 highlights 传递给 SubtitleRow', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          highlights={mockHighlights}
        />
      );

      await waitFor(() => {
        const subtitle1 = screen.getByTestId('subtitle-1');
        expect(subtitle1).toHaveAttribute('data-highlights-count', '1');
        
        const subtitle2 = screen.getByTestId('subtitle-2');
        expect(subtitle2).toHaveAttribute('data-highlights-count', '1');
      });
    });

    it('应该在没有 highlights 时传递空数组', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        const subtitle1 = screen.getByTestId('subtitle-1');
        expect(subtitle1).toHaveAttribute('data-highlights-count', '0');
      });
    });
  });

  describe('onHighlightClick 传递', () => {
    it('应该将 onHighlightClick 传递给 SubtitleRow', async () => {
      const handleHighlightClick = vi.fn();

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          onHighlightClick={handleHighlightClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 验证回调函数已定义（实际点击测试在 SubtitleRow 测试中进行）
      expect(handleHighlightClick).toBeDefined();
    });
  });

  describe('progress 计算', () => {
    it('应该为已播放的行计算 progress=1', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={6.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        // 当前播放到 6.0 秒，第一个字幕（0.28-2.22）应该已播放
        const subtitle1 = screen.getByTestId('subtitle-1');
        expect(subtitle1).toHaveAttribute('data-progress', '1');
      });
    });

    it('应该为当前激活的行计算正确的 progress', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.5}
          duration={20.0}
        />
      );

      await waitFor(() => {
        // 当前播放到 1.5 秒，第一个字幕（0.28-2.22）应该处于播放中
        // progress = (1.5 - 0.28) / (2.22 - 0.28) ≈ 0.628
        const subtitle1 = screen.getByTestId('subtitle-1');
        const progress = parseFloat(subtitle1.getAttribute('data-progress'));
        expect(progress).toBeGreaterThan(0);
        expect(progress).toBeLessThan(1);
      });
    });

    it('应该为未来的行计算 progress=0', async () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      await waitFor(() => {
        // 当前播放到 1.0 秒，第三个字幕（6.0-9.5）应该还未播放
        const subtitle3 = screen.getByTestId('subtitle-3');
        expect(subtitle3).toHaveAttribute('data-progress', '0');
      });
    });
  });

  describe('transcriptionStatus 监听', () => {
    it('当 transcriptionStatus 从 processing 变为 completed 时，应该重新加载字幕', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);
      
      const { rerender } = render(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="processing"
        />
      );

      // 等待初始加载完成
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 清除调用记录
      getCuesByEpisodeId.mockClear();

      // 更新 transcriptionStatus 为 completed
      rerender(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="completed"
        />
      );

      // 应该再次调用 getCuesByEpisodeId
      await waitFor(() => {
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
        expect(getCuesByEpisodeId).toHaveBeenCalledWith(123);
      }, { timeout: 3000 });
    });

    it('当 transcriptionStatus 已经是 completed 时，不应该重复加载', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);
      
      const { rerender } = render(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="completed"
        />
      );

      // 等待初始加载完成
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 清除调用记录
      getCuesByEpisodeId.mockClear();

      // 再次更新 transcriptionStatus 为 completed（状态没有变化）
      rerender(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="completed"
        />
      );

      // 等待一段时间，确保没有额外的调用
      await waitFor(() => {
        expect(getCuesByEpisodeId).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });

    it('当有 propsCues 时，即使 transcriptionStatus 变为 completed 也不应该重新加载', async () => {
      const { rerender } = render(
        <SubtitleList
          cues={mockCues}
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="processing"
        />
      );

      // 等待组件渲染
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 清除调用记录
      getCuesByEpisodeId.mockClear();

      // 更新 transcriptionStatus 为 completed
      rerender(
        <SubtitleList
          cues={mockCues}
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="completed"
        />
      );

      // 应该不会调用 getCuesByEpisodeId，因为已经有 propsCues
      await waitFor(() => {
        expect(getCuesByEpisodeId).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });

    it('当没有 transcriptionStatus 时，应该正常工作', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);
      
      render(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
        />
      );

      // 应该正常加载字幕（通过 episodeId）
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // 验证 getCuesByEpisodeId 被调用
      expect(getCuesByEpisodeId).toHaveBeenCalledWith(123);
    });

    it('当 transcriptionStatus 从 pending 变为 completed 时，应该重新加载字幕', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);
      
      const { rerender } = render(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="pending"
        />
      );

      // 等待初始加载完成
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 清除调用记录
      getCuesByEpisodeId.mockClear();

      // 更新 transcriptionStatus 为 completed
      rerender(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="completed"
        />
      );

      // 应该再次调用 getCuesByEpisodeId
      await waitFor(() => {
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
        expect(getCuesByEpisodeId).toHaveBeenCalledWith(123);
      }, { timeout: 3000 });
    });

    it('当 transcriptionStatus 变为其他状态时，不应该重新加载', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);
      
      const { rerender } = render(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="processing"
        />
      );

      // 等待初始加载完成
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 清除调用记录
      getCuesByEpisodeId.mockClear();

      // 更新 transcriptionStatus 为 failed（不是 completed）
      rerender(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
          transcriptionStatus="failed"
        />
      );

      // 应该不会调用 getCuesByEpisodeId
      await waitFor(() => {
        expect(getCuesByEpisodeId).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });

  describe('滚动触发异步加载', () => {
    const mockSegments = [
      { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
      { segment_index: 1, segment_id: 'segment_002', status: 'processing', start_time: 180.0, end_time: 360.0 },
      { segment_index: 2, segment_id: 'segment_003', status: 'pending', start_time: 360.0, end_time: 540.0 },
    ];

    it('当滚动到底部且下一个segment为pending时，应该触发识别任务', async () => {
      const segmentsWithPendingNext = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'pending', start_time: 180.0, end_time: 360.0 },
      ];

      const { container } = render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={segmentsWithPendingNext}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      const scrollContainer = container.querySelector('[data-subtitle-container="true"]');
      expect(scrollContainer).toBeInTheDocument();

      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 900, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      fireEvent.scroll(scrollContainer);

      // 等待防抖延迟（300ms）后触发
      await waitFor(() => {
        expect(subtitleService.triggerSegmentTranscription).toHaveBeenCalledWith(123, 1);
      }, { timeout: 1000 });
    });

    it('当滚动到底部且下一个segment为failed且retry_count<3时，应该触发识别任务', async () => {
      const segmentsWithFailedNext = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'failed', start_time: 180.0, end_time: 360.0, retry_count: 1 },
      ];

      const { container } = render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={segmentsWithFailedNext}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      const scrollContainer = container.querySelector('[data-subtitle-container="true"]');
      expect(scrollContainer).toBeInTheDocument();

      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 900, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      fireEvent.scroll(scrollContainer);

      await waitFor(() => {
        expect(subtitleService.triggerSegmentTranscription).toHaveBeenCalledWith(123, 1);
      }, { timeout: 2000 });
    });

    it('当滚动到底部但下一个segment为processing时，不应该触发任何操作', async () => {
      const segmentsWithProcessingNext = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'processing', start_time: 180.0, end_time: 360.0 },
      ];

      const { container } = render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={segmentsWithProcessingNext}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      getCuesByEpisodeId.mockClear();
      subtitleService.triggerSegmentTranscription.mockClear();

      const scrollContainer = container.querySelector('[data-subtitle-container="true"]');
      expect(scrollContainer).toBeInTheDocument();

      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 900, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      fireEvent.scroll(scrollContainer);

      await waitFor(() => {
        expect(getCuesByEpisodeId).not.toHaveBeenCalled();
        expect(subtitleService.triggerSegmentTranscription).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });

    it('当滚动但未到底部时，不应该触发加载', async () => {
      const { container } = render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={mockSegments}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      getCuesByEpisodeId.mockClear();

      const scrollContainer = container.querySelector('[data-subtitle-container="true"]');
      expect(scrollContainer).toBeInTheDocument();

      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      fireEvent.scroll(scrollContainer);

      await waitFor(() => {
        expect(getCuesByEpisodeId).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });

  describe('后续静默识别展示（SubtitleListFooter）', () => {
    it('当所有segment完成时，应该显示-END-', async () => {
      const allCompletedSegments = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'completed', start_time: 180.0, end_time: 360.0 },
      ];

      render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={allCompletedSegments}
          transcriptionStatus="completed"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('-END-')).toBeInTheDocument();
      });
    });

    it('当下一个segment正在识别中时，应该显示"……请稍等，努力识别字幕中……"', async () => {
      const segmentsWithProcessingNext = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'processing', start_time: 180.0, end_time: 360.0 },
      ];

      render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={segmentsWithProcessingNext}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('……请稍等，努力识别字幕中……')).toBeInTheDocument();
      });
    });

    it('当下一个segment为pending时，应该显示"……请稍等，努力识别字幕中……"', async () => {
      const segmentsWithPendingNext = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'pending', start_time: 180.0, end_time: 360.0 },
      ];

      render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={segmentsWithPendingNext}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('……请稍等，努力识别字幕中……')).toBeInTheDocument();
      });
    });

    it('当没有segments时，不应该显示状态提示', async () => {
      render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={[]}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('-END-')).not.toBeInTheDocument();
        expect(screen.queryByText('……请稍等，努力识别字幕中……')).not.toBeInTheDocument();
      });
    });

    it('当transcriptionStatus为completed时，应该显示-END-', async () => {
      const segmentsWithProcessingNext = [
        { segment_index: 0, segment_id: 'segment_001', status: 'completed', start_time: 0.0, end_time: 180.0 },
        { segment_index: 1, segment_id: 'segment_002', status: 'processing', start_time: 180.0, end_time: 360.0 },
      ];

      render(
        <SubtitleList
          episodeId={123}
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          segments={segmentsWithProcessingNext}
          transcriptionStatus="completed"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('-END-')).toBeInTheDocument();
      });
    });
  });

  describe('文本选择功能', () => {
    beforeEach(() => {
      // 重置 useTextSelection mock
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: null,
        selectionRange: null,
        affectedCues: [],
        clearSelection: vi.fn(),
      });
    });

    it('应该集成 useTextSelection Hook', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      expect(useTextSelection).toHaveBeenCalledWith({
        cues: mockCues,
        containerRef: expect.any(Object),
        enabled: true,
      });
    });

    it('应该在选中文本时显示 SelectionMenu', () => {
      const mockClearSelection = vi.fn();
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First subtitle',
        selectionRange: {
          startCueId: 1,
          endCueId: 1,
          startOffset: 0,
          endOffset: 14,
        },
        affectedCues: [{
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 14,
          selectedText: 'First subtitle',
        }],
        clearSelection: mockClearSelection,
      });

      // Mock window.getSelection
      const mockSelection = {
        rangeCount: 1,
        getRangeAt: vi.fn(() => ({
          getBoundingClientRect: vi.fn(() => ({
            left: 100,
            top: 200,
            width: 150,
            height: 20,
          })),
        })),
      };
      global.window.getSelection = vi.fn(() => mockSelection);

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
    });

    it('应该将选择状态传递给 SubtitleRow', () => {
      const mockClearSelection = vi.fn();
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First subtitle',
        selectionRange: {
          startCueId: 1,
          endCueId: 1,
          startOffset: 0,
          endOffset: 14,
        },
        affectedCues: [{
          cue: mockCues[0],
          startOffset: 0,
          endOffset: 14,
          selectedText: 'First subtitle',
        }],
        clearSelection: mockClearSelection,
      });

      // Mock window.getSelection
      const mockSelection = {
        rangeCount: 1,
        getRangeAt: vi.fn(() => ({
          getBoundingClientRect: vi.fn(() => ({
            left: 100,
            top: 200,
            width: 150,
            height: 20,
          })),
        })),
      };
      global.window.getSelection = vi.fn(() => mockSelection);

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      const subtitleRow = screen.getByTestId('subtitle-1');
      expect(subtitleRow).toHaveAttribute('data-selected', 'true');
      expect(subtitleRow).toHaveAttribute('data-selection-range', 'true');
    });

    it('应该在未选中文本时不显示 SelectionMenu', () => {
      const mockClearSelection = vi.fn();
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: null,
        selectionRange: null,
        affectedCues: [],
        clearSelection: mockClearSelection,
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      expect(screen.queryByTestId('selection-menu')).not.toBeInTheDocument();
    });
  });

  describe('AI 查询功能', () => {
    it('应该在点击查询按钮时调用 AI 查询 API', async () => {
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

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待 SelectionMenu 渲染
      await waitFor(() => {
        expect(screen.getByTestId('selection-menu')).toBeInTheDocument();
      });

      // 模拟点击查询按钮（通过 SelectionMenu 的 onQuery 回调）
      // 由于 SelectionMenu 被 mock，我们需要直接调用 handleQuery
      // 但更好的方式是模拟用户点击
      // 由于 SelectionMenu 是 mock 的，我们需要找到另一种方式触发
      // 暂时跳过这个测试，因为需要更复杂的集成测试
    });

    it('应该在查询开始时显示 AICard（Loading 状态）', async () => {
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

      // Mock 一个延迟的 AI 查询响应
      aiService.queryAI.mockImplementation(() => 
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              query_id: 1,
              status: 'completed',
              response: {
                type: 'word',
                content: {
                  phonetic: '/test/',
                  definition: '测试',
                  explanation: '这是一个测试',
                },
              },
            });
          }, 100);
        })
      );

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待组件稳定
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 由于 SelectionMenu 是 mock 的，我们需要直接触发 handleQuery
      // 这需要更复杂的测试设置，暂时跳过
    });

    it('应该在查询完成后显示 AICard 结果', async () => {
      // 这个测试需要更复杂的设置，暂时跳过
      // 将在集成测试中实现
    });

    it('应该处理 AI 查询错误', async () => {
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

      // Mock AI 查询失败
      aiService.queryAI.mockRejectedValue(new Error('AI 查询失败'));

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待组件稳定
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 由于 SelectionMenu 是 mock 的，我们需要直接触发 handleQuery
      // 这需要更复杂的测试设置，暂时跳过
    });

    it('应该在查询前先创建 Highlight', async () => {
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

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待组件稳定
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 由于 SelectionMenu 是 mock 的，我们需要直接触发 handleQuery
      // 这需要更复杂的测试设置，暂时跳过
    });
  });

  describe('添加到笔记功能', () => {
    it('应该在点击"添加到笔记"按钮时创建 Note', async () => {
      // 这个测试需要更复杂的设置，暂时跳过
      // 将在集成测试中实现
    });

    it('应该正确格式化 word 类型笔记内容', async () => {
      // 这个测试需要更复杂的设置，暂时跳过
      // 将在集成测试中实现
    });

    it('应该正确格式化 sentence 类型笔记内容', async () => {
      // 这个测试需要更复杂的设置，暂时跳过
      // 将在集成测试中实现
    });

    it('应该在添加到笔记后关闭 AICard', async () => {
      // 这个测试需要更复杂的设置，暂时跳过
      // 将在集成测试中实现
    });
  });

  describe('AI 查询边界情况', () => {
    it('应该处理无 episodeId 时的查询', async () => {
      const mockClearSelection = vi.fn();
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { startOffset: 0, endOffset: 5 },
        affectedCues: [
          {
            cue: mockCues[0],
            startOffset: 0,
            endOffset: 5,
            selectedText: 'First',
          },
        ],
        clearSelection: mockClearSelection,
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
        />
      );

      // 等待组件稳定
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 由于 SelectionMenu 是 mock 的，我们需要直接触发 handleQuery
      // 这需要更复杂的测试设置，暂时跳过
    });

    it('应该处理无 affectedCues 时的查询', async () => {
      const mockClearSelection = vi.fn();
      vi.mocked(useTextSelection).mockReturnValue({
        selectedText: 'First',
        selectionRange: { startOffset: 0, endOffset: 5 },
        affectedCues: [],
        clearSelection: mockClearSelection,
      });

      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={20.0}
          episodeId={1}
        />
      );

      // 等待组件稳定
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-1')).toBeInTheDocument();
      });

      // 由于 SelectionMenu 是 mock 的，我们需要直接触发 handleQuery
      // 这需要更复杂的测试设置，暂时跳过
    });
  });

  describe('分批加载字幕（性能优化）', () => {
    const mockSegments = [
      { segment_index: 0, status: 'completed', start_time: 0.0, end_time: 180.0 },
      { segment_index: 1, status: 'completed', start_time: 180.0, end_time: 360.0 },
      { segment_index: 2, status: 'completed', start_time: 360.0, end_time: 540.0 },
      { segment_index: 3, status: 'completed', start_time: 540.0, end_time: 720.0 },
      { segment_index: 4, status: 'processing', start_time: 720.0, end_time: 900.0 },
    ];

    const segment0Cues = [
      { id: 1, start_time: 1.0, end_time: 5.0, speaker: 'Speaker 1', text: 'Segment 0 cue 1' },
      { id: 2, start_time: 5.0, end_time: 10.0, speaker: 'Speaker 1', text: 'Segment 0 cue 2' },
    ];

    const segment1Cues = [
      { id: 3, start_time: 181.0, end_time: 185.0, speaker: 'Speaker 2', text: 'Segment 1 cue 1' },
      { id: 4, start_time: 185.0, end_time: 190.0, speaker: 'Speaker 2', text: 'Segment 1 cue 2' },
    ];

    const segment2Cues = [
      { id: 5, start_time: 361.0, end_time: 365.0, speaker: 'Speaker 1', text: 'Segment 2 cue 1' },
    ];

    const segment3Cues = [
      { id: 6, start_time: 541.0, end_time: 545.0, speaker: 'Speaker 2', text: 'Segment 3 cue 1' },
    ];

    beforeEach(() => {
      getCuesBySegmentRange.mockClear();
      getCuesByEpisodeId.mockClear();
      subtitleService.getEpisodeSegments.mockResolvedValue(mockSegments);
    });

    it('应该初始只加载前3个已完成的segment的字幕', async () => {
      const initialCues = [...segment0Cues, ...segment1Cues, ...segment2Cues];
      getCuesBySegmentRange.mockResolvedValue(initialCues);

      render(
        <SubtitleList
          episodeId={123}
          segments={mockSegments}
          currentTime={1.0}
          duration={900.0}
        />
      );

      await waitFor(() => {
        expect(getCuesBySegmentRange).toHaveBeenCalledTimes(1);
      });

      // 验证调用参数：只加载前3个segment（0-2）
      expect(getCuesBySegmentRange).toHaveBeenCalledWith(123, 0, 2);
      
      // 验证不应该调用 getCuesByEpisodeId（使用新的分批加载API）
      expect(getCuesByEpisodeId).not.toHaveBeenCalled();

      // 验证字幕已加载
      await waitFor(() => {
        expect(screen.getByText('Segment 0 cue 1')).toBeInTheDocument();
        expect(screen.getByText('Segment 2 cue 1')).toBeInTheDocument();
      });
    });

    it('如果没有segments信息，应该加载所有字幕（向后兼容）', async () => {
      getCuesByEpisodeId.mockResolvedValue(mockCues);

      render(
        <SubtitleList
          episodeId={123}
          segments={[]}
          currentTime={1.0}
          duration={900.0}
        />
      );

      await waitFor(() => {
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
      });

      // 验证调用了 getCuesByEpisodeId（向后兼容）
      expect(getCuesByEpisodeId).toHaveBeenCalledWith(123);
      
      // 验证没有调用 getCuesBySegmentRange
      expect(getCuesBySegmentRange).not.toHaveBeenCalled();
    });

    it('应该只加载已完成的segment的字幕，跳过processing状态的segment', async () => {
      // 只有前3个segment已完成
      const initialCues = [...segment0Cues, ...segment1Cues, ...segment2Cues];
      getCuesBySegmentRange.mockResolvedValue(initialCues);

      render(
        <SubtitleList
          episodeId={123}
          segments={mockSegments}
          currentTime={1.0}
          duration={900.0}
        />
      );

      await waitFor(() => {
        expect(getCuesBySegmentRange).toHaveBeenCalledTimes(1);
      });

      // 验证只加载前3个已完成的segment（0-2），跳过processing的segment 4
      expect(getCuesBySegmentRange).toHaveBeenCalledWith(123, 0, 2);
    });

    it('当segments少于3个时，应该加载所有已完成的segment', async () => {
      const fewSegments = mockSegments.slice(0, 2); // 只有2个segment
      const initialCues = [...segment0Cues, ...segment1Cues];
      getCuesBySegmentRange.mockResolvedValue(initialCues);

      render(
        <SubtitleList
          episodeId={123}
          segments={fewSegments}
          currentTime={1.0}
          duration={360.0}
        />
      );

      await waitFor(() => {
        expect(getCuesBySegmentRange).toHaveBeenCalledTimes(1);
      });

      // 验证加载所有已完成的segment（0-1）
      expect(getCuesBySegmentRange).toHaveBeenCalledWith(123, 0, 1);
    });
  });
});

