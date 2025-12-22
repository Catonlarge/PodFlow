import axios from 'axios';

// API 基础配置
const api = axios.create({
  baseURL: 'http://localhost:8000', // 后端 API 地址
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
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
    return response.data;
  },
  (error) => {
    // 统一错误处理
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api;

