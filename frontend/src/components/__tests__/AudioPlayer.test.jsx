import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AudioBarContainer from '../player/AudioBarContainer';

/**
 * AudioBarContainer 集成测试
 * 
 * 此文件保留核心集成测试用例，验证整个播放器系统的集成功能
 * 详细的组件测试已拆分到对应的组件测试文件中：
 * - hooks/__tests__/useAudio.test.js - 音频播放逻辑测试
 * - hooks/__tests__/useIdle.test.js - 无操作检测逻辑测试
 * - components/player/__tests__/ProgressBar.test.jsx - 进度条组件测试
 * - components/player/__tests__/MiniAudioBar.test.jsx - 收缩态UI测试
 * - components/player/__tests__/FullAudioBar.test.jsx - 展开态UI测试
 * - components/player/__tests__/AudioBarContainer.test.jsx - 容器组件测试
 */

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

describe('AudioBarContainer 集成测试', () => {
  const mockAudioUrl = 'http://localhost:8000/static/audio/test.mp3';

  beforeEach(() => {
    vi.clearAllMocks();
    audioElements = [];
    mockPlay.mockResolvedValue(undefined);
    mockPause.mockReturnValue(undefined);
    mockLoad.mockReturnValue(undefined);
  });

  describe('核心集成功能', () => {
    it('应该完整渲染播放器界面', () => {
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      // 检查播放按钮
      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      expect(playButton).toBeInTheDocument();

      // 检查进度条
      expect(screen.getByRole('slider', { name: /进度/i })).toBeInTheDocument();

      // 检查音量按钮
      expect(screen.getByRole('button', { name: /音量/i })).toBeInTheDocument();

      // 检查 audio 元素
      const audioElement = document.querySelector('audio');
      expect(audioElement).toBeInTheDocument();
      expect(audioElement).toHaveAttribute('src', mockAudioUrl);
    });

    it('应该正确设置 audio 元素的初始属性', () => {
      render(<AudioBarContainer audioUrl={mockAudioUrl} initialVolume={0.5} />);

      const audioElement = document.querySelector('audio');
      expect(audioElement).toHaveAttribute('src', mockAudioUrl);
      expect(audioElement.volume).toBe(0.5);
    });

    it('应该使用默认音量 0.8 当未提供 initialVolume 时', () => {
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');
      expect(audioElement.volume).toBe(0.8);
    });
  });

  describe('播放/暂停集成', () => {
    it('应该能够播放和暂停音频', async () => {
      const user = userEvent.setup();
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const playButtons = screen.getAllByRole('button');
      const playButton = playButtons.find(btn => btn.getAttribute('aria-label') === '播放');
      const audioElement = document.querySelector('audio');

      // 设置 readyState 确保音频已加载
      Object.defineProperty(audioElement, 'readyState', {
        writable: true,
        value: 4,
        configurable: true,
      });
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: true,
        configurable: true,
      });
      audioElement.play = mockPlay;

      // 点击播放
      await user.click(playButton);

      await waitFor(() => {
        expect(mockPlay).toHaveBeenCalledTimes(1);
      });

      // 触发 play 事件使按钮变为暂停按钮
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });
      const playEvent = new Event('play');
      audioElement.dispatchEvent(playEvent);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
      });

      // 点击暂停
      const pauseButton = screen.getByRole('button', { name: /暂停/i });
      audioElement.pause = mockPause;
      await user.click(pauseButton);

      await waitFor(() => {
        expect(mockPause).toHaveBeenCalledTimes(1);
      });
    });

    it('应该调用 onTimeUpdate 回调当时间更新时', async () => {
      const onTimeUpdate = vi.fn();
      render(<AudioBarContainer audioUrl={mockAudioUrl} onTimeUpdate={onTimeUpdate} />);

      const audioElement = document.querySelector('audio');
      Object.defineProperty(audioElement, 'currentTime', {
        writable: true,
        value: 30,
        configurable: true,
      });

      const timeUpdateEvent = new Event('timeupdate');
      audioElement.dispatchEvent(timeUpdateEvent);

      await waitFor(() => {
        expect(onTimeUpdate).toHaveBeenCalledWith(30);
      });
    });
  });

  describe('音量控制集成', () => {
    it('应该能够切换静音状态', async () => {
      const user = userEvent.setup();
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const volumeButton = screen.getByRole('button', { name: /音量/i });
      const audioElement = document.querySelector('audio');

      Object.defineProperty(audioElement, 'muted', {
        writable: true,
        value: false,
        configurable: true,
      });

      await user.click(volumeButton);

      await waitFor(() => {
        expect(audioElement.muted).toBe(true);
      });
    });
  });

  describe('进度控制集成', () => {
    it('应该能够显示和更新播放进度', async () => {
      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');
      Object.defineProperty(audioElement, 'duration', {
        writable: true,
        value: 330,
        configurable: true,
      });
      Object.defineProperty(audioElement, 'currentTime', {
        writable: true,
        value: 125,
        configurable: true,
      });

      // 触发 loadedmetadata 事件
      const loadedMetadataEvent = new Event('loadedmetadata');
      audioElement.dispatchEvent(loadedMetadataEvent);

      // 触发 timeupdate 事件
      const timeUpdateEvent = new Event('timeupdate');
      audioElement.dispatchEvent(timeUpdateEvent);

      await waitFor(() => {
        expect(screen.getByText(/02:05/i)).toBeInTheDocument();
        expect(screen.getByText(/05:30/i)).toBeInTheDocument();
      });
    });
  });

  describe('错误处理集成', () => {
    it('应该处理音频加载错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<AudioBarContainer audioUrl={mockAudioUrl} />);

      const audioElement = document.querySelector('audio');
      const mockError = {
        code: 4,
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
      };

      Object.defineProperty(audioElement, 'error', {
        writable: true,
        value: mockError,
        configurable: true,
      });

      const errorEvent = new Event('error');
      audioElement.dispatchEvent(errorEvent);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      }, { timeout: 1000 });

      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });
});
