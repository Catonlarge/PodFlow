import { useState, useEffect, useCallback } from 'react';

/**
 * useTextSelection Hook
 * 
 * 功能描述：
 * - 监听鼠标事件，实现跨段落文本选择（划线功能）
 * - 处理文本选择状态管理
 * - 返回选中文本的起始和结束位置
 * 
 * 注意：
 * - 此Hook负责逻辑实现（监听鼠标事件，处理文本选择）
 * - UI组件（如SubtitleRow）只负责根据Hook返回的状态改变背景色，实现"隐形"的划线效果
 * - 不创建单独的TextSelector组件，因为跨段落划线逻辑无法用UI组件包裹实现
 * 
 * 相关PRD：
 * - PRD 6.2.4.b: 划线操作
 * 
 * @module hooks/useTextSelection
 * 
 * @param {Object} options
 * @param {Array} options.cues - 字幕数组
 * @param {React.RefObject} options.containerRef - 字幕容器引用（用于限制选择范围）
 * @param {boolean} [options.enabled=true] - 是否启用文本选择
 * 
 * @returns {Object} Hook 返回值
 * @returns {string|null} returns.selectedText - 选中的文本内容
 * @returns {Object|null} returns.selectionRange - 选择范围信息 { startCueId, endCueId, startOffset, endOffset }
 * @returns {Array} returns.affectedCues - 受影响的 cues 列表（已拆分）
 * @returns {Function} returns.clearSelection - 清除选择的方法
 */
export function useTextSelection({ cues = [], containerRef, enabled = true }) {
  const [selectedText, setSelectedText] = useState(null);
  const [selectionRange, setSelectionRange] = useState(null);
  const [affectedCues, setAffectedCues] = useState([]);

  /**
   * 查找包含指定节点的 cue 元素
   * @param {Node} node - DOM 节点
   * @returns {HTMLElement|null} cue 元素
   */
  const findCueElement = useCallback((node) => {
    let current = node;
    while (current && current !== document.body) {
      if (current.nodeType === Node.ELEMENT_NODE && current.dataset && current.dataset.subtitleId) {
        return current;
      }
      current = current.parentElement || current.parentNode;
    }
    return null;
  }, []);

  /**
   * 检查节点是否在容器内
   * @param {Node} node - DOM 节点
   * @param {HTMLElement} container - 容器元素
   * @returns {boolean}
   */
  const isNodeInContainer = useCallback((node, container) => {
    if (!container) return false;
    let current = node;
    while (current && current !== document.body) {
      if (current === container) {
        return true;
      }
      current = current.parentElement || current.parentNode;
    }
    return false;
  }, []);

  /**
   * 计算文本节点在 cue 文本中的偏移量
   * 需要找到 cue 元素内的文本容器，然后计算文本节点相对于文本容器的偏移
   * @param {Node} textNode - 文本节点
   * @param {HTMLElement} cueElement - cue 元素
   * @param {number} nodeOffset - 在文本节点中的偏移量
   * @returns {number} 在 cue 文本中的偏移量
   */
  const calculateOffsetInCue = useCallback((textNode, cueElement, nodeOffset) => {
    if (!textNode || !cueElement) return 0;

    // 如果 textNode 是文本节点，直接计算其前面的文本长度
    if (textNode.nodeType === Node.TEXT_NODE) {
      // 遍历 cue 元素内的所有文本节点，累加前面的文本长度
      const walker = document.createTreeWalker(
        cueElement,
        NodeFilter.SHOW_TEXT,
        null
      );

      let offset = 0;
      let node = walker.nextNode();
      while (node) {
        if (node === textNode) {
          // 找到目标文本节点，加上节点内的偏移
          return offset + nodeOffset;
        }
        offset += node.textContent.length;
        node = walker.nextNode();
      }
    }

    // 如果 textNode 是元素节点，需要找到其内的第一个文本节点
    // 这种情况在实际使用中较少见，但为了健壮性还是处理一下
    const walker = document.createTreeWalker(
      cueElement,
      NodeFilter.SHOW_TEXT,
      null
    );

    let offset = 0;
    let node = walker.nextNode();
    while (node) {
      // 检查 node 是否是 textNode 或其子节点
      if (textNode.contains && textNode.contains(node)) {
        // textNode 是元素节点，包含这个文本节点
        // 计算从 cue 开始到这个文本节点的偏移
        return offset + nodeOffset;
      }
      if (node === textNode || (node.parentNode && textNode.contains && textNode.contains(node.parentNode))) {
        return offset + nodeOffset;
      }
      offset += node.textContent.length;
      node = walker.nextNode();
    }

    // 如果没找到，返回 nodeOffset（至少返回选择在节点内的偏移）
    return nodeOffset;
  }, []);

  /**
   * 获取 cue 元素内的所有文本内容
   * @param {HTMLElement} cueElement - cue 元素
   * @returns {string} cue 的文本内容
   */
  const getCueText = useCallback((cueElement) => {
    if (!cueElement) return '';
    const walker = document.createTreeWalker(
      cueElement,
      NodeFilter.SHOW_TEXT,
      null
    );
    let text = '';
    let node = walker.nextNode();
    while (node) {
      text += node.textContent;
      node = walker.nextNode();
    }
    return text;
  }, []);

  /**
   * 处理文本选择
   */
  const handleSelection = useCallback(() => {
    if (!enabled) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectedText(null);
      setSelectionRange(null);
      setAffectedCues([]);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedTextContent = selection.toString();
    
    // 检查是否为空选择（去除首尾空格后）
    if (!selectedTextContent || !selectedTextContent.trim()) {
      setSelectedText(null);
      setSelectionRange(null);
      setAffectedCues([]);
      return;
    }

    // 使用 trim 后的文本作为 selectedText（去除首尾空格）
    const trimmedSelectedText = selectedTextContent.trim();

    // 检查选择范围是否在容器内
    if (containerRef?.current && !isNodeInContainer(range.commonAncestorContainer, containerRef.current)) {
      setSelectedText(null);
      setSelectionRange(null);
      setAffectedCues([]);
      return;
    }

    const startCueElement = findCueElement(range.startContainer);
    const endCueElement = findCueElement(range.endContainer);

    if (!startCueElement || !endCueElement) {
      setSelectedText(null);
      setSelectionRange(null);
      setAffectedCues([]);
      return;
    }

    const startCueId = parseInt(startCueElement.dataset.subtitleId, 10);
    const endCueId = parseInt(endCueElement.dataset.subtitleId, 10);
    
    // 找到对应的 cue 对象
    const startCue = cues.find(c => c.id === startCueId);
    const endCue = cues.find(c => c.id === endCueId);

    if (!startCue || !endCue) {
      setSelectedText(null);
      setSelectionRange(null);
      setAffectedCues([]);
      return;
    }

    // 计算偏移量
    const startOffset = calculateOffsetInCue(range.startContainer, startCueElement, range.startOffset);
    const endOffset = calculateOffsetInCue(range.endContainer, endCueElement, range.endOffset);

    // 设置 selectionRange
    setSelectionRange({
      startCueId,
      endCueId,
      startOffset,
      endOffset,
    });

    // 处理单 cue 或跨 cue 选择
    const newAffectedCues = [];
    if (startCueId === endCueId) {
      // 单 cue 选择
      const selectedTextInCue = startCue.text.substring(startOffset, endOffset).trim();
      newAffectedCues.push({
        cue: startCue,
        startOffset,
        endOffset,
        selectedText: selectedTextInCue,
      });
    } else {
      // 跨 cue 选择：需要拆分
      // 找到所有受影响的 cues（按时间顺序）
      const startCueIndex = cues.findIndex(c => c.id === startCueId);
      const endCueIndex = cues.findIndex(c => c.id === endCueId);
      
      if (startCueIndex !== -1 && endCueIndex !== -1 && startCueIndex <= endCueIndex) {
        for (let i = startCueIndex; i <= endCueIndex; i++) {
          const cue = cues[i];
          let cueStartOffset = 0;
          let cueEndOffset = cue.text.length;

          if (i === startCueIndex) {
            // 第一个 cue：从 startOffset 开始
            cueStartOffset = startOffset;
          }

          if (i === endCueIndex) {
            // 最后一个 cue：到 endOffset 结束
            cueEndOffset = endOffset;
          }

          const selectedTextInCue = cue.text.substring(cueStartOffset, cueEndOffset).trim();
          newAffectedCues.push({
            cue,
            startOffset: cueStartOffset,
            endOffset: cueEndOffset,
            selectedText: selectedTextInCue,
          });
        }
      }
    }

    setAffectedCues(newAffectedCues);
    setSelectedText(trimmedSelectedText);
  }, [enabled, containerRef, cues, findCueElement, isNodeInContainer, calculateOffsetInCue]);

  /**
   * 清除选择
   */
  const clearSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    setSelectedText(null);
    setSelectionRange(null);
    setAffectedCues([]);
  }, []);

  // 监听 mouseup 事件
  useEffect(() => {
    if (!enabled) return;

    const handleMouseUp = () => {
      handleSelection();
    };

    const container = containerRef?.current || document;
    container.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
    };
  }, [enabled, containerRef, handleSelection]);

  return {
    selectedText,
    selectionRange,
    affectedCues,
    clearSelection,
  };
}