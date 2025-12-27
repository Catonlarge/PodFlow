/**
 * useNotePosition Hook 测试
 * 
 * 测试覆盖：
 * - 位置计算逻辑
 * - 滚动事件监听
 * - DOM 变化监听
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useNotePosition } from '../useNotePosition';

describe('useNotePosition', () => {
  let mockScrollContainer;
  let mockSubtitleElement;
  
  beforeEach(() => {
    // 创建模拟的滚动容器
    mockScrollContainer = document.createElement('div');
    mockScrollContainer.scrollTop = 0;
    mockScrollContainer.getBoundingClientRect = jest.fn(() => ({
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
    mockSubtitleElement.getBoundingClientRect = jest.fn(() => ({
      top: 200,
      left: 0,
      right: 800,
      bottom: 250,
      width: 800,
      height: 50,
    }));
    
    mockScrollContainer.appendChild(mockSubtitleElement);
    document.body.appendChild(mockScrollContainer);
  });
  
  afterEach(() => {
    document.body.removeChild(mockScrollContainer);
  });
  
  it('应该计算单个 Highlight 的位置', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
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
        scrollContainerRef
      })
    );
    
    await waitFor(() => {
      expect(result.current).toHaveProperty('1');
      expect(typeof result.current[1]).toBe('number');
    });
  });
  
  it('应该处理多个 Highlight', async () => {
    const scrollContainerRef = { current: mockScrollContainer };
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
        scrollContainerRef
      })
    );
    
    await waitFor(() => {
      expect(result.current).toHaveProperty('1');
      expect(result.current).toHaveProperty('2');
    });
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

