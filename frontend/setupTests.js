import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock fetch 全局设置（避免测试时发送真实的 HTTP 请求）
// 防止测试中使用 test.mp3 等不存在的文件导致后端日志出现 404 错误
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
});

// 每次测试后清理
afterEach(() => {
  cleanup();
});

