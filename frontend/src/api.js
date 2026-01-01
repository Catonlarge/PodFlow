import axios from 'axios';

// API 基础配置
// 优先使用环境变量，否则使用默认值
// 1. 保留你的环境变量判断，这是最稳健的写法
//    如果 .env 没配，默认回退到 localhost:8000
const  API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';


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

api.getEpisodes = async () => {
  try {
    // 2. 【核心修改】这里必须手动写 '/api/episodes'
    // 因为上面的 baseURL 里没有 '/api'，所以这里要补上
    const res = await api.get('/api/episodes');
    
    // 检查 items
    if (res && res.items && Array.isArray(res.items)) {
      return res.items;
    }
    
    // 容错：直接返回数组
    if (Array.isArray(res)) {
      return res;
    }

    console.warn('[API] 数据格式异常:', res);
    return [];

  } catch (error) {
    console.error('[API] 获取列表失败:', error);
    return []; 
  }
};

export default api;

