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

  beforeEach(() => {
    vi.clearAllMocks();
    audioElements = [];
    mockPlay.mockResolvedValue(undefined);
    mockPause.mockReturnValue(undefined);
    mockLoad.mockReturnValue(undefined);
  });

  // 辅助函数：设置 mockAudio 并触发事件监听器注册
  // 通过改变 audioUrl 来触发 useEffect 重新运行
  const setupMockAudioAndRerender = (result, rerender, mockAudio, props = {}) => {
    // 先设置 audioRef
    result.current.audioRef.current = mockAudio;
    
    // 通过改变 audioUrl 来触发 useEffect 重新运行
    // 使用一个新的 URL 确保依赖项改变，同时保留其他 props
    const audioUrl = props.audioUrl || mockAudioUrl;
    const newAudioUrl = `${audioUrl}?t=${Date.now()}`;
    rerender({ ...props, audioUrl: newAudioUrl });
  };

  // 辅助函数：触发事件（行为导向，强制断言）
  // 如果事件监听器未注册，测试应该失败
  const triggerAudioEvent = async (audio, eventName, eventData = null) => {
    // 查找事件监听器（强制断言，不允许跳过）
    const call = audio.addEventListener.mock.calls.find(
      call => call[0] === eventName
    );
    
    // 强制断言：如果监听器未注册，测试必须失败
    if (!call || !call[1]) {
      throw new Error(`事件监听器 "${eventName}" 未被注册，测试无法继续`);
    }
    
    // 调用事件处理函数
    await act(async () => {
      call[1](eventData || new Event(eventName));
    });
  };

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

    it('应该返回 audioRef', () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      expect(result.current.audioRef).toBeDefined();
      expect(result.current.audioRef).toHaveProperty('current');
    });

    it('应该注册所有必需的事件监听器', () => {
      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl } }
      );

      const mockAudio = createMockAudioElement();
      
      // 设置 mockAudio 并触发 useEffect 重新运行
      setupMockAudioAndRerender(result, rerender, mockAudio);

      // 验证所有事件监听器都已注册（强制断言，不允许跳过）
      const requiredEvents = [
        'loadedmetadata',
        'timeupdate',
        'play',
        'pause',
        'ended',
        'volumechange',
        'error',
      ];

      requiredEvents.forEach(eventName => {
        const call = mockAudio.addEventListener.mock.calls.find(
          call => call[0] === eventName
        );
        expect(call).toBeDefined();
        expect(call[1]).toBeInstanceOf(Function);
      });
    });
  });

  describe('播放/暂停', () => {
    it('togglePlay 应该调用 audio.play() 当音频暂停时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const mockAudio = createMockAudioElement();
      Object.defineProperty(mockAudio, 'paused', {
        writable: true,
        value: true,
        configurable: true,
      });
      Object.defineProperty(mockAudio, 'readyState', {
        writable: true,
        value: 4,
        configurable: true,
      });
      mockAudio.play = mockPlay;
      
      result.current.audioRef.current = mockAudio;

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

      const mockAudio = createMockAudioElement();
      Object.defineProperty(mockAudio, 'paused', {
        writable: true,
        value: false,
        configurable: true,
      });
      mockAudio.pause = mockPause;
      
      result.current.audioRef.current = mockAudio;

      await act(async () => {
        await result.current.togglePlay();
      });

      expect(mockPause).toHaveBeenCalled();
    });

    it('应该更新 isPlaying 状态当播放事件触发时', async () => {
      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl } }
      );

      const mockAudio = createMockAudioElement();
      
      // 设置 mockAudio 并触发 useEffect 重新运行
      setupMockAudioAndRerender(result, rerender, mockAudio);

      // 触发 play 事件（行为导向，强制断言）
      await triggerAudioEvent(mockAudio, 'play');

      await waitFor(() => {
        expect(result.current.isPlaying).toBe(true);
      });
    });

    it('应该更新 isPlaying 状态当暂停事件触发时', async () => {
      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl } }
      );

      const mockAudio = createMockAudioElement();
      
      // 设置 mockAudio 并触发 useEffect 重新运行
      setupMockAudioAndRerender(result, rerender, mockAudio);

      // 先触发 play 事件使其处于播放状态
      await triggerAudioEvent(mockAudio, 'play');

      await waitFor(() => {
        expect(result.current.isPlaying).toBe(true);
      });

      // 触发 pause 事件（行为导向，强制断言）
      await triggerAudioEvent(mockAudio, 'pause');

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

      const mockAudio = createMockAudioElement();
      result.current.audioRef.current = mockAudio;

      await act(async () => {
        result.current.setProgress(null, 30);
      });

      expect(mockAudio.currentTime).toBe(30);
    });

    it('应该更新 currentTime 当 timeupdate 事件触发时', async () => {
      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl } }
      );

      const mockAudio = createMockAudioElement();
      Object.defineProperty(mockAudio, 'currentTime', {
        writable: true,
        value: 30,
        configurable: true,
      });
      
      // 设置 mockAudio 并触发 useEffect 重新运行
      setupMockAudioAndRerender(result, rerender, mockAudio);

      // 触发 timeupdate 事件（行为导向，强制断言）
      await triggerAudioEvent(mockAudio, 'timeupdate');

      await waitFor(() => {
        expect(result.current.currentTime).toBe(30);
      });
    });

    it('应该调用 onTimeUpdate 回调当 timeupdate 事件触发时', async () => {
      const onTimeUpdate = vi.fn();
      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl, onTimeUpdate } }
      );

      const mockAudio = createMockAudioElement();
      Object.defineProperty(mockAudio, 'currentTime', {
        writable: true,
        value: 30,
        configurable: true,
      });
      
      // 设置 mockAudio 并触发 useEffect 重新运行（需要传递 onTimeUpdate）
      setupMockAudioAndRerender(result, rerender, mockAudio, { audioUrl: mockAudioUrl, onTimeUpdate });

      // 触发 timeupdate 事件（行为导向，强制断言）
      await triggerAudioEvent(mockAudio, 'timeupdate');

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

      const mockAudio = createMockAudioElement();
      result.current.audioRef.current = mockAudio;

      await act(async () => {
        result.current.setVolume(null, 0.5);
      });

      expect(mockAudio.volume).toBe(0.5);
      expect(mockAudio.muted).toBe(false);
    });

    it('toggleMute 应该切换静音状态', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const mockAudio = createMockAudioElement();
      Object.defineProperty(mockAudio, 'muted', {
        writable: true,
        value: false,
        configurable: true,
      });
      Object.defineProperty(mockAudio, 'volume', {
        writable: true,
        value: 0.8,
        configurable: true,
      });
      result.current.audioRef.current = mockAudio;

      await act(async () => {
        result.current.toggleMute();
      });

      expect(mockAudio.muted).toBe(true);
    });

    it('toggleMute 应该恢复之前的音量当解除静音时', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const mockAudio = createMockAudioElement();
      Object.defineProperty(mockAudio, 'muted', {
        writable: true,
        value: true,
        configurable: true,
      });
      Object.defineProperty(mockAudio, 'volume', {
        writable: true,
        value: 0,
        configurable: true,
      });
      result.current.audioRef.current = mockAudio;

      await act(async () => {
        result.current.toggleMute();
      });

      expect(mockAudio.muted).toBe(false);
      expect(mockAudio.volume).toBeGreaterThan(0);
    });
  });

  describe('播放速度', () => {
    it('setPlaybackRate 应该循环切换播放速度', async () => {
      const { result } = renderHook(() =>
        useAudio({
          audioUrl: mockAudioUrl,
        })
      );

      const mockAudio = createMockAudioElement();
      result.current.audioRef.current = mockAudio;

      // 1X → 1.25X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(mockAudio.playbackRate).toBe(1.25);
      expect(result.current.playbackRate).toBe(1.25);

      // 1.25X → 1.5X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(mockAudio.playbackRate).toBe(1.5);
      expect(result.current.playbackRate).toBe(1.5);

      // 1.5X → 0.75X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(mockAudio.playbackRate).toBe(0.75);
      expect(result.current.playbackRate).toBe(0.75);

      // 0.75X → 1X
      await act(async () => {
        result.current.setPlaybackRate();
      });
      expect(mockAudio.playbackRate).toBe(1);
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

      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl } }
      );

      const mockAudio = createMockAudioElement();
      const mockError = {
        code: 4,
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
      };

      Object.defineProperty(mockAudio, 'error', {
        writable: true,
        value: mockError,
        configurable: true,
      });
      
      // 设置 mockAudio 并触发 useEffect 重新运行
      setupMockAudioAndRerender(result, rerender, mockAudio);

      // 触发 error 事件（行为导向，强制断言）
      await triggerAudioEvent(mockAudio, 'error', new Event('error'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('应该处理空 URL 的情况', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: mockAudioUrl } }
      );

      const mockAudio = createMockAudioElement();
      result.current.audioRef.current = mockAudio;

      // 清除之前的调用记录
      consoleWarnSpy.mockClear();

      // 通过改变 audioUrl 为空字符串来触发 useEffect
      rerender({ audioUrl: '' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('audioUrl 为空'));
      expect(mockAudio.load).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('应该处理网络错误后恢复的情况', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      const { result, rerender } = renderHook(
        (props) => useAudio(props),
        { initialProps: { audioUrl: 'http://invalid-url.com/audio.mp3' } }
      );

      const mockAudio = createMockAudioElement();
      
      // 模拟第一次加载失败（网络错误）
      const mockNetworkError = {
        code: 2,
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
      };

      Object.defineProperty(mockAudio, 'error', {
        writable: true,
        value: mockNetworkError,
        configurable: true,
      });

      setupMockAudioAndRerender(result, rerender, mockAudio, { audioUrl: 'http://invalid-url.com/audio.mp3' });

      // 触发 error 事件
      await triggerAudioEvent(mockAudio, 'error', new Event('error'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      // 清除错误，模拟网络恢复
      Object.defineProperty(mockAudio, 'error', {
        writable: true,
        value: null,
        configurable: true,
      });

      // 重置 mock
      mockAudio.load.mockClear();
      consoleErrorSpy.mockClear();
      alertSpy.mockClear();

      // 使用新的有效 URL 重新加载
      const validAudioUrl = 'http://localhost:8000/static/audio/valid.mp3';
      setupMockAudioAndRerender(result, rerender, mockAudio, { audioUrl: validAudioUrl });

      // 验证音频尝试重新加载
      await waitFor(() => {
        expect(mockAudio.load).toHaveBeenCalled();
      });

      // 模拟成功加载：先设置 duration，再触发事件
      Object.defineProperty(mockAudio, 'duration', {
        writable: true,
        value: 100,
        configurable: true,
      });

      await triggerAudioEvent(mockAudio, 'loadedmetadata');

      await waitFor(() => {
        expect(result.current.duration).toBeGreaterThan(0);
      });

      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });
});
