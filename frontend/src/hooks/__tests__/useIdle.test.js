import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdle } from '../useIdle';

describe('useIdle', () => {
  let dateNowSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock Date.now() 以配合 fake timers
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (dateNowSpy) {
      dateNowSpy.mockRestore();
    }
  });

  describe('初始化', () => {
    it('初始状态应该是非空闲（isIdle = false）', () => {
      const { result } = renderHook(() => useIdle({ delay: 3000 }));

      expect(result.current.isIdle).toBe(false);
    });

    it('应该使用默认延迟 3000ms', () => {
      const { result } = renderHook(() => useIdle());

      expect(result.current.isIdle).toBe(false);
      expect(result.current.resetIdleTimer).toBeDefined();
    });
  });

  describe('空闲检测', () => {
    it('应该在指定延迟后变为空闲状态', async () => {
      const startTime = 0;
      dateNowSpy.mockReturnValue(startTime);
      
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 初始状态非空闲
      expect(result.current.isIdle).toBe(false);

      // 快进 3 秒（刚好达到延迟时间）
      dateNowSpy.mockReturnValue(startTime + 3000);
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // 等待定时器检查（每秒检查一次），需要再快进1秒让定时器执行
      dateNowSpy.mockReturnValue(startTime + 4000);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 直接检查状态，不使用 waitFor（因为 fake timers 不支持）
      expect(result.current.isIdle).toBe(true);
    });

    it('不应该变为空闲当 enabled 为 false 时', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: false }));

      // 快进 5 秒
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      // 等待定时器检查
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲
      expect(result.current.isIdle).toBe(false);
    });

    it('不应该变为空闲当 isHovering 为 true 时', async () => {
      const { result } = renderHook(() =>
        useIdle({ delay: 3000, enabled: true, isHovering: true })
      );

      // 快进 5 秒
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      // 等待定时器检查
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲（因为正在悬停）
      expect(result.current.isIdle).toBe(false);
    });
  });

  describe('交互重置', () => {
    it('resetIdleTimer 应该重置空闲状态', async () => {
      const startTime = 0;
      dateNowSpy.mockReturnValue(startTime);
      
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 先让它变为空闲
      dateNowSpy.mockReturnValue(startTime + 4000);
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      dateNowSpy.mockReturnValue(startTime + 5000);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 直接检查状态，不使用 waitFor
      expect(result.current.isIdle).toBe(true);

      // 重置空闲定时器
      const resetTime = startTime + 6000;
      dateNowSpy.mockReturnValue(resetTime);
      act(() => {
        result.current.resetIdleTimer();
      });

      // 应该立即变为非空闲
      expect(result.current.isIdle).toBe(false);
    });

    it('全局鼠标移动应该重置空闲定时器', async () => {
      const startTime = 0;
      dateNowSpy.mockReturnValue(startTime);
      
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒
      dateNowSpy.mockReturnValue(startTime + 2000);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // 模拟鼠标移动（这会重置lastInteractionTime）
      const interactionTime = startTime + 2000;
      dateNowSpy.mockReturnValue(interactionTime);
      await act(async () => {
        const mousemoveEvent = new Event('mousemove');
        window.dispatchEvent(mousemoveEvent);
        // 等待状态更新
        vi.advanceTimersByTime(0);
      });

      // 再快进 1.5 秒（从交互时间开始，只过了 1.5 秒，未超过 3 秒延迟）
      dateNowSpy.mockReturnValue(interactionTime + 1500);
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // 触发定时器检查（每秒检查一次）
      dateNowSpy.mockReturnValue(interactionTime + 2500);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲（因为从交互时间开始只过了 1.5 秒，未超过 3 秒延迟）
      expect(result.current.isIdle).toBe(false);
    });

    it('全局键盘按下应该重置空闲定时器', async () => {
      const startTime = 0;
      dateNowSpy.mockReturnValue(startTime);
      
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒
      dateNowSpy.mockReturnValue(startTime + 2000);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // 模拟键盘按下（这会重置lastInteractionTime）
      const interactionTime = startTime + 2000;
      dateNowSpy.mockReturnValue(interactionTime);
      await act(async () => {
        const keydownEvent = new Event('keydown');
        window.dispatchEvent(keydownEvent);
        // 等待状态更新
        vi.advanceTimersByTime(0);
      });

      // 再快进 1.5 秒（从交互时间开始，只过了 1.5 秒，未超过 3 秒延迟）
      dateNowSpy.mockReturnValue(interactionTime + 1500);
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // 触发定时器检查
      dateNowSpy.mockReturnValue(interactionTime + 2500);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲（因为从交互时间开始只过了 1.5 秒，未超过 3 秒延迟）
      expect(result.current.isIdle).toBe(false);
    });

    it('全局点击应该重置空闲定时器', async () => {
      const startTime = 0;
      dateNowSpy.mockReturnValue(startTime);
      
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒
      dateNowSpy.mockReturnValue(startTime + 2000);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // 模拟点击（这会重置lastInteractionTime）
      const interactionTime = startTime + 2000;
      dateNowSpy.mockReturnValue(interactionTime);
      await act(async () => {
        const clickEvent = new Event('click');
        window.dispatchEvent(clickEvent);
        // 等待状态更新
        vi.advanceTimersByTime(0);
      });

      // 再快进 1.5 秒（从交互时间开始，只过了 1.5 秒，未超过 3 秒延迟）
      dateNowSpy.mockReturnValue(interactionTime + 1500);
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // 触发定时器检查
      dateNowSpy.mockReturnValue(interactionTime + 2500);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲（因为从交互时间开始只过了 1.5 秒，未超过 3 秒延迟）
      expect(result.current.isIdle).toBe(false);
    });
  });

  describe('清理', () => {
    it('应该在卸载时清理事件监听器', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      unmount();

      // 应该移除事件监听器
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('应该在卸载时清理定时器', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const { unmount } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      unmount();

      // 应该清理定时器
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });
});

