/**
 * useNotePosition Hook 测试
 * 
 * 测试覆盖：
 * - 位置计算逻辑
 * - 滚动事件监听
 * - DOM 变化监听
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNotePosition } from '../useNotePosition';

describe('useNotePosition', () => {
  let mockScrollContainer;
  let mockSubtitleElement;
  let mockNoteSidebar;
  let mockNoteContentContainer;
  
  beforeEach(() => {
    // 创建模拟的滚动容器
    mockScrollContainer = document.createElement('div');
    mockScrollContainer.scrollTop = 0;
    // 设置默认的 scrollHeight（使用 Object.defineProperty 因为 scrollHeight 是只读的）
    Object.defineProperty(mockScrollContainer, 'scrollHeight', {
      value: 10000,
      writable: true,
      configurable: true
    });
    mockScrollContainer.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 500,
    }));
    
    // 创建模拟的字幕元素
    mockSubtitleElement = document.createElement('div');
    mockSubtitleElement.setAttribute('data-subtitle-id', '1');
    mockSubtitleElement.getBoundingClientRect = vi.fn(() => ({
      top: 200,
      left: 0,
      right: 800,
      bottom: 250,
      width: 800,
      height: 50,
    }));
    
    mockScrollContainer.appendChild(mockSubtitleElement);
    document.body.appendChild(mockScrollContainer);
    
    // 创建模拟的笔记侧边栏容器
    mockNoteSidebar = document.createElement('div');
    mockNoteContentContainer = document.createElement('div');
    mockNoteContentContainer.setAttribute('data-testid', 'note-sidebar-content');
    mockNoteContentContainer.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 800,
      right: 1200,
      bottom: 600,
      width: 400,
      height: 500,
    }));
    mockNoteSidebar.appendChild(mockNoteContentContainer);
    document.body.appendChild(mockNoteSidebar);
  });
  
  afterEach(() => {
    // 清理 DOM
    if (mockScrollContainer && mockScrollContainer.parentNode) {
      mockScrollContainer.parentNode.removeChild(mockScrollContainer);
    }
    if (mockNoteSidebar && mockNoteSidebar.parentNode) {
      mockNoteSidebar.parentNode.removeChild(mockNoteSidebar);
    }
    vi.clearAllMocks();
  });
  
  it('应该计算单个 Highlight 的位置', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };
    const highlights = [
      { id: 1, cue_id: 1 }
    ];
    const cues = [
      { id: 1, start_time: 0.0 }
    ];
    
    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );
    
    await waitFor(() => {
      expect(result.current).toHaveProperty('1');
      expect(typeof result.current[1]).toBe('number');
    }, { timeout: 2000 });
  });
  
  it('应该处理多个 Highlight', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };
    const highlights = [
      { id: 1, cue_id: 1 },
      { id: 2, cue_id: 1 }
    ];
    const cues = [
      { id: 1, start_time: 0.0 }
    ];
    
    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );
    
    await waitFor(() => {
      expect(result.current).toHaveProperty('1');
      expect(result.current).toHaveProperty('2');
    }, { timeout: 2000 });
  });
  
  it('应该处理找不到字幕元素的情况', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };
    const highlights = [
      { id: 1, cue_id: 999 } // 不存在的 cue_id
    ];
    const cues = [];

    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );

    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });
  
  it('应该处理空的 highlights 数组', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };
    const highlights = [];
    const cues = [];

    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );

    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });

  it('应该处理长篇内容中的位置值（超过旧的 10000 限制）', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };

    // 模拟长篇内容的滚动容器（scrollHeight 足够大）
    Object.defineProperty(mockScrollContainer, 'scrollHeight', {
      value: 15000,
      writable: true,
      configurable: true
    });

    // 创建模拟的字幕元素，位置超过旧的 10000 限制
    const longContentElement = document.createElement('div');
    longContentElement.setAttribute('data-subtitle-id', '393');
    longContentElement.getBoundingClientRect = vi.fn(() => ({
      top: 10922,
      left: 0,
      right: 800,
      bottom: 10972,
      width: 800,
      height: 50,
    }));
    mockScrollContainer.appendChild(longContentElement);

    const highlights = [
      { id: 36, cue_id: 393 }
    ];
    const cues = [
      { id: 393, start_time: 489.0 }
    ];

    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );

    await waitFor(() => {
      expect(result.current).toHaveProperty('36');
      // 应该接受超过 10000 的位置值（在 scrollHeight * 2 范围内）
      expect(result.current[36]).toBe(10822);
    }, { timeout: 2000 });
  });

  it('应该拒绝负数的位置值', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };

    // 创建模拟的字幕元素，产生负数位置
    const negativeElement = document.createElement('div');
    negativeElement.setAttribute('data-subtitle-id', '999');
    negativeElement.getBoundingClientRect = vi.fn(() => ({
      top: -200,
      left: 0,
      right: 800,
      bottom: -150,
      width: 800,
      height: 50,
    }));
    mockScrollContainer.appendChild(negativeElement);

    const highlights = [
      { id: 99, cue_id: 999 }
    ];
    const cues = [
      { id: 999, start_time: 0.0 }
    ];

    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );

    await waitFor(() => {
      // 负数位置应该被拒绝，结果应该为空对象
      expect(result.current).toEqual({});
    }, { timeout: 2000 });
  });

  it('应该拒绝超过 scrollHeight 2 倍的位置值', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const noteSidebarRef = { current: mockNoteSidebar };

    // 模拟较小的滚动容器
    Object.defineProperty(mockScrollContainer, 'scrollHeight', {
      value: 5000,
      writable: true,
      configurable: true
    });

    // 创建模拟的字幕元素，位置超过 scrollHeight * 2
    const overflowElement = document.createElement('div');
    overflowElement.setAttribute('data-subtitle-id', '888');
    overflowElement.getBoundingClientRect = vi.fn(() => ({
      top: 15000,
      left: 0,
      right: 800,
      bottom: 15050,
      width: 800,
      height: 50,
    }));
    mockScrollContainer.appendChild(overflowElement);

    const highlights = [
      { id: 88, cue_id: 888 }
    ];
    const cues = [
      { id: 888, start_time: 0.0 }
    ];

    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef,
        noteSidebarRef
      })
    );

    await waitFor(() => {
      // 超过 scrollHeight * 2 的位置应该被拒绝
      expect(result.current).toEqual({});
    }, { timeout: 2000 });
  });
});

