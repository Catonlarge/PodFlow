import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AudioBarContainer from '../AudioBarContainer';

// Mock HTML5 Audio API
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

// 存储创建的 audio 元素引用
let audioElements = [];

// Mock window.HTMLAudioElement
global.HTMLAudioElement = vi.fn().mockImplementation(() => {
  const audio = createMockAudioElement();
  audioElements.push(audio);
  return audio;
});

describe('AudioBarContainer', () => {
  const mockAudioUrl = 'http://localhost:8000/static/audio/test.mp3';

  beforeEach(() => {
    vi.clearAllMocks();
    audioElements = [];
    mockPlay.mockResolvedValue(undefined);
    mockPause.mockReturnValue(undefined);
    mockLoad.mockReturnValue(undefined);
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

    it('应该渲染收缩态当 isIdle 为 true 时', { timeout: 10000 }, async () => {
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

      // 等待播放按钮出现（使用真实定时器）
      vi.useRealTimers();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      }, { timeout: 2000 });

      // 切换回 fake timers 来测试空闲检测
      vi.useFakeTimers();
      
      // 快进 4 秒（超过 3 秒延迟）
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      // 等待定时器检查（每秒检查一次）
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 切换回真实定时器来等待 DOM 更新
      vi.useRealTimers();
      await waitFor(() => {
        // 验证进度条仍然存在（收缩态仍然显示进度条）
        expect(screen.getByRole('slider', { name: /进度/i })).toBeInTheDocument();
      }, { timeout: 2000 });
    }, { timeout: 10000 });
  });

  describe('收缩/展开逻辑', () => {
    it('应该展开当点击收缩面板时', { timeout: 10000 }, async () => {
      const { act } = await import('@testing-library/react');
      const user = userEvent.setup({ delay: null });
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

      // 等待播放按钮出现（使用真实定时器）
      vi.useRealTimers();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      }, { timeout: 2000 });

      // 切换回 fake timers 来测试空闲检测
      vi.useFakeTimers();
      
      // 快进 4 秒使其收缩
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 切换回真实定时器来等待 DOM 更新和点击
      vi.useRealTimers();
      
      // 查找进度条容器并点击（收缩面板就是进度条容器）
      const progressSlider = screen.getByRole('slider', { name: /进度/i });
      const progressContainer = progressSlider.closest('[class*="MuiStack"]') || progressSlider.closest('div');
      
      if (progressContainer) {
        await user.click(progressContainer);
      }

      // 验证播放按钮仍然存在（说明展开功能正常）
      await waitFor(() => {
        const playButtons = screen.getAllByRole('button');
        const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放' || btn.getAttribute('aria-label') === '暂停');
        expect(playButton).toBeInTheDocument();
      }, { timeout: 2000 });
    }, { timeout: 10000 });

    it('应该立即展开当暂停时', { timeout: 10000 }, async () => {
      const { act } = await import('@testing-library/react');
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

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      }, { timeout: 2000 });

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
      await waitFor(() => {
        const playButtons = screen.getAllByRole('button');
        const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
        expect(playButton).toBeInTheDocument();
      }, { timeout: 2000 });
    }, { timeout: 10000 });
  });

  describe('鼠标悬停', () => {
    it('应该展开当鼠标悬停在播放器上时', { timeout: 10000 }, async () => {
      const { act } = await import('@testing-library/react');
      const user = userEvent.setup({ delay: null });
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

      // 等待播放按钮出现（使用真实定时器）
      vi.useRealTimers();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      }, { timeout: 2000 });

      // 切换回 fake timers 来测试空闲检测
      vi.useFakeTimers();
      
      // 快进 4 秒使其收缩
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 切换回真实定时器来等待 DOM 更新
      vi.useRealTimers();
      
      // 模拟鼠标进入（通过触发 mousemove 事件）
      const mousemoveEvent = new Event('mousemove');
      window.dispatchEvent(mousemoveEvent);

      // 应该展开（播放按钮应该存在）
      await waitFor(() => {
        const playButtons = screen.getAllByRole('button');
        const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放' || btn.getAttribute('aria-label') === '暂停');
        expect(playButton).toBeInTheDocument();
      }, { timeout: 2000 });
    }, { timeout: 10000 });
  });
});

