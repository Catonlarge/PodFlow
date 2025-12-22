import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每次测试后清理
afterEach(() => {
  cleanup();
});

