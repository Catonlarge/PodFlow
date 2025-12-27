/**
 * ProcessingOverlayTestPage 组件
 * 
 * 用于测试和展示 ProcessingOverlay 组件的各种状态
 * 
 * @module pages/ProcessingOverlayTestPage
 */

import { useState, useRef, useEffect } from 'react';
import { Box, Button, Stack, Typography, Paper } from '@mui/material';
import ProcessingOverlay from '../components/upload/ProcessingOverlay';

export default function ProcessingOverlayTestPage() {
  const [overlayState, setOverlayState] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);

  // 清理 interval
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 模拟进度更新
  const startProgress = (type) => {
    // 清理之前的 interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setOverlayState({ type, error: null });
    setProgress(0);
    setIsPaused(false);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  // 模拟错误状态
  const showError = (type) => {
    setOverlayState({
      type,
      error: type === 'upload' 
        ? '网络连接失败，请检查网络设置' 
        : type === 'load'
        ? '字幕文件格式错误，无法解析'
        : '识别服务暂时不可用，请稍后重试',
    });
    setProgress(0);
  };

  // 模拟字幕识别（带暂停/继续）
  const startRecognition = () => {
    // 清理之前的 interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setOverlayState({ type: 'recognize', error: null });
    setProgress(0);
    setIsPaused(false);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 100;
        }
        return prev + 3;
      });
    }, 200);
  };

  // 当 isPaused 改变时，控制进度更新
  useEffect(() => {
    if (overlayState?.type === 'recognize') {
      if (isPaused) {
        // 暂停：停止 interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // 继续：重新启动 interval（如果还没有运行且进度未完成）
        if (!intervalRef.current && progress < 100) {
          intervalRef.current = setInterval(() => {
            setProgress((prev) => {
              if (prev >= 100) {
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                return 100;
              }
              return prev + 3;
            });
          }, 200);
        }
      }
    }
  }, [isPaused, overlayState, progress]);

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const handleRetry = () => {
    console.log('重试操作');
    setOverlayState(null);
    setProgress(0);
  };

  const closeOverlay = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setOverlayState(null);
    setProgress(0);
    setIsPaused(false);
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        ProcessingOverlay 组件测试页面
      </Typography>

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            正常状态测试
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={() => startProgress('upload')}
            >
              测试音频上传进度
            </Button>
            <Button
              variant="contained"
              onClick={() => startProgress('load')}
            >
              测试字幕加载进度
            </Button>
            <Button
              variant="contained"
              onClick={startRecognition}
            >
              测试字幕识别进度（带暂停/继续）
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            错误状态测试
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              color="error"
              onClick={() => showError('upload')}
            >
              测试上传错误
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => showError('load')}
            >
              测试加载错误
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => showError('recognize')}
            >
              测试识别错误
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            控制操作
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              onClick={closeOverlay}
            >
              关闭遮罩
            </Button>
            {overlayState?.type === 'recognize' && (
              <Button
                variant="outlined"
                onClick={handleTogglePause}
              >
                {isPaused ? '继续识别' : '暂停识别'}
              </Button>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            当前状态信息
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            类型: {overlayState?.type || '无'}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            进度: {progress}%
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            错误: {overlayState?.error || '无'}
          </Typography>
          {overlayState?.type === 'recognize' && (
            <Typography variant="body2">
              暂停状态: {isPaused ? '是' : '否'}
            </Typography>
          )}
        </Paper>
      </Stack>

      {/* 渲染 ProcessingOverlay 组件 */}
      {overlayState && (
        <ProcessingOverlay
          type={overlayState.type}
          progress={progress}
          error={overlayState.error}
          isPaused={isPaused}
          onRetry={handleRetry}
          onTogglePause={overlayState.type === 'recognize' ? handleTogglePause : null}
        />
      )}
    </Box>
  );
}

