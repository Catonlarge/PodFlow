import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * useIdle Hook
 * 
 * 检测用户是否在指定时间内无操作（鼠标移动、键盘、点击等）
 * 用于实现播放器自动收缩功能
 * 
 * @param {Object} options
 * @param {number} [options.delay=3000] - 无操作延迟时间（毫秒，默认 3000ms）
 * @param {boolean} [options.enabled=true] - 是否启用检测（默认 true）
 * @param {boolean} [options.isHovering=false] - 是否正在悬停（外部传入，用于阻止收缩）
 * @returns {Object} { isIdle: boolean, resetIdleTimer: Function }
 */
export function useIdle({ delay = 3000, enabled = true, isHovering = false } = {}) {
  const [isIdle, setIsIdle] = useState(false);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());
  const collapseTimerRef = useRef(null);

  // 重置空闲定时器
  const resetIdleTimer = useCallback(() => {
    setLastInteractionTime(Date.now());
    setIsIdle(false);
  }, []);

  // 全局用户交互监听（mousemove、keydown、click）
  // 只在启用时监听
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleGlobalInteraction = () => {
      resetIdleTimer();
    };

    // 监听全局事件
    window.addEventListener('mousemove', handleGlobalInteraction);
    window.addEventListener('keydown', handleGlobalInteraction);
    window.addEventListener('click', handleGlobalInteraction);

    return () => {
      window.removeEventListener('mousemove', handleGlobalInteraction);
      window.removeEventListener('keydown', handleGlobalInteraction);
      window.removeEventListener('click', handleGlobalInteraction);
    };
  }, [enabled, resetIdleTimer]);

  // 收缩逻辑：定期检查是否应该收缩
  // 只在启用时启动定时器
  useEffect(() => {
    // 清除之前的定时器
    if (collapseTimerRef.current) {
      clearInterval(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    // 只在启用时启动定时器
    if (!enabled) {
      return;
    }

    // 设置定时器，每秒检查一次是否应该收缩
    collapseTimerRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteractionTime;
      
      // 收缩条件：
      // 1. 距离上次交互超过延迟时间
      // 2. 鼠标不在播放器上悬停
      // 3. 当前未处于空闲状态（避免重复设置）
      if (
        timeSinceLastInteraction >= delay &&
        !isHovering &&
        !isIdle
      ) {
        setIsIdle(true);
      }
    }, 1000); // 每秒检查一次

    return () => {
      if (collapseTimerRef.current) {
        clearInterval(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, [enabled, lastInteractionTime, isHovering, isIdle, delay]);

  return {
    isIdle,
    resetIdleTimer,
  };
}

