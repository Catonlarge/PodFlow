import api from '../api';

/**
 * aiService
 * * AI 查询相关 API 调用服务
 * * 功能描述：
 * - 封装 AI 查询相关的 API 调用
 * - 包括 AI 查询、缓存检查等
 * * 相关PRD：
 * - PRD 6.2.4.e: 用户点击"查询"
 * * @module services/aiService
 */

/**
 * 查询 AI（单词/短语/句子）
 * * API 端点：POST /api/ai/query
 * * @param {number} highlightId - Highlight ID（必需）
 * @param {string} [provider] - AI 提供商（可选，默认从后端 config 获取）
 * @returns {Promise<Object>} 响应对象，包含：
 * {
 * query_id: number,
 * status: "processing" | "completed" | "failed",
 * response: {
 * type: "word" | "phrase" | "sentence",
 * content: {
 * // word/phrase: {phonetic, definition, explanation}
 * // sentence: {translation, highlight_vocabulary}
 * }
 * }
 * }
 */
export async function queryAI(highlightId, provider = null) {
  try {
    const requestBody = {
      highlight_id: highlightId,
    };
    
    if (provider) {
      requestBody.provider = provider;
    }
    
    // 发送正式请求
    const response = await api.post('/api/ai/query', requestBody);
    return response;
  } catch (error) {
    console.error('[aiService] AI 查询失败:', error);
    throw error;
  }
}

export const aiService = {
  queryAI,
};