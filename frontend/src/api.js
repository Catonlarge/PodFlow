import axios from 'axios';

// API 基础配置
// 优先使用环境变量，否则使用默认值
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL, // 后端 API 地址
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 调试：只在开发环境且非轮询请求时打印（减少日志噪音）
    if (import.meta.env.DEV && !config.url?.includes('/status') && !config.url?.includes('/segments')) {
      console.log('[API] 发送请求:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        fullURL: `${config.baseURL}${config.url}`,
      });
    }
    // 可以在这里添加 token 等认证信息
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    // 调试：只在开发环境且非轮询请求时打印（减少日志噪音）
    if (import.meta.env.DEV && !response.config.url?.includes('/status') && !response.config.url?.includes('/segments')) {
      console.log('[API] 收到响应:', {
        status: response.status,
        url: response.config.url,
      });
    }
    return response.data;
  },
  (error) => {
    // 统一错误处理
    console.error('[API] 请求失败:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data,
      } : null,
      config: error.config ? {
        method: error.config.method,
        url: error.config.url,
        baseURL: error.config.baseURL,
        fullURL: `${error.config.baseURL}${error.config.url}`,
      } : null,
    });
    return Promise.reject(error);
  }
);

export default api;

