/**
 * Modal 组件
 * 
 * 通用弹窗容器，使用Portal实现，支持遮罩层、ESC关闭、点击遮罩关闭等交互
 * 
 * 功能描述：
 * - 使用Portal实现弹窗，确保弹窗渲染在body下
 * - 支持遮罩层、关闭按钮、自定义内容
 * - 支持键盘ESC关闭、点击遮罩关闭等交互
 * - 支持弹窗抖动效果（点击外部时）
 * 
 * 相关PRD：
 * - PRD 6.2.4.h.5.2: 删除笔记确认弹窗（421-424行）
 * 
 * @module components/common/Modal
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';

/**
 * Modal 组件
 * 
 * @param {Object} props
 * @param {boolean} props.open - 是否显示弹窗
 * @param {Function} props.onClose - 关闭弹窗回调
 * @param {string} [props.title] - 弹窗标题
 * @param {string} [props.message] - 弹窗消息内容
 * @param {ReactNode} [props.children] - 自定义内容（优先级高于message）
 * @param {boolean} [props.showCancel=true] - 是否显示取消按钮
 * @param {Function} [props.onConfirm] - 确认按钮回调
 * @param {Function} [props.onCancel] - 取消按钮回调
 * @param {boolean} [props.allowBackdropClose=true] - 是否允许点击遮罩关闭
 */
export default function Modal({
  open,
  onClose,
  title,
  message,
  children,
  showCancel = true,
  onConfirm,
  onCancel,
  allowBackdropClose = true,
}) {
  const [isShaking, setIsShaking] = useState(false);
  const dialogRef = useRef(null);

  // ESC 键关闭
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && open) {
        if (allowBackdropClose) {
          onClose();
        } else {
          // 不允许关闭时，触发抖动效果
          triggerShake();
        }
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      // 防止背景滚动
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose, allowBackdropClose]);

  // 触发抖动效果
  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
    }, 500);
  };

  // 处理遮罩点击
  const handleBackdropClick = (e) => {
    if (allowBackdropClose) {
      onClose();
    } else {
      // 不允许关闭时，触发抖动效果
      triggerShake();
    }
  };

  // 处理确认按钮
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  // 处理取消按钮
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  if (!open) {
    return null;
  }

  return createPortal(
    <Dialog
      open={open}
      onClose={handleBackdropClick}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        ref: dialogRef,
        sx: {
          animation: isShaking ? 'shake 0.5s' : 'none',
          '@keyframes shake': {
            '0%, 100%': { transform: 'translateX(0)' },
            '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-10px)' },
            '20%, 40%, 60%, 80%': { transform: 'translateX(10px)' },
          },
        },
      }}
    >
      {title && (
        <DialogTitle>
          {title}
        </DialogTitle>
      )}
      
      <DialogContent>
        {children ? (
          children
        ) : message ? (
          <Typography variant="body1">{message}</Typography>
        ) : null}
      </DialogContent>

      {(showCancel || onConfirm) && (
        <DialogActions>
          {showCancel && (
            <Button onClick={handleCancel} color="inherit">
              取消
            </Button>
          )}
          {onConfirm && (
            <Button onClick={handleConfirm} color="primary" variant="contained">
              确认
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>,
    document.body
  );
}
