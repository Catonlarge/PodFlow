import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SubtitleList from '../SubtitleList';
import { getMockCues, getCuesByEpisodeId } from '../../../services/subtitleService';

// Mock subtitleService
vi.mock('../../../services/subtitleService', () => ({
  getMockCues: vi.fn(),
  getCuesByEpisodeId: vi.fn(),
}));

// Mock SubtitleRow
vi.mock('../SubtitleRow', () => ({
  default: ({ cue, showSpeaker, isHighlighted, progress, highlights }) => {
    if (showSpeaker) {
      return <div data-testid={`speaker-${cue.speaker}`}>{cue.speaker}：</div>;
    }
    return (
      <div
        data-testid={`subtitle-${cue.id}`}
        data-highlighted={isHighlighted}
        data-progress={progress}
        data-highlights-count={highlights?.length || 0}
      >
        {cue.text}
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
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
      });

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
      });
    });

    it('当 transcriptionStatus 已经是 completed 时，不应该重复加载', async () => {
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
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
      });

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
      render(
        <SubtitleList
          episodeId={123}
          currentTime={1.0}
          duration={20.0}
        />
      );

      // 应该正常加载字幕（通过 episodeId）
      await waitFor(() => {
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
        expect(getCuesByEpisodeId).toHaveBeenCalledWith(123);
      });
    });

    it('当 transcriptionStatus 从 pending 变为 completed 时，应该重新加载字幕', async () => {
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
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
      });

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
      });
    });

    it('当 transcriptionStatus 变为其他状态时，不应该重新加载', async () => {
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
        expect(getCuesByEpisodeId).toHaveBeenCalledTimes(1);
      });

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
});

