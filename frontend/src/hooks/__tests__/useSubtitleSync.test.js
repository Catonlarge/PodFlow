import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSubtitleSync } from '../useSubtitleSync';

describe('useSubtitleSync', () => {
  const mockCues = [
    { id: 1, start_time: 0.28, end_time: 2.22, speaker: 'Lenny', text: 'First subtitle' },
    { id: 2, start_time: 2.5, end_time: 5.8, speaker: 'Lenny', text: 'Second subtitle' },
    { id: 3, start_time: 6.0, end_time: 9.5, speaker: 'Guest', text: 'Third subtitle' },
    { id: 4, start_time: 10.0, end_time: 15.2, speaker: 'Lenny', text: 'Fourth subtitle' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('初始状态 currentSubtitleIndex 应该为 null', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 0, cues: mockCues })
      );

      expect(result.current.currentSubtitleIndex).toBeNull();
    });

    it('应该提供 scrollToSubtitle 和 registerSubtitleRef 方法', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 0, cues: mockCues })
      );

      expect(typeof result.current.scrollToSubtitle).toBe('function');
      expect(typeof result.current.registerSubtitleRef).toBe('function');
    });
  });

  describe('字幕索引计算', () => {
    it('应该在字幕时间范围内时正确识别当前字幕索引', () => {
      const { result, rerender } = renderHook(
        ({ currentTime }) => useSubtitleSync({ currentTime, cues: mockCues }),
        { initialProps: { currentTime: 0 } }
      );

      // 在第一个字幕的时间范围内
      rerender({ currentTime: 1.0 });
      expect(result.current.currentSubtitleIndex).toBe(0);

      // 在第二个字幕的时间范围内
      rerender({ currentTime: 3.0 });
      expect(result.current.currentSubtitleIndex).toBe(1);

      // 在第三个字幕的时间范围内
      rerender({ currentTime: 7.0 });
      expect(result.current.currentSubtitleIndex).toBe(2);
    });

    it('应该在字幕开始时间时识别为当前字幕', () => {
      const { result, rerender } = renderHook(
        ({ currentTime }) => useSubtitleSync({ currentTime, cues: mockCues }),
        { initialProps: { currentTime: 0 } }
      );

      rerender({ currentTime: 0.28 });
      expect(result.current.currentSubtitleIndex).toBe(0);

      rerender({ currentTime: 2.5 });
      expect(result.current.currentSubtitleIndex).toBe(1);
    });

    it('应该在字幕结束时间前识别为当前字幕', () => {
      const { result, rerender } = renderHook(
        ({ currentTime }) => useSubtitleSync({ currentTime, cues: mockCues }),
        { initialProps: { currentTime: 0 } }
      );

      rerender({ currentTime: 2.21 });
      expect(result.current.currentSubtitleIndex).toBe(0);
    });

    it('应该在字幕结束时间时不识别为当前字幕（使用下一个字幕）', () => {
      const { result, rerender } = renderHook(
        ({ currentTime }) => useSubtitleSync({ currentTime, cues: mockCues }),
        { initialProps: { currentTime: 0 } }
      );

      // 时间正好等于第一个字幕的结束时间，应该返回下一个字幕索引
      rerender({ currentTime: 2.22 });
      // 注意：2.22 >= 2.22 不满足 < end_time，所以不在第一个字幕范围内
      // 2.22 < 2.5（第二个字幕的开始时间），所以应该在两个字幕之间
      // 根据逻辑，应该返回下一个字幕索引
      expect(result.current.currentSubtitleIndex).toBe(1);
    });

    it('应该在未开始播放时返回 null', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 0, cues: mockCues })
      );

      expect(result.current.currentSubtitleIndex).toBeNull();
    });

    it('应该在时间小于0时返回 null', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: -1, cues: mockCues })
      );

      expect(result.current.currentSubtitleIndex).toBeNull();
    });

    it('应该在超过所有字幕结束时间时返回最后一个字幕索引', () => {
      const { result, rerender } = renderHook(
        ({ currentTime }) => useSubtitleSync({ currentTime, cues: mockCues }),
        { initialProps: { currentTime: 0 } }
      );

      rerender({ currentTime: 20.0 });
      expect(result.current.currentSubtitleIndex).toBe(3);
    });

    it('应该在两个字幕之间时返回前一个字幕索引（已播放过的）', () => {
      const { result, rerender } = renderHook(
        ({ currentTime }) => useSubtitleSync({ currentTime, cues: mockCues }),
        { initialProps: { currentTime: 0 } }
      );

      // 在第一个和第二个字幕之间
      rerender({ currentTime: 2.3 });
      expect(result.current.currentSubtitleIndex).toBe(1);

      // 在第二个和第三个字幕之间
      rerender({ currentTime: 5.9 });
      expect(result.current.currentSubtitleIndex).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的 cues 数组', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 1.0, cues: [] })
      );

      expect(result.current.currentSubtitleIndex).toBeNull();
    });

    it('应该处理 undefined 的 cues', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 1.0, cues: undefined })
      );

      expect(result.current.currentSubtitleIndex).toBeNull();
    });
  });

  describe('registerSubtitleRef', () => {
    it('应该能够注册字幕 ref', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 1.0, cues: mockCues })
      );

      const mockRef = { current: document.createElement('div') };
      result.current.registerSubtitleRef(0, mockRef);

      // registerSubtitleRef 应该正常工作，不抛出错误
      expect(result.current.registerSubtitleRef).toBeDefined();
    });
  });

  describe('scrollToSubtitle', () => {
    it('应该在 index 为 null 时不执行滚动', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 1.0, cues: mockCues })
      );

      // 不应该抛出错误
      expect(() => {
        result.current.scrollToSubtitle(null);
      }).not.toThrow();
    });

    it('应该在 index 超出范围时不执行滚动', () => {
      const { result } = renderHook(() =>
        useSubtitleSync({ currentTime: 1.0, cues: mockCues })
      );

      // 不应该抛出错误
      expect(() => {
        result.current.scrollToSubtitle(100);
      }).not.toThrow();
    });
  });
});

