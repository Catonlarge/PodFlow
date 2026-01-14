import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MainLayout from '../MainLayout';

// Mock 子组件
vi.mock('../../subtitles/SubtitleList', () => ({
  default: ({ onCueClick, onVisibleCueIdsChange }) => (
    <div data-testid="subtitle-list">
      <button
        data-testid="cue-click-button"
        onClick={() => onCueClick && onCueClick(10.5)}
      >
        点击字幕
      </button>
      <button
        data-testid="trigger-visible-cue-ids"
        onClick={() => onVisibleCueIdsChange && onVisibleCueIdsChange(new Set([1, 2, 3]))}
      >
        触发可见字幕ID变化
      </button>
    </div>
  )
}));

vi.mock('../../notes/NoteSidebar', () => ({
  default: ({ visibleCueIds }) => (
    <div data-testid="note-sidebar" data-visible-cue-ids-size={visibleCueIds?.size ?? 0}>
      NoteSidebar
    </div>
  )
}));

// Mock AudioBarContainer，模拟音频控制方法
const mockSetProgress = vi.fn();
const mockTogglePlay = vi.fn();

// 创建 audioControlsRef.current 的 mock 对象
const mockAudioControlsRef = {
  current: {
    setProgress: mockSetProgress,
    togglePlay: mockTogglePlay,
    isPlaying: false,
  }
};

vi.mock('../../player/AudioBarContainer', () => ({
  default: ({ audioUrl, onAudioControlsReady }) => {
    // 模拟音频控制方法就绪回调
    if (onAudioControlsReady) {
      setTimeout(() => {
        onAudioControlsReady(mockAudioControlsRef.current);
      }, 0);
    }
    return audioUrl ? <div data-testid="audio-bar-container">AudioBarContainer</div> : null;
  }
}));

describe('MainLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 isPlaying 状态为 false
    mockAudioControlsRef.current.isPlaying = false;
  });

  describe('渲染', () => {
    it('应该渲染所有主要区域', () => {
      render(
        <MainLayout 
          episodeTitle="测试播客"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      expect(screen.getByText('测试播客')).toBeInTheDocument();
      expect(screen.getByText('测试节目')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('audio-bar-container')).toBeInTheDocument();
    });

    it('应该在没有 audioUrl 时不渲染 AudioBarContainer', () => {
      render(
        <MainLayout 
          episodeTitle="测试播客"
          showName="测试节目"
        />
      );

      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
      expect(screen.queryByTestId('audio-bar-container')).not.toBeInTheDocument();
    });

    it('应该正确传递 props 给 EpisodeHeader', () => {
      render(
        <MainLayout 
          episodeTitle="自定义标题"
          showName="自定义节目"
        />
      );

      expect(screen.getByText('自定义标题')).toBeInTheDocument();
      expect(screen.getByText('自定义节目')).toBeInTheDocument();
    });
  });

  describe('布局结构', () => {
    it('应该包含左右分栏布局', () => {
      render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      const subtitleList = screen.getByTestId('subtitle-list');
      const noteSidebar = screen.getByTestId('note-sidebar');
      
      expect(subtitleList).toBeInTheDocument();
      expect(noteSidebar).toBeInTheDocument();
    });

    it('主体区域应该包含字幕和笔记组件', () => {
      render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      // 验证字幕列表和笔记侧边栏都在文档中
      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
    });

    it('应该渲染主容器', () => {
      const { container } = render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      // 验证主容器存在（MUI Box 会渲染为 div）
      const mainContainer = container.querySelector('div');
      expect(mainContainer).toBeTruthy();
    });
  });

  describe('响应式设计', () => {
    it('应该正确渲染所有区域', () => {
      render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      // 验证所有主要组件都存在
      expect(screen.getByText('测试')).toBeInTheDocument();
      expect(screen.getByText('测试节目')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
    });
  });

  describe('点击字幕跳转和取消暂停', () => {
    it('应该在点击字幕时调用 setProgress 跳转时间', async () => {
      const user = userEvent.setup();
      
      render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      // 等待音频控制方法就绪
      await waitFor(() => {
        expect(mockSetProgress).toBeDefined();
      }, { timeout: 1000 });

      // 点击字幕
      const cueClickButton = screen.getByTestId('cue-click-button');
      await user.click(cueClickButton);

      // 验证 setProgress 被调用
      await waitFor(() => {
        expect(mockSetProgress).toHaveBeenCalledTimes(1);
        expect(mockSetProgress).toHaveBeenCalledWith(null, 10.5);
      });
    });

    it('应该在点击字幕时，如果暂停则调用 togglePlay 开始播放', async () => {
      const user = userEvent.setup();
      mockAudioControlsRef.current.isPlaying = false; // 设置为暂停状态

      render(
        <MainLayout
          episodeTitle="测试"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      // 等待音频控制方法就绪
      await waitFor(() => {
        expect(mockTogglePlay).toBeDefined();
      }, { timeout: 1000 });

      // 点击字幕
      const cueClickButton = screen.getByTestId('cue-click-button');
      await user.click(cueClickButton);

      // 验证 togglePlay 被调用（因为 isPlaying 为 false）
      await waitFor(() => {
        expect(mockTogglePlay).toHaveBeenCalledTimes(1);
      });
    });

    it('应该在点击字幕时，如果正在播放则不调用 togglePlay', async () => {
      const user = userEvent.setup();
      mockAudioControlsRef.current.isPlaying = true; // 设置为播放状态

      render(
        <MainLayout
          episodeTitle="测试"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      // 等待音频控制方法就绪
      await waitFor(() => {
        expect(mockSetProgress).toBeDefined();
      }, { timeout: 1000 });

      // 清空之前的调用记录
      vi.clearAllMocks();

      // 点击字幕
      const cueClickButton = screen.getByTestId('cue-click-button');
      await user.click(cueClickButton);

      // 验证 setProgress 被调用
      await waitFor(() => {
        expect(mockSetProgress).toHaveBeenCalledTimes(1);
      });

      // 验证 togglePlay 没有被调用（因为 isPlaying 为 true）
      expect(mockTogglePlay).not.toHaveBeenCalled();
    });
  });

  describe('虚拟滚动 - visibleCueIds 状态传递', () => {
    it('应该传递 onVisibleCueIdsChange 回调给 SubtitleList', async () => {
      render(
        <MainLayout
          episodeTitle="测试播客"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      // 等待组件渲染
      await waitFor(() => {
        expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      });

      // SubtitleList 应该接收到 onVisibleCueIdsChange prop
      // 通过触发按钮来验证
      const triggerButton = screen.getByTestId('trigger-visible-cue-ids');
      expect(triggerButton).toBeInTheDocument();
    });

    it('应该在 SubtitleList 触发 onVisibleCueIdsChange 时更新状态并传递给 NoteSidebar', async () => {
      const user = userEvent.setup();

      render(
        <MainLayout
          episodeTitle="测试播客"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      // 等待组件渲染
      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
      });

      // 初始状态：NoteSidebar 应该接收到空的 visibleCueIds
      const noteSidebar = screen.getByTestId('note-sidebar');
      expect(noteSidebar).toHaveAttribute('data-visible-cue-ids-size', '0');

      // 触发 visibleCueIds 变化
      const triggerButton = screen.getByTestId('trigger-visible-cue-ids');
      await user.click(triggerButton);

      // 验证 NoteSidebar 接收到更新后的 visibleCueIds
      await waitFor(() => {
        expect(noteSidebar).toHaveAttribute('data-visible-cue-ids-size', '3');
      });
    });

    it('应该初始化空的 visibleCueIds Set', async () => {
      render(
        <MainLayout
          episodeTitle="测试播客"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      // 等待组件渲染
      await waitFor(() => {
        expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
      });

      // 初始状态应该是空的 Set
      const noteSidebar = screen.getByTestId('note-sidebar');
      expect(noteSidebar).toHaveAttribute('data-visible-cue-ids-size', '0');
    });
  });
});

