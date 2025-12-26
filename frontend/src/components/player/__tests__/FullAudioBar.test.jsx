import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FullAudioBar from '../FullAudioBar';

describe('FullAudioBar', () => {
  const mockAudioState = {
    currentTime: 30,
    duration: 300,
    isPlaying: false,
    volume: 0.8,
    isMuted: false,
    playbackRate: 1,
  };

  const mockAudioControls = {
    togglePlay: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    setProgress: vi.fn(),
    onProgressChangeCommitted: vi.fn(),
    onVolumeChangeCommitted: vi.fn(),
  };

  const mockOnInteraction = vi.fn();
  const mockOnMouseEnter = vi.fn();
  const mockOnMouseLeave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染', () => {
    it('应该渲染所有控制按钮', () => {
      render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      // 检查播放按钮（使用精确匹配，避免匹配到"播放速度"按钮）
      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      expect(playButton).toBeInTheDocument();

      // 检查前进/后退按钮
      expect(screen.getByRole('button', { name: /前进30秒/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /后退15秒/i })).toBeInTheDocument();

      // 检查倍速按钮
      expect(screen.getByRole('button', { name: /播放速度/i })).toBeInTheDocument();

      // 检查音量按钮
      expect(screen.getByRole('button', { name: /音量/i })).toBeInTheDocument();

      // 检查进度条
      expect(screen.getByRole('slider', { name: /进度/i })).toBeInTheDocument();

      // 检查音量滑块
      expect(screen.getByRole('slider', { name: /音量/i })).toBeInTheDocument();
    });

    it('应该显示播放按钮当 isPlaying 为 false 时', () => {
      render(
        <FullAudioBar
          audioState={{ ...mockAudioState, isPlaying: false }}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      expect(playButton).toBeInTheDocument();
    });

    it('应该显示暂停按钮当 isPlaying 为 true 时', () => {
      render(
        <FullAudioBar
          audioState={{ ...mockAudioState, isPlaying: true }}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
    });

    it('应该显示正确的倍速', () => {
      render(
        <FullAudioBar
          audioState={{ ...mockAudioState, playbackRate: 1.25 }}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      expect(screen.getByText(/1.25X/i)).toBeInTheDocument();
    });

    it('应该显示静音图标当 isMuted 为 true 时', () => {
      render(
        <FullAudioBar
          audioState={{ ...mockAudioState, isMuted: true }}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      expect(screen.getByRole('button', { name: /静音/i })).toBeInTheDocument();
    });
  });

  describe('交互', () => {
    it('应该调用 togglePlay 当点击播放/暂停按钮时', async () => {
      const user = userEvent.setup();
      render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      await user.click(playButton);

      expect(mockAudioControls.togglePlay).toHaveBeenCalledTimes(1);
    });

    it('应该调用 rewind 当点击前进按钮时', async () => {
      const user = userEvent.setup();
      render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /前进30秒/i });
      await user.click(forwardButton);

      expect(mockAudioControls.rewind).toHaveBeenCalledTimes(1);
    });

    it('应该调用 forward 当点击后退按钮时', async () => {
      const user = userEvent.setup();
      render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      const rewindButton = screen.getByRole('button', { name: /后退15秒/i });
      await user.click(rewindButton);

      expect(mockAudioControls.forward).toHaveBeenCalledTimes(1);
    });

    it('应该调用 setPlaybackRate 当点击倍速按钮时', async () => {
      const user = userEvent.setup();
      render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      const speedButton = screen.getByRole('button', { name: /播放速度/i });
      await user.click(speedButton);

      expect(mockAudioControls.setPlaybackRate).toHaveBeenCalledTimes(1);
    });

    it('应该调用 toggleMute 当点击音量按钮时', async () => {
      const user = userEvent.setup();
      render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      const volumeButton = screen.getByRole('button', { name: /音量/i });
      await user.click(volumeButton);

      expect(mockAudioControls.toggleMute).toHaveBeenCalledTimes(1);
    });

    it('应该调用 onMouseEnter 当鼠标进入时', async () => {
      const { container } = render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      // 查找最外层的 Box 容器（通过 MUI Box 的 class）
      const boxContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(boxContainer).toBeTruthy();
      fireEvent.mouseEnter(boxContainer);
      expect(mockOnMouseEnter).toHaveBeenCalledTimes(1);
    });

    it('应该调用 onMouseLeave 当鼠标离开时', async () => {
      const { container } = render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      // 查找最外层的 Box 容器（通过 MUI Box 的 class）
      const boxContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(boxContainer).toBeTruthy();
      fireEvent.mouseLeave(boxContainer);
      expect(mockOnMouseLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe('样式', () => {
    it('应该固定在屏幕底部', () => {
      const { container } = render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      // 查找最外层的 Box 容器
      const boxContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(boxContainer).toBeTruthy();
      
      // 验证 position: fixed 和 bottom: 0
      const computedStyle = window.getComputedStyle(boxContainer);
      expect(computedStyle.position).toBe('fixed');
      expect(computedStyle.bottom).toBe('0px');
    });

    it('应该有正确的 z-index', () => {
      const { container } = render(
        <FullAudioBar
          audioState={mockAudioState}
          audioControls={mockAudioControls}
          onInteraction={mockOnInteraction}
          onMouseEnter={mockOnMouseEnter}
          onMouseLeave={mockOnMouseLeave}
        />
      );

      // 查找最外层的 Box 容器
      const boxContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(boxContainer).toBeTruthy();
      
      // 验证 z-index
      const computedStyle = window.getComputedStyle(boxContainer);
      expect(computedStyle.zIndex).toBe('1000');
    });
  });
});

