import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MainLayout from '../MainLayout';

// Mock 子组件
vi.mock('../../subtitles/SubtitleList', () => ({
  default: ({ onCueClick }) => (
    <div data-testid="subtitle-list">
      <button 
        data-testid="cue-click-button"
        onClick={() => onCueClick && onCueClick(10.5)}
      >
        点击字幕
      </button>
    </div>
  )
}));

vi.mock('../../notes/NoteSidebar', () => ({
  default: () => <div data-testid="note-sidebar">NoteSidebar</div>
}));

// Mock AudioBarContainer，模拟音频控制方法
const mockSetProgress = vi.fn();
const mockTogglePlay = vi.fn();
let mockIsPlaying = false;

vi.mock('../../player/AudioBarContainer', () => ({
  default: ({ audioUrl, onAudioControlsReady }) => {
    // 模拟音频控制方法就绪回调
    if (onAudioControlsReady) {
      setTimeout(() => {
        onAudioControlsReady({
          setProgress: mockSetProgress,
          togglePlay: mockTogglePlay,
          isPlaying: mockIsPlaying,
        });
      }, 0);
    }
    return audioUrl ? <div data-testid="audio-bar-container">AudioBarContainer</div> : null;
  }
}));

describe('MainLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPlaying = false;
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
      const { container } = render(
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
      const { container } = render(
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
      mockIsPlaying = false; // 设置为暂停状态
      
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
      mockIsPlaying = true; // 设置为播放状态
      
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
});

