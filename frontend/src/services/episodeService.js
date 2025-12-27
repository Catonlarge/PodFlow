import api from '../api';

/**
 * episodeService
 * 
 * Episode 相关 API 调用服务
 * 
 * 功能描述：
 * - 提供 Episode 上传方法
 * - 封装 Episode 相关的 API 调用
 * 
 * 相关PRD：
 * - PRD 6.1.1: 音频和字幕选择弹框
 * - PRD 6.1.2: 音频处理逻辑和loading界面
 * 
 * @module services/episodeService
 */

/**
 * 上传音频文件，创建 Episode
 * 
 * API 端点：POST /api/episodes/upload
 * 
 * @param {File} audioFile - 音频文件
 * @param {string} title - Episode 标题
 * @param {number|null} podcastId - 播客 ID（可选，本地音频时为 null）
 * @returns {Promise<Object>} 上传结果，包含：
 *   - episode_id: Episode ID
 *   - status: 转录状态（pending/processing/completed/failed）
 *   - is_duplicate: 是否为重复文件（boolean）
 *   - message: 响应消息
 */
export async function uploadEpisode(audioFile, title, podcastId = null) {
  try {
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('title', title);
    if (podcastId !== null) {
      formData.append('podcast_id', podcastId.toString());
    }

    const response = await api.post('/api/episodes/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response;
  } catch (error) {
    console.error('[episodeService] 上传 Episode 失败:', error);
    throw error;
  }
}

export const episodeService = {
  uploadEpisode,
};

