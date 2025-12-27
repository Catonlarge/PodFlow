import api from '../api';

/**
 * noteService
 * 
 * 笔记相关 API 调用服务
 * 
 * 功能描述：
 * - 封装笔记相关的 API 调用
 * - 包括笔记创建、更新、删除、查询等
 * 
 * 相关PRD：
 * - PRD 6.2.4.d: 用户点击"纯划线"
 * - PRD 6.2.4.f: 用户点击"想法"
 * - PRD 6.2.4.e: 用户点击"查询"（AI 查询转笔记）
 * 
 * @module services/noteService
 */

/**
 * 创建笔记
 * 
 * API 端点：POST /api/notes
 * 
 * @param {number} episodeId - Episode ID
 * @param {number} highlightId - Highlight ID
 * @param {string} noteType - 笔记类型（underline/thought/ai_card）
 * @param {string|null} content - 笔记内容（underline 类型时为空）
 * @param {number|null} originAiQueryId - AI 查询记录 ID（可选，AI 查询转笔记时提供）
 * @returns {Promise<Object>} 响应对象，包含：
 *   - id: number - Note ID
 *   - created_at: string
 */
export async function createNote(episodeId, highlightId, noteType, content = null, originAiQueryId = null) {
  try {
    const response = await api.post('/api/notes', {
      episode_id: episodeId,
      highlight_id: highlightId,
      note_type: noteType,
      content: content,
      origin_ai_query_id: originAiQueryId,
    });
    return response;
  } catch (error) {
    console.error('[noteService] 创建笔记失败:', error);
    throw error;
  }
}

/**
 * 获取某个 Episode 的所有笔记
 * 
 * API 端点：GET /api/episodes/{id}/notes
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Array>} Note 数组，格式：
 *   [
 *     {
 *       id: number,
 *       highlight_id: number,
 *       content: string|null,
 *       note_type: string,
 *       origin_ai_query_id: number|null,
 *       created_at: string,
 *       updated_at: string
 *     },
 *     ...
 *   ]
 */
export async function getNotesByEpisode(episodeId) {
  try {
    const response = await api.get(`/api/episodes/${episodeId}/notes`);
    return response || [];
  } catch (error) {
    console.error(`[noteService] 获取笔记失败 (episodeId: ${episodeId}):`, error);
    throw error;
  }
}

/**
 * 更新笔记内容
 * 
 * API 端点：PUT /api/notes/{id}
 * 
 * @param {number} noteId - Note ID
 * @param {string} content - 新的笔记内容
 * @returns {Promise<Object>} 响应对象，包含：
 *   - success: boolean
 */
export async function updateNote(noteId, content) {
  try {
    const response = await api.put(`/api/notes/${noteId}`, {
      content: content,
    });
    return response;
  } catch (error) {
    console.error(`[noteService] 更新笔记失败 (noteId: ${noteId}):`, error);
    throw error;
  }
}

/**
 * 删除笔记
 * 
 * API 端点：DELETE /api/notes/{id}
 * 
 * @param {number} noteId - Note ID
 * @returns {Promise<Object>} 响应对象，包含：
 *   - success: boolean
 */
export async function deleteNote(noteId) {
  try {
    const response = await api.delete(`/api/notes/${noteId}`);
    return response;
  } catch (error) {
    console.error(`[noteService] 删除笔记失败 (noteId: ${noteId}):`, error);
    throw error;
  }
}

export const noteService = {
  createNote,
  getNotesByEpisode,
  updateNote,
  deleteNote,
};
