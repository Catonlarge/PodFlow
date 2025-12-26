import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdle } from '../useIdle';

describe('useIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 初始状态非空闲
      expect(result.current.isIdle).toBe(false);

      // 快进 3 秒（刚好达到延迟时间）
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // 等待定时器检查（每秒检查一次）
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.isIdle).toBe(true);
      });
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
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 先让它变为空闲
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.isIdle).toBe(true);
      });

      // 重置空闲定时器
      await act(async () => {
        result.current.resetIdleTimer();
      });

      // 应该立即变为非空闲
      expect(result.current.isIdle).toBe(false);
    });

    it('全局鼠标移动应该重置空闲定时器', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // 模拟鼠标移动
      await act(async () => {
        const mousemoveEvent = new Event('mousemove');
        window.dispatchEvent(mousemoveEvent);
      });

      // 再快进 2 秒（总共 4 秒，但因为中间有交互，应该不会变为空闲）
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲（因为中间有交互）
      expect(result.current.isIdle).toBe(false);
    });

    it('全局键盘按下应该重置空闲定时器', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // 模拟键盘按下
      await act(async () => {
        const keydownEvent = new Event('keydown');
        window.dispatchEvent(keydownEvent);
      });

      // 再快进 2 秒
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲
      expect(result.current.isIdle).toBe(false);
    });

    it('全局点击应该重置空闲定时器', async () => {
      const { result } = renderHook(() => useIdle({ delay: 3000, enabled: true }));

      // 快进 2 秒
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // 模拟点击
      await act(async () => {
        const clickEvent = new Event('click');
        window.dispatchEvent(clickEvent);
      });

      // 再快进 2 秒
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 应该仍然非空闲
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

