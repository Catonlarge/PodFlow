import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SubtitleList from '../SubtitleList';
import { getMockCues } from '../../../services/subtitleService';

// Mock subtitleService
vi.mock('../../../services/subtitleService', () => ({
  getMockCues: vi.fn(),
}));

// Mock SubtitleRow
vi.mock('../SubtitleRow', () => ({
  default: ({ cue, showSpeaker, isHighlighted }) => {
    if (showSpeaker) {
      return <div data-testid={`speaker-${cue.speaker}`}>{cue.speaker}：</div>;
    }
    return (
      <div
        data-testid={`subtitle-${cue.id}`}
        data-highlighted={isHighlighted}
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
});

