import api from '../api';

/**
 * highlightService
 * 
 * Highlight 相关 API 调用服务
 * 
 * 功能描述：
 * - 封装划线相关的 API 调用
 * - 包括划线创建、查询、删除等
 * 
 * 相关PRD：
 * - PRD 6.2.4.b: 划线操作
 * - PRD 6.2.4.d: 用户点击"纯划线"
 * 
 * @module services/highlightService
 */

/**
 * 创建划线（支持批量创建，用于跨 cue 划线）
 * 
 * API 端点：POST /api/highlights
 * 
 * @param {number} episodeId - Episode ID
 * @param {Array} highlights - Highlight 数组，格式：
 *   [
 *     {
 *       cue_id: number,
 *       start_offset: number,
 *       end_offset: number,
 *       highlighted_text: string,
 *       color: string (可选，默认 #9C27B0)
 *     },
 *     ...
 *   ]
 * @param {string|null} highlightGroupId - 分组 ID（跨 cue 划线时使用，单 cue 时为 null）
 * @returns {Promise<Object>} 响应对象，包含：
 *   - success: boolean
 *   - highlight_ids: number[] - 创建的 Highlight ID 列表
 *   - highlight_group_id: string|null - 如果是分组
 *   - created_at: string
 */
export async function createHighlights(episodeId, highlights, highlightGroupId = null) {
  try {
    const response = await api.post('/api/highlights', {
      episode_id: episodeId,
      highlights: highlights,
      highlight_group_id: highlightGroupId,
    });
    return response;
  } catch (error) {
    console.error('[highlightService] 创建划线失败:', error);
    throw error;
  }
}

/**
 * 获取某个 Episode 的所有划线
 * 
 * API 端点：GET /api/episodes/{id}/highlights
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Array>} Highlight 数组，格式：
 *   [
 *     {
 *       id: number,
 *       cue_id: number,
 *       start_offset: number,
 *       end_offset: number,
 *       highlighted_text: string,
 *       color: string,
 *       highlight_group_id: string|null,
 *       notes: Array
 *     },
 *     ...
 *   ]
 */
export async function getHighlightsByEpisode(episodeId) {
  try {
    const response = await api.get(`/api/episodes/${episodeId}/highlights`);
    return response || [];
  } catch (error) {
    console.error(`[highlightService] 获取划线失败 (episodeId: ${episodeId}):`, error);
    throw error;
  }
}

/**
 * 删除划线（按组删除）
 * 
 * API 端点：DELETE /api/highlights/{id}
 * 
 * @param {number} highlightId - Highlight ID
 * @returns {Promise<Object>} 响应对象，包含：
 *   - success: boolean
 *   - deleted_highlights_count: number - 删除的 Highlight 数量（按组删除时可能 > 1）
 *   - deleted_notes_count: number - 删除的 Note 数量
 *   - deleted_ai_queries_count: number - 删除的 AIQueryRecord 数量
 */
export async function deleteHighlight(highlightId) {
  try {
    const response = await api.delete(`/api/highlights/${highlightId}`);
    return response;
  } catch (error) {
    console.error(`[highlightService] 删除划线失败 (highlightId: ${highlightId}):`, error);
    throw error;
  }
}

export const highlightService = {
  createHighlights,
  getHighlightsByEpisode,
  deleteHighlight,
};

