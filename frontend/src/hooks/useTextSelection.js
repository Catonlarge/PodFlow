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
   * 
   * 使用 document.createRange() 让浏览器精确计算字符数，避免在复杂 DOM 结构中数错
   * 这相当于问浏览器："从开头到鼠标现在的位置，视觉上一共有多少个字符？"
   * 浏览器给出的答案非常精准，不会因为 DOM 嵌套层级而漂移
   * 
   * @param {Node} textNode - 文本节点
   * @param {HTMLElement} cueElement - cue 元素
   * @param {number} nodeOffset - 在文本节点中的偏移量
   * @returns {number} 在 cue 文本中的偏移量
   */
  const calculateOffsetInCue = useCallback((textNode, cueElement, nodeOffset) => {
    if (!textNode || !cueElement) return 0;

    try {
      // 创建一个 Range，从 cue 元素开头到目标位置
      const range = document.createRange();
      
      // 设置 Range 的起点为 cue 元素的开头
      range.setStart(cueElement, 0);
      
      // 设置 Range 的终点为选中的位置
      range.setEnd(textNode, nodeOffset);
      
      // 使用 toString().length 让浏览器精确计算字符数
      // 这比手动遍历 DOM 节点更准确，特别是在复杂的 UI 结构中
      const offset = range.toString().length;
      
      return offset;
    } catch (error) {
      // 如果 createRange 失败，回退到原始方法
      console.warn('[useTextSelection] calculateOffsetInCue failed, using fallback:', error);
      return nodeOffset;
    }
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
    // 注意：由于 SubtitleRow 将文本拆分成多个单词，DOM 结构可能和原始文本不完全一致
    // 我们需要通过原始文本和选中的文本来更准确地计算偏移量
    let startOffset = calculateOffsetInCue(range.startContainer, startCueElement, range.startOffset);
    let endOffset = calculateOffsetInCue(range.endContainer, endCueElement, range.endOffset);
    
    // 调试信息：输出选中的文本和初始计算的偏移量
    console.log('[useTextSelection] 调试信息:', {
      selectedTextContent: JSON.stringify(selectedTextContent),
      selectedTextContentLength: selectedTextContent.length,
      trimmedSelectedText: JSON.stringify(trimmedSelectedText),
      startCueId,
      endCueId,
      initialStartOffset: startOffset,
      initialEndOffset: endOffset,
      startCueText: startCue.text,
      calculatedText: startCue.text.substring(startOffset, endOffset),
    });

    // 补全首尾空格：确保选中范围包含完整的空格信息
    // 即使计算过程中用 trim 过的文本去定位，最后也要把空格加回 startOffset 和 endOffset
    if (startCueId === endCueId) {
      // 单 cue 选择：补全 leadingSpaces 和 trailingSpaces
      const actualSelectedText = selectedTextContent.trim();
      const calculatedText = startCue.text.substring(startOffset, endOffset).trim();
      
      // 如果计算出的文本和实际选中的文本不匹配，尝试在原始文本中查找
      if (calculatedText !== actualSelectedText && actualSelectedText.length > 0) {
        // 在原始文本中查找选中的文本
        const globalIndex = startCue.text.indexOf(actualSelectedText);
        if (globalIndex !== -1) {
          startOffset = globalIndex;
          endOffset = globalIndex + actualSelectedText.length;
        }
      }
      
      // 补全前导空格（leadingSpaces）
      // 检查原始选中文本（selectedTextContent）是否包含前导空格
      let leadingSpaces = 0;
      for (let i = 0; i < selectedTextContent.length; i++) {
        if (selectedTextContent[i] === ' ') {
          leadingSpaces++;
        } else {
          break;
        }
      }
      
      // 向前扩展以包含前导空格
      while (leadingSpaces > 0 && startOffset > 0 && startCue.text[startOffset - 1] === ' ') {
        startOffset--;
        leadingSpaces--;
      }
      
      // 补全尾随空格（trailingSpaces）
      // 检查原始选中文本（selectedTextContent）是否包含尾随空格
      let trailingSpaces = 0;
      for (let i = selectedTextContent.length - 1; i >= 0; i--) {
        if (selectedTextContent[i] === ' ') {
          trailingSpaces++;
        } else {
          break;
        }
      }
      
      // 向后扩展以包含尾随空格
      while (trailingSpaces > 0 && endOffset < startCue.text.length && startCue.text[endOffset] === ' ') {
        endOffset++;
        trailingSpaces--;
      }
      
      // 调试信息：输出补全空格后的范围
      console.log('[useTextSelection] 补全空格后:', {
        finalStartOffset: startOffset,
        finalEndOffset: endOffset,
        finalText: JSON.stringify(startCue.text.substring(startOffset, endOffset)),
        leadingSpacesCount: leadingSpaces,
        trailingSpacesCount: trailingSpaces,
      });
    }

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
      // 注意：不要使用 trim()，保留原始文本范围，包括首尾空格
      const selectedTextInCue = startCue.text.substring(startOffset, endOffset);
      newAffectedCues.push({
        cue: startCue,
        startOffset,
        endOffset,
        selectedText: selectedTextInCue.trim(), // 只用于显示，不影响范围计算
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
    
    // 调试信息：输出最终结果
    console.log('[useTextSelection] 最终结果:', {
      selectedText: trimmedSelectedText,
      selectionRange: {
        startCueId,
        endCueId,
        startOffset,
        endOffset,
      },
      affectedCues: newAffectedCues.map(ac => ({
        cueId: ac.cue.id,
        cueText: ac.cue.text,
        startOffset: ac.startOffset,
        endOffset: ac.endOffset,
        selectedTextInCue: JSON.stringify(ac.selectedText),
        actualTextInRange: JSON.stringify(ac.cue.text.substring(ac.startOffset, ac.endOffset)),
      })),
    });
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