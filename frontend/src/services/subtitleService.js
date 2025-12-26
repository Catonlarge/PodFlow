import api from '../api';

/**
 * subtitleService
 * 
 * 字幕相关 API 调用服务
 * 
 * 功能描述：
 * - 提供字幕数据的获取方法（mock 数据 + API）
 * - 封装字幕相关的 API 调用
 * 
 * 相关PRD：
 * - PRD 6.2.4: 英文字幕区域与笔记区域
 * - PRD 7.1.2: 字幕文件格式
 * 
 * @module services/subtitleService
 */

/**
 * Mock 字幕数据
 * 基于 backend/data/sample_transcript.json 格式生成
 * 数据格式与后端 API 返回格式一致
 */
const MOCK_CUES = [
  {
    id: 1,
    start_time: 0.28,
    end_time: 2.22,
    speaker: 'Lenny',
    text: "Thank you so much for joining us today."
  },
  {
    id: 2,
    start_time: 2.5,
    end_time: 5.8,
    speaker: 'Lenny',
    text: "I'm really excited to talk about product management with you."
  },
  {
    id: 3,
    start_time: 6.0,
    end_time: 9.5,
    speaker: 'Guest',
    text: "Thanks for having me, it's great to be here."
  },
  {
    id: 4,
    start_time: 10.0,
    end_time: 15.2,
    speaker: 'Lenny',
    text: "So let's start with the basics. How did you get into product management?"
  },
  {
    id: 5,
    start_time: 15.8,
    end_time: 22.5,
    speaker: 'Guest',
    text: "Well, I actually started as an engineer, and then I realized I loved talking to customers more than writing code."
  },
  {
    id: 6,
    start_time: 23.0,
    end_time: 28.3,
    speaker: 'Lenny',
    text: "That's a common path! A lot of great PMs started as engineers."
  },
  {
    id: 7,
    start_time: 29.0,
    end_time: 35.8,
    speaker: 'Guest',
    text: "Exactly. The technical background really helps when you're working with engineering teams."
  },
  {
    id: 8,
    start_time: 36.5,
    end_time: 42.0,
    speaker: 'Lenny',
    text: "Now, let's talk about your approach to product strategy. What framework do you use?"
  },
  {
    id: 9,
    start_time: 42.5,
    end_time: 50.2,
    speaker: 'Guest',
    text: "I'm a big fan of the Jobs to be Done framework. It helps you really understand what users are trying to accomplish."
  },
  {
    id: 10,
    start_time: 50.8,
    end_time: 56.5,
    speaker: 'Lenny',
    text: "That's interesting. Can you give us an example of how you've applied that in practice?"
  }
];

/**
 * 获取 Mock 字幕数据
 * 
 * @returns {Promise<Array>} 字幕数组，格式与后端 API 返回一致
 */
export function getMockCues() {
  return Promise.resolve(MOCK_CUES);
}

/**
 * 根据 Episode ID 获取字幕数据
 * 
 * 后续扩展：从后端 API 获取字幕数据
 * API 端点：GET /episodes/{episode_id}
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Array>} 字幕数组
 */
export async function getCuesByEpisodeId(episodeId) {
  try {
    const response = await api.get(`/episodes/${episodeId}`);
    return response.cues || [];
  } catch (error) {
    console.error(`[subtitleService] 获取字幕失败 (episodeId: ${episodeId}):`, error);
    // 如果 API 失败，暂时返回 mock 数据作为降级方案
    return getMockCues();
  }
}

export const subtitleService = {
  getMockCues,
  getCuesByEpisodeId,
};
