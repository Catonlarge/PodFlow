import api from '../api';

/**
 * aiService
 * 
 * AI 查询相关 API 调用服务
 * 
 * 功能描述：
 * - 封装 AI 查询相关的 API 调用
 * - 包括 AI 查询、缓存检查等
 * 
 * 相关PRD：
 * - PRD 6.2.4.e: 用户点击"查询"
 * 
 * @module services/aiService
 */

/**
 * 查询 AI（单词/短语/句子）
 * 
 * API 端点：POST /api/ai/query
 * 
 * @param {number} highlightId - Highlight ID（必需）
 * @param {string} [provider] - AI 提供商（可选，默认从后端 config 获取）
 * @returns {Promise<Object>} 响应对象，包含：
 *   {
 *     query_id: number,
 *     status: "processing" | "completed" | "failed",
 *     response: {
 *       type: "word" | "phrase" | "sentence",
 *       content: {
 *         // word/phrase: {phonetic, definition, explanation}
 *         // sentence: {translation, highlight_vocabulary}
 *       }
 *     }
 *   }
 */
export async function queryAI(highlightId, provider = null) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.js:38',message:'开始AI查询',data:{highlightId,provider},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  // #endregion
  try {
    const requestBody = {
      highlight_id: highlightId,
    };
    
    if (provider) {
      requestBody.provider = provider;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.js:48',message:'发送AI查询请求',data:{requestBody},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    const response = await api.post('/api/ai/query', requestBody);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.js:49',message:'AI查询成功',data:{queryId:response?.query_id,status:response?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    return response;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a2995df4-4a1e-43d3-8e94-ca9043935740',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.js:51',message:'AI查询失败',data:{errorMessage:error?.message,errorStatus:error?.response?.status,errorDetail:error?.response?.data?.detail,errorData:error?.response?.data,errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    console.error('[aiService] AI 查询失败:', error);
    throw error;
  }
}

export const aiService = {
  queryAI,
};

