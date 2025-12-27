import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, IconButton, Portal } from '@mui/material';
import { FormatUnderlined, Search, Lightbulb } from '@mui/icons-material';

/**
 * SelectionMenu 组件
 * 
 * 功能描述：
 * - 当用户在英文字幕区域选中文本时显示的浮动菜单
 * - 包含三个操作按钮："纯划线"、"查询"、"想法"
 * - 定位逻辑复杂，需要根据选中文本位置动态计算菜单位置
 * 
 * 位置计算规则（PRD 6.2.4.b.iii）：
 * - 默认在"划线源"正上方10px处悬浮展示
 * - 屏幕上方不够用，则操作弹框在"划线源"正下方10px处悬浮展示
 * - 屏幕左边不够用，则操作弹框在"划线源"正上方10px处，水平往右挪动到可以完整展示的位置
 * - 屏幕右边不够用，则操作弹框在"划线源"正上方10px处，水平往左挪动到可以完整展示的位置
 * 
 * 相关PRD：
 * - PRD 6.2.4.b: 划线操作
 * - PRD 6.2.4.d: 用户点击"纯划线"
 * - PRD 6.2.4.e: 用户点击"查询"
 * - PRD 6.2.4.f: 用户点击"想法"
 * 
 * @module components/subtitles/SelectionMenu
 * 
 * @param {Object} props
 * @param {{x: number, y: number} | null} props.anchorPosition - 划线源位置（相对于视口）
 * @param {string | null} props.selectedText - 选中的文本
 * @param {Array} props.affectedCues - 受影响的 cues（已拆分）
 * @param {Function} props.onUnderline - 纯划线回调
 * @param {Function} props.onQuery - 查询回调
 * @param {Function} props.onThought - 想法回调
 * @param {Function} props.onClose - 关闭回调
 */
export default function SelectionMenu({
  anchorPosition,
  selectedText,
  affectedCues,
  onUnderline,
  onQuery,
  onThought,
  onClose,
}) {
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  /**
   * 计算菜单位置
   * 根据划线源位置和屏幕边界动态调整
   */
  const calculateMenuPosition = useCallback((anchorPos, menuWidth, menuHeight) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const offset = 10; // 10px 间距

    // 默认与划线源中心对齐，在正上方
    let x = anchorPos.x - menuWidth / 2;
    let y = anchorPos.y - menuHeight - offset;

    // 检查上方空间
    if (y < 0) {
      y = anchorPos.y + offset; // 改为正下方
    }

    // 检查左边空间
    if (x < offset) {
      x = offset; // 往右挪动
    }

    // 检查右边空间
    if (x + menuWidth > viewportWidth - offset) {
      x = viewportWidth - menuWidth - offset; // 往左挪动
    }

    return { x, y };
  }, []);

  /**
   * 更新菜单位置
   */
  useEffect(() => {
    if (!anchorPosition) {
      return;
    }

    // 使用 requestAnimationFrame 确保 DOM 已经渲染
    const updatePosition = () => {
      if (!menuRef.current) {
        return;
      }

      const menuRect = menuRef.current.getBoundingClientRect();
      const calculatedPosition = calculateMenuPosition(
        anchorPosition,
        menuRect.width,
        menuRect.height
      );

      setMenuPosition(calculatedPosition);
    };

    // 如果 menuRef.current 已经存在，直接计算
    if (menuRef.current) {
      updatePosition();
    } else {
      // 否则等待下一帧
      requestAnimationFrame(updatePosition);
    }
  }, [anchorPosition, calculateMenuPosition]);

  /**
   * 处理按钮点击
   */
  const handleButtonClick = useCallback((callback) => {
    callback();
    onClose();
  }, [onClose]);

  /**
   * 点击外部关闭
   */
  useEffect(() => {
    if (!anchorPosition) {
      return;
    }

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    // 使用 mousedown 而不是 click，避免与按钮点击冲突
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [anchorPosition, onClose]);

  // 如果 anchorPosition 为 null 或 selectedText 为空，不渲染
  if (!anchorPosition || !selectedText || !selectedText.trim()) {
    return null;
  }

  return (
    <Portal>
      <Box
        ref={menuRef}
        data-selection-menu
        sx={{
          position: 'fixed',
          left: `${menuPosition.x}px`,
          top: `${menuPosition.y}px`,
          zIndex: 1300, // MUI Dialog 的 z-index 是 1300，确保菜单在最上层
          display: 'flex',
          gap: 0.5,
          backgroundColor: 'white',
          borderRadius: 1,
          boxShadow: 2,
          padding: 0.5,
        }}
      >
        <IconButton
          aria-label="纯划线"
          onClick={() => handleButtonClick(onUnderline)}
          sx={{
            color: 'grey.600',
            '&:hover': {
              backgroundColor: 'grey.100',
            },
            '&:active': {
              backgroundColor: 'grey.200',
            },
          }}
        >
          <FormatUnderlined />
        </IconButton>

        <IconButton
          aria-label="查询"
          onClick={() => handleButtonClick(onQuery)}
          sx={{
            color: 'grey.600',
            '&:hover': {
              backgroundColor: 'grey.100',
            },
            '&:active': {
              backgroundColor: 'grey.200',
            },
          }}
        >
          <Search />
        </IconButton>

        <IconButton
          aria-label="想法"
          onClick={() => handleButtonClick(onThought)}
          sx={{
            color: 'grey.600',
            '&:hover': {
              backgroundColor: 'grey.100',
            },
            '&:active': {
              backgroundColor: 'grey.200',
            },
          }}
        >
          <Lightbulb />
        </IconButton>
      </Box>
    </Portal>
  );
}
