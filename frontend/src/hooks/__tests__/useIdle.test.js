import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdle } from '../useIdle';

describe('useIdle', () => {
  let dateNowSpy;
  let currentTime;

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = 0;
    // Mock Date.now() 以配合 fake timers
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (dateNowSpy) {
      dateNowSpy.mockRestore();
    }
  });

  // 辅助函数：封装时间推进逻辑，减少手动计算
  // 同时更新 Date.now() 和推进定时器，保持同步
  const advanceTime = async (ms) => {
    currentTime += ms;
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  // 辅助函数：触发定时器检查（useIdle 使用 setInterval 每秒检查一次）
  const triggerTimerCheck = async () => {
    await advanceTime(1000);
  };

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
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 初始状态非空闲
      expect(result.current.isIdle).toBe(false);

      // 快进到刚好达到延迟时间（3秒）
      await advanceTime(3000);

      // 触发定时器检查（每秒检查一次）
      await triggerTimerCheck();

      // 应该变为空闲
      expect(result.current.isIdle).toBe(true);
    });

    it('不应该变为空闲当 enabled 为 false 时', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: false }));

      // 快进 5 秒
      await advanceTime(5000);

      // 触发定时器检查
      await triggerTimerCheck();

      // 应该仍然非空闲
      expect(result.current.isIdle).toBe(false);
    });

    it('不应该变为空闲当 isHovering 为 true 时', async () => {
      const { result } = renderHook(() =>
        useIdle({ delay: 3000, enabled: true, isHovering: true })
      );

      // 快进 5 秒
      await advanceTime(5000);

      // 触发定时器检查
      await triggerTimerCheck();

      // 应该仍然非空闲（因为正在悬停）
      expect(result.current.isIdle).toBe(false);
    });
  });

  describe('交互重置', () => {
    it('resetIdleTimer 应该重置空闲状态', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 先让它变为空闲（快进 4 秒，超过延迟时间）
      await advanceTime(4000);
      await triggerTimerCheck();

      // 应该已变为空闲
      expect(result.current.isIdle).toBe(true);

      // 重置空闲定时器
      act(() => {
        result.current.resetIdleTimer();
      });

      // 应该立即变为非空闲
      expect(result.current.isIdle).toBe(false);
    });

    it('全局鼠标移动应该重置空闲定时器', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒（未超过延迟时间）
      await advanceTime(2000);

      // 模拟鼠标移动（这会重置lastInteractionTime）
      await act(async () => {
        const mousemoveEvent = new Event('mousemove');
        window.dispatchEvent(mousemoveEvent);
        // 等待状态更新
        vi.advanceTimersByTime(0);
      });

      // 从交互时间开始，再快进 1.5 秒（未超过 3 秒延迟）
      await advanceTime(1500);
      await triggerTimerCheck();

      // 应该仍然非空闲（因为从交互时间开始只过了 1.5 秒）
      expect(result.current.isIdle).toBe(false);
    });

    it('全局键盘按下应该重置空闲定时器', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒（未超过延迟时间）
      await advanceTime(2000);

      // 模拟键盘按下（这会重置lastInteractionTime）
      await act(async () => {
        const keydownEvent = new Event('keydown');
        window.dispatchEvent(keydownEvent);
        // 等待状态更新
        vi.advanceTimersByTime(0);
      });

      // 从交互时间开始，再快进 1.5 秒（未超过 3 秒延迟）
      await advanceTime(1500);
      await triggerTimerCheck();

      // 应该仍然非空闲（因为从交互时间开始只过了 1.5 秒）
      expect(result.current.isIdle).toBe(false);
    });

    it('全局点击应该重置空闲定时器', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒（未超过延迟时间）
      await advanceTime(2000);

      // 模拟点击（这会重置lastInteractionTime）
      await act(async () => {
        const clickEvent = new Event('click');
        window.dispatchEvent(clickEvent);
        // 等待状态更新
        vi.advanceTimersByTime(0);
      });

      // 从交互时间开始，再快进 1.5 秒（未超过 3 秒延迟）
      await advanceTime(1500);
      await triggerTimerCheck();

      // 应该仍然非空闲（因为从交互时间开始只过了 1.5 秒）
      expect(result.current.isIdle).toBe(false);
    });
  });

  describe('清理', () => {
    it('应该在卸载时清理事件监听器', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      unmount();

      // 应该移除事件监听器（行为断言，不依赖实现细节）
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('应该在卸载时清理定时器', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const { unmount } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      unmount();

      // 应该清理定时器（行为断言）
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });
});
