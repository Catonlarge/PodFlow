import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 设置 UTF-8 编码环境变量（修复 Windows PowerShell 中文乱码问题）
if (process.platform === 'win32') {
  process.env.PYTHONIOENCODING = 'utf-8'
  // 确保 Node.js 输出使用 UTF-8
  if (!process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = '--no-warnings'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setupTests.js',
    testTimeout: 10000, // 10秒超时，用于轮询测试
  },
})
