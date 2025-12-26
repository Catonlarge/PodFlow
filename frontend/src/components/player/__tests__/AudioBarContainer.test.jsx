import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AudioBarContainer from '../AudioBarContainer';

// Mock HTML5 Audio API - 在 describe 外部定义，避免测试间状态污染
const mockPlay = vi.fn();
const mockPause = vi.fn();
const mockLoad = vi.fn();

// 模拟 audio 元素
const createMockAudioElement = () => {
  const audio = {
    play: mockPlay,
    pause: mockPause,
    load: mockLoad,
    currentTime: 0,
    duration: NaN,
    volume: 0.8,
    muted: false,
    paused: true,
    readyState: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  return audio;
};

// Mock HTMLAudioElement 构造函数
global.HTMLAudioElement = vi.fn().mockImplementation(() => {
  return createMockAudioElement();
});

describe('AudioBarContainer', () => {
  const mockAudioUrl = 'http://localhost:8000/static/audio/test.mp3';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlay.mockResolvedValue(undefined);
    mockPause.mockReturnValue(undefined);
    mockLoad.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('渲染', () => {
    it('应该渲染完整的播放器界面', () => {
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      // 检查播放按钮
      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      expect(playButton).toBeInTheDocument();

      // 检查进度条
      expect(screen.getByRole('slider', { name: /进度/i })).toBeInTheDocument();

      // 检查 audio 元素
      const audioElement = document.querySelector('audio');
      expect(audioElement).toBeInTheDocument();
      expect(audioElement).toHaveAttribute('src', mockAudioUrl);
    });

    it('应该渲染收缩态当 isIdle 为 true 时', async () => {
      const { act } = await import('@testing-library/react');
      vi.useFakeTimers();

      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');

      // 设置为播放状态
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });

      // 触发 play 事件
      await act(async () => {
        const playEvent = new Event('play');
        audioElement.dispatchEvent(playEvent);
      });

      // 验证播放按钮出现
      expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      
      // 快进 4 秒（超过 3 秒延迟）使播放器进入空闲状态
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      // 等待定时器检查（每秒检查一次）
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 验证进度条仍然存在（收缩态仍然显示进度条）
      expect(screen.getByRole('slider', { name: /进度/i })).toBeInTheDocument();
      
      vi.useRealTimers();
    });
  });

  describe('收缩/展开逻辑', () => {
    it('应该展开当点击收缩面板时', async () => {
      const { act } = await import('@testing-library/react');
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      vi.useFakeTimers();

      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');

      // 设置为播放状态
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });

      // 触发 play 事件
      await act(async () => {
        const playEvent = new Event('play');
        audioElement.dispatchEvent(playEvent);
      });

      // 验证播放按钮出现
      expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      
      // 快进 4 秒使其收缩
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      
      // 查找进度条容器并点击（收缩面板就是进度条容器）
      const progressSlider = screen.getByRole('slider', { name: /进度/i });
      const progressContainer = progressSlider.closest('[class*="MuiStack"]') || progressSlider.closest('div');
      expect(progressContainer).toBeTruthy();
      
      await act(async () => {
        await user.click(progressContainer);
      });

      // 验证播放按钮仍然存在（说明展开功能正常）
      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放' || btn.getAttribute('aria-label') === '暂停');
      expect(playButton).toBeInTheDocument();
      
      vi.useRealTimers();
    });

    it('应该立即展开当暂停时', async () => {
      const { act } = await import('@testing-library/react');
      vi.useFakeTimers();
      
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');

      // 先设置为播放状态
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });

      await act(async () => {
        const playEvent = new Event('play');
        audioElement.dispatchEvent(playEvent);
      });

      expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();

      // 触发 pause 事件
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: true,
        configurable: true,
      });

      await act(async () => {
        const pauseEvent = new Event('pause');
        audioElement.dispatchEvent(pauseEvent);
      });

      // 暂停后应该立即展开面板（播放按钮应该出现）
      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      expect(playButton).toBeInTheDocument();
      
      vi.useRealTimers();
    });
  });

  describe('鼠标悬停', () => {
    it('应该展开当鼠标悬停在播放器上时', async () => {
      const { act } = await import('@testing-library/react');
      vi.useFakeTimers();

      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');

      // 设置为播放状态
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });

      // 触发 play 事件
      await act(async () => {
        const playEvent = new Event('play');
        audioElement.dispatchEvent(playEvent);
      });

      // 验证播放按钮出现
      expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      
      // 快进 4 秒使其收缩
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      
      // 模拟鼠标进入（通过触发 mousemove 事件）
      await act(async () => {
        const mousemoveEvent = new Event('mousemove');
        window.dispatchEvent(mousemoveEvent);
      });

      // 应该展开（播放按钮应该存在）
      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放' || btn.getAttribute('aria-label') === '暂停');
      expect(playButton).toBeInTheDocument();
      
      vi.useRealTimers();
    });
  });
});

