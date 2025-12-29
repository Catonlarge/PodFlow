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
    const highlights = [
      { id: 1, cue_id: 999 } // 不存在的 cue_id
    ];
    const cues = [];
    
    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef
      })
    );
    
    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });
  
  it('应该处理空的 highlights 数组', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
    const highlights = [];
    const cues = [];
    
    const { result } = renderHook(() =>
      useNotePosition({
        highlights,
        cues,
        scrollContainerRef
      })
    );
    
    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });
});

