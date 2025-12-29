import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, IconButton, Portal } from '@mui/material';
import { Delete } from '@mui/icons-material';

/**
 * DeleteButton 组件
 * 
 * 功能描述：
 * - 当用户点击 underline 类型的划线笔记时显示的删除按钮
 * - 包含一个垃圾桶图标按钮
 * - 定位逻辑与 SelectionMenu 一致
 * 
 * 位置计算规则（PRD 6.2.4.c）：
 * - 默认在"划线源"正上方10px处悬浮展示
 * - 屏幕上方不够用，则操作弹框在"划线源"正下方10px处悬浮展示
 * - 屏幕左边不够用，则操作弹框在"划线源"正上方10px处，水平往右挪动到可以完整展示的位置
 * - 屏幕右边不够用，则操作弹框在"划线源"正上方10px处，水平往左挪动到可以完整展示的位置
 * 
 * 相关PRD：
 * - PRD 6.2.4.c: 已生成笔记划线源交互
 * 
 * @module components/subtitles/DeleteButton
 * 
 * @param {Object} props
 * @param {{x: number, y: number} | null} props.anchorPosition - 划线源位置（相对于视口）
 * @param {Function} props.onDelete - 删除回调
 * @param {Function} props.onClose - 关闭回调
 */
export default function DeleteButton({
  anchorPosition,
  onDelete,
  onClose,
}) {
  const buttonRef = useRef(null);
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });

  /**
   * 计算按钮位置
   * 根据划线源位置和屏幕边界动态调整（与 SelectionMenu 逻辑一致）
   */
  const calculateButtonPosition = useCallback((anchorPos, buttonWidth, buttonHeight) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const offset = 10; // 10px 间距

    // 默认与划线源中心对齐，在正上方
    let x = anchorPos.x - buttonWidth / 2;
    let y = anchorPos.y - buttonHeight - offset;

    // 检查上方空间
    if (y < 0) {
      y = anchorPos.y + offset; // 改为正下方
    }

    // 检查左边空间
    if (x < offset) {
      x = offset; // 往右挪动
    }

    // 检查右边空间
    if (x + buttonWidth > viewportWidth - offset) {
      x = viewportWidth - buttonWidth - offset; // 往左挪动
    }

    return { x, y };
  }, []);

  /**
   * 更新按钮位置
   */
  useEffect(() => {
    if (!anchorPosition) {
      return;
    }

    // 使用 requestAnimationFrame 确保 DOM 已经渲染
    const updatePosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const calculatedPosition = calculateButtonPosition(
        anchorPosition,
        buttonRect.width,
        buttonRect.height
      );

      setButtonPosition(calculatedPosition);
    };

    // 如果 buttonRef.current 已经存在，直接计算
    if (buttonRef.current) {
      updatePosition();
    } else {
      // 否则等待下一帧
      requestAnimationFrame(updatePosition);
    }
  }, [anchorPosition, calculateButtonPosition]);

  /**
   * 处理删除按钮点击
   */
  const handleDeleteClick = useCallback(() => {
    if (onDelete) {
      onDelete();
    }
    if (onClose) {
      onClose();
    }
  }, [onDelete, onClose]);

  /**
   * 点击外部关闭
   */
  useEffect(() => {
    if (!anchorPosition) {
      return;
    }

    const handleClickOutside = (event) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
        if (onClose) {
          onClose();
        }
      }
    };

    // 使用 mousedown 而不是 click，避免与按钮点击冲突
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [anchorPosition, onClose]);

  // 如果 anchorPosition 为 null，不渲染
  if (!anchorPosition) {
    return null;
  }

  return (
    <Portal>
      <Box
        ref={buttonRef}
        data-delete-button
        sx={{
          position: 'fixed',
          left: `${buttonPosition.x}px`,
          top: `${buttonPosition.y}px`,
          zIndex: 1300, // 与 SelectionMenu 一致的 z-index
          display: 'flex',
          backgroundColor: 'white',
          borderRadius: 1,
          boxShadow: 2,
          padding: 0.5,
        }}
      >
        <IconButton
          aria-label="删除划线笔记"
          onClick={handleDeleteClick}
          size="small"
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
          <Delete />
        </IconButton>
      </Box>
    </Portal>
  );
}

