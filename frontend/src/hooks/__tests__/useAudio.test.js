import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudio } from '../useAudio';

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

describe('useAudio', () => {
  const mockAudioUrl = 'http://localhost:8000/static/audio/test.mp3';
  const mockOnTimeUpdate = vi.fn();
  const mockOnInteraction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    audioElements = [];
    mockPlay.mockResolvedValue(undefined);
    mockPause.mockReturnValue(undefined);
    mockLoad.mockReturnValue(undefined);
  });

  describe('初始化', () => {
    it('应该正确初始化音频状态', () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
          initialVolume: 0.8,
        })
      );

      expect(result.current.currentTime).toBe(0);
      expect(result.current.duration).toBe(0);
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.volume).toBe(0.8);
      expect(result.current.isMuted).toBe(false);
      expect(result.current.playbackRate).toBe(1);
    });

    it('应该使用默认音量 0.8 当未提供 initialVolume 时', () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      expect(result.current.volume).toBe(0.8);
    });

    it('应该正确设置 audio 元素的 src', () => {
      renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      expect(audioElements.length).toBeGreaterThan(0);
      const audioElement = audioElements[0];
      expect(audioElement.src).toBe(mockAudioUrl);
    });
  });

  describe('播放/暂停', () => {
    it('togglePlay 应该调用 audio.play() 当音频暂停时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: true,
        configurable: true,
      });
      Object.defineProperty(audioElement, 'readyState', {
        writable: true,
        value: 4,
        configurable: true,
      });
      audioElement.play = mockPlay;

      await act(async () => {
        await result.current.togglePlay();
      });

      expect(mockPlay).toHaveBeenCalled();
    });

    it('togglePlay 应该调用 audio.pause() 当音频播放时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];
      Object.defineProperty(audioElement, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });
      audioElement.pause = mockPause;

      await act(async () => {
        await result.current.togglePlay();
      });

      expect(mockPause).toHaveBeenCalled();
    });

    it('应该更新 isPlaying 状态当播放事件触发时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];

      await act(async () => {
        const playEvent = new Event('play');
        audioElement.dispatchEvent(playEvent);
      });

      await waitFor(() => {
        expect(result.current.isPlaying).toBe(true);
      });
    });

    it('应该更新 isPlaying 状态当暂停事件触发时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];

      // 先触发 play 事件
      await act(async () => {
        const playEvent = new Event('play');
        audioElement.dispatchEvent(playEvent);
      });

      await waitFor(() => {
        expect(result.current.isPlaying).toBe(true);
      });

      // 再触发 pause 事件
      await act(async () => {
        const pauseEvent = new Event('pause');
        audioElement.dispatchEvent(pauseEvent);
      });

      await waitFor(() => {
        expect(result.current.isPlaying).toBe(false);
      });
    });
  });

  describe('进度控制', () => {
    it('setProgress 应该更新 currentTime', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];

      await act(async () => {
        result.current.setProgress(null, 30);
      });

      expect(audioElement.currentTime).toBe(30);
    });

    it('应该更新 currentTime 当 timeupdate 事件触发时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];
      Object.defineProperty(audioElement, 'currentTime', {
        writable: true,
        value: 30,
        configurable: true,
      });

      await act(async () => {
        const timeUpdateEvent = new Event('timeupdate');
        audioElement.dispatchEvent(timeUpdateEvent);
      });

      await waitFor(() => {
        expect(result.current.currentTime).toBe(30);
      });
    });

    it('应该调用 onTimeUpdate 回调当 timeupdate 事件触发时', async () => {
      const onTimeUpdate = vi.fn();
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
          onTimeUpdate,
        })
      );

      const audioElement = audioElements[0];
      Object.defineProperty(audioElement, 'currentTime', {
        writable: true,
        value: 30,
        configurable: true,
      });

      await act(async () => {
        const timeUpdateEvent = new Event('timeupdate');
        audioElement.dispatchEvent(timeUpdateEvent);
      });

      await waitFor(() => {
        expect(onTimeUpdate).toHaveBeenCalledWith(30);
      });
    });
  });

  describe('音量控制', () => {
    it('setVolume 应该更新音量', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];

      await act(async () => {
        result.current.setVolume(null, 0.5);
      });

      expect(audioElement.volume).toBe(0.5);
      expect(audioElement.muted).toBe(false);
    });

    it('toggleMute 应该切换静音状态', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];
      Object.defineProperty(audioElement, 'muted', {
        writable: true,
        value: false,
        configurable: true,
      });
      Object.defineProperty(audioElement, 'volume', {
        writable: true,
        value: 0.8,
        configurable: true,
      });

      await act(async () => {
        result.current.toggleMute();
      });

      expect(audioElement.muted).toBe(true);
    });

    it('toggleMute 应该恢复之前的音量当解除静音时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];
      Object.defineProperty(audioElement, 'muted', {
        writable: true,
        value: true,
        configurable: true,
      });
      Object.defineProperty(audioElement, 'volume', {
        writable: true,
        value: 0,
        configurable: true,
      });

      await act(async () => {
        result.current.toggleMute();
      });

      expect(audioElement.muted).toBe(false);
      expect(audioElement.volume).toBeGreaterThan(0);
    });
  });

  describe('播放速度', () => {
    it('setPlaybackRate 应该循环切换播放速度', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];

      // 1X → 1.25X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(audioElement.playbackRate).toBe(1.25);
      expect(result.current.playbackRate).toBe(1.25);

      // 1.25X → 1.5X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(audioElement.playbackRate).toBe(1.5);
      expect(result.current.playbackRate).toBe(1.5);

      // 1.5X → 0.75X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(audioElement.playbackRate).toBe(0.75);
      expect(result.current.playbackRate).toBe(0.75);

      // 0.75X → 1X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(audioElement.playbackRate).toBe(1);
      expect(result.current.playbackRate).toBe(1);
    });
  });

  describe('交互回调', () => {
    it('应该调用 onInteraction 回调当用户交互时', async () => {
      const onInteraction = vi.fn();
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
          onInteraction,
        })
      );

      await act(async () => {
        result.current.triggerInteraction();
      });

      expect(onInteraction).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理音频加载错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const audioElement = audioElements[0];
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

      await act(async () => {
        const errorEvent = new Event('error');
        audioElement.dispatchEvent(errorEvent);
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });
});

