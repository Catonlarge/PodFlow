import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import { useTextSelection } from '../useTextSelection';

describe('useTextSelection', () => {
  const mockCues = [
    { id: 1, start_time: 0.28, end_time: 2.22, speaker: 'Lenny', text: 'First subtitle text' },
    { id: 2, start_time: 2.5, end_time: 5.8, speaker: 'Lenny', text: 'Second subtitle text' },
    { id: 3, start_time: 6.0, end_time: 9.5, speaker: 'Guest', text: 'Third subtitle text' },
    { id: 4, start_time: 10.0, end_time: 15.2, speaker: 'Lenny', text: 'Fourth subtitle text' },
  ];

  let containerRef;
  let mockSelection;
  let mockRange;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 创建容器引用
    containerRef = { current: document.createElement('div') };
    document.body.appendChild(containerRef.current);

    // Mock window.getSelection()
    mockSelection = {
      rangeCount: 0,
      getRangeAt: vi.fn(),
      removeAllRanges: vi.fn(),
      toString: vi.fn(() => ''),
    };
    global.window.getSelection = vi.fn(() => mockSelection);

    // Mock Range
    mockRange = {
      startContainer: null,
      endContainer: null,
      startOffset: 0,
      endOffset: 0,
      commonAncestorContainer: null,
      cloneContents: vi.fn(),
    };
  });

  afterEach(() => {
    // 清理 DOM
    if (containerRef.current && containerRef.current.parentNode) {
      containerRef.current.parentNode.removeChild(containerRef.current);
    }
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('初始状态应该为空选择', () => {
      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      expect(result.current.selectedText).toBeNull();
      expect(result.current.selectionRange).toBeNull();
      expect(result.current.affectedCues).toEqual([]);
      expect(typeof result.current.clearSelection).toBe('function');
    });

    it('应该提供 clearSelection 方法', () => {
      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      expect(typeof result.current.clearSelection).toBe('function');
    });
  });

  describe('单 cue 文本选择', () => {
    it('应该在单个 cue 内选择文本时正确计算状态', async () => {
      // 创建测试 DOM 结构
      const cueElement = document.createElement('div');
      cueElement.setAttribute('data-subtitle-id', '1');
      const textNode = document.createTextNode('First subtitle text');
      cueElement.appendChild(textNode);
      containerRef.current.appendChild(cueElement);

      // Mock selection
      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'First subtitle');
      mockRange.startContainer = textNode;
      mockRange.endContainer = textNode;
      mockRange.startOffset = 0;
      mockRange.endOffset = 15; // "First subtitle"
      mockRange.commonAncestorContainer = cueElement;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      // 模拟 mouseup 事件
      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      // 验证状态
      expect(result.current.selectedText).toBe('First subtitle');
      expect(result.current.affectedCues).toHaveLength(1);
      expect(result.current.affectedCues[0].cue.id).toBe(1);
      expect(result.current.affectedCues[0].startOffset).toBe(0);
      expect(result.current.affectedCues[0].endOffset).toBe(15);
      expect(result.current.affectedCues[0].selectedText).toBe('First subtitle');
    });

    it('应该在单个 cue 内选择部分文本时正确计算偏移量', async () => {
      const cueElement = document.createElement('div');
      cueElement.setAttribute('data-subtitle-id', '1');
      const textNode = document.createTextNode('First subtitle text');
      cueElement.appendChild(textNode);
      containerRef.current.appendChild(cueElement);

      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'subtitle');
      mockRange.startContainer = textNode;
      mockRange.endContainer = textNode;
      mockRange.startOffset = 6; // "First " 之后
      mockRange.endOffset = 15; // "First subtitle"
      mockRange.commonAncestorContainer = cueElement;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      expect(result.current.affectedCues[0].startOffset).toBe(6);
      expect(result.current.affectedCues[0].endOffset).toBe(15);
      expect(result.current.affectedCues[0].selectedText).toBe('subtitle');
    });
  });

  describe('跨 cue 文本选择', () => {
    it('应该在跨多个 cues 选择文本时自动拆分成多个 affectedCues', async () => {
      // 创建多个 cue 元素
      const cueElement1 = document.createElement('div');
      cueElement1.setAttribute('data-subtitle-id', '1');
      const textNode1 = document.createTextNode('First subtitle text');
      cueElement1.appendChild(textNode1);
      containerRef.current.appendChild(cueElement1);

      const cueElement2 = document.createElement('div');
      cueElement2.setAttribute('data-subtitle-id', '2');
      const textNode2 = document.createTextNode('Second subtitle text');
      cueElement2.appendChild(textNode2);
      containerRef.current.appendChild(cueElement2);

      // Mock 跨 cue 选择
      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'First subtitle text Second subtitle');
      mockRange.startContainer = textNode1;
      mockRange.endContainer = textNode2;
      mockRange.startOffset = 6; // 从 "First " 之后开始
      mockRange.endOffset = 14; // "Second subtitle"
      mockRange.commonAncestorContainer = containerRef.current;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      // 验证跨 cue 拆分
      expect(result.current.affectedCues.length).toBeGreaterThan(1);
      // 第一个 cue 应该从偏移量 6 开始
      const firstCue = result.current.affectedCues.find(c => c.cue.id === 1);
      expect(firstCue.startOffset).toBe(6);
      expect(firstCue.endOffset).toBe(mockCues[0].text.length); // 选到第一个 cue 的结尾
      // 最后一个 cue 应该从偏移量 0 开始，到偏移量 14 结束
      const lastCue = result.current.affectedCues.find(c => c.cue.id === 2);
      expect(lastCue.startOffset).toBe(0);
      expect(lastCue.endOffset).toBe(14);
    });

    it('应该在跨三个 cues 选择时正确拆分所有 cues', async () => {
      const cueElement1 = document.createElement('div');
      cueElement1.setAttribute('data-subtitle-id', '1');
      cueElement1.appendChild(document.createTextNode('First subtitle text'));
      containerRef.current.appendChild(cueElement1);

      const cueElement2 = document.createElement('div');
      cueElement2.setAttribute('data-subtitle-id', '2');
      cueElement2.appendChild(document.createTextNode('Second subtitle text'));
      containerRef.current.appendChild(cueElement2);

      const cueElement3 = document.createElement('div');
      cueElement3.setAttribute('data-subtitle-id', '3');
      cueElement3.appendChild(document.createTextNode('Third subtitle text'));
      containerRef.current.appendChild(cueElement3);

      const textNode1 = cueElement1.firstChild;
      const textNode3 = cueElement3.firstChild;

      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'First Second Third');
      mockRange.startContainer = textNode1;
      mockRange.endContainer = textNode3;
      mockRange.startOffset = 0;
      mockRange.endOffset = 19; // "Third subtitle text"
      mockRange.commonAncestorContainer = containerRef.current;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      expect(result.current.affectedCues.length).toBe(3);
      expect(result.current.affectedCues[0].cue.id).toBe(1);
      expect(result.current.affectedCues[1].cue.id).toBe(2);
      expect(result.current.affectedCues[2].cue.id).toBe(3);
      // 中间 cue 应该完整选择
      expect(result.current.affectedCues[1].startOffset).toBe(0);
      expect(result.current.affectedCues[1].endOffset).toBe(mockCues[1].text.length);
    });
  });

  describe('清除选择', () => {
    it('应该清除选择状态当调用 clearSelection 时', async () => {
      const cueElement = document.createElement('div');
      cueElement.setAttribute('data-subtitle-id', '1');
      const textNode = document.createTextNode('First subtitle text');
      cueElement.appendChild(textNode);
      containerRef.current.appendChild(cueElement);

      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'First subtitle');
      mockRange.startContainer = textNode;
      mockRange.endContainer = textNode;
      mockRange.startOffset = 0;
      mockRange.endOffset = 15;
      mockRange.commonAncestorContainer = cueElement;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      // 先触发选择
      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      expect(result.current.selectedText).not.toBeNull();

      // 清除选择
      await act(async () => {
        result.current.clearSelection();
      });

      expect(result.current.selectedText).toBeNull();
      expect(result.current.selectionRange).toBeNull();
      expect(result.current.affectedCues).toEqual([]);
      expect(mockSelection.removeAllRanges).toHaveBeenCalled();
    });
  });

  describe('边界情况', () => {
    it('应该忽略空选择（rangeCount 为 0）', async () => {
      mockSelection.rangeCount = 0;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      expect(result.current.selectedText).toBeNull();
      expect(result.current.affectedCues).toEqual([]);
    });

    it('应该忽略选择范围在容器外的情况', async () => {
      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);
      const textNode = document.createTextNode('Outside text');
      outsideElement.appendChild(textNode);

      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'Outside text');
      mockRange.startContainer = textNode;
      mockRange.endContainer = textNode;
      mockRange.startOffset = 0;
      mockRange.endOffset = 11;
      mockRange.commonAncestorContainer = outsideElement;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        document.body.dispatchEvent(event);
      });

      expect(result.current.selectedText).toBeNull();
      expect(result.current.affectedCues).toEqual([]);

      document.body.removeChild(outsideElement);
    });

    it('应该在 enabled 为 false 时不监听选择事件', async () => {
      const cueElement = document.createElement('div');
      cueElement.setAttribute('data-subtitle-id', '1');
      const textNode = document.createTextNode('First subtitle text');
      cueElement.appendChild(textNode);
      containerRef.current.appendChild(cueElement);

      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'First subtitle');
      mockRange.startContainer = textNode;
      mockRange.endContainer = textNode;
      mockRange.startOffset = 0;
      mockRange.endOffset = 15;
      mockRange.commonAncestorContainer = cueElement;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef, enabled: false })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      expect(result.current.selectedText).toBeNull();
      expect(result.current.affectedCues).toEqual([]);
    });

    it('应该在 cues 为空数组时正常处理', () => {
      const { result } = renderHook(() =>
        useTextSelection({ cues: [], containerRef })
      );

      expect(result.current.selectedText).toBeNull();
      expect(result.current.affectedCues).toEqual([]);
    });
  });

  describe('选择范围计算', () => {
    it('应该正确计算 selectionRange 信息', async () => {
      const cueElement = document.createElement('div');
      cueElement.setAttribute('data-subtitle-id', '1');
      const textNode = document.createTextNode('First subtitle text');
      cueElement.appendChild(textNode);
      containerRef.current.appendChild(cueElement);

      mockSelection.rangeCount = 1;
      mockSelection.getRangeAt = vi.fn(() => mockRange);
      mockSelection.toString = vi.fn(() => 'First subtitle');
      mockRange.startContainer = textNode;
      mockRange.endContainer = textNode;
      mockRange.startOffset = 0;
      mockRange.endOffset = 15;
      mockRange.commonAncestorContainer = cueElement;

      const { result } = renderHook(() =>
        useTextSelection({ cues: mockCues, containerRef })
      );

      await act(async () => {
        const event = new MouseEvent('mouseup', { bubbles: true });
        containerRef.current.dispatchEvent(event);
      });

      expect(result.current.selectionRange).not.toBeNull();
      expect(result.current.selectionRange.startCueId).toBe(1);
      expect(result.current.selectionRange.endCueId).toBe(1);
      expect(result.current.selectionRange.startOffset).toBe(0);
      expect(result.current.selectionRange.endOffset).toBe(15);
    });
  });
});
