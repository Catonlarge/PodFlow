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
  },
  {
    id: 11,
    start_time: 57.0,
    end_time: 65.3,
    speaker: 'Guest',
    text: "Sure. When we were building our mobile app, we realized users weren't just trying to buy products. They were trying to solve problems in their daily lives."
  },
  {
    id: 12,
    start_time: 66.0,
    end_time: 72.8,
    speaker: 'Lenny',
    text: "That's a great insight. How did that change your product decisions?"
  },
  {
    id: 13,
    start_time: 73.5,
    end_time: 82.0,
    speaker: 'Guest',
    text: "It completely shifted our focus. Instead of optimizing for conversion, we started optimizing for helping users accomplish their goals faster."
  },
  {
    id: 14,
    start_time: 82.5,
    end_time: 89.2,
    speaker: 'Lenny',
    text: "That makes a lot of sense. What metrics did you use to measure success?"
  },
  {
    id: 15,
    start_time: 90.0,
    end_time: 98.5,
    speaker: 'Guest',
    text: "We looked at time-to-value, how quickly users could accomplish their primary task. That became our north star metric."
  },
  {
    id: 16,
    start_time: 99.0,
    end_time: 105.8,
    speaker: 'Lenny',
    text: "Interesting. Let's talk about working with engineering teams. How do you balance speed and quality?"
  },
  {
    id: 17,
    start_time: 106.5,
    end_time: 115.2,
    speaker: 'Guest',
    text: "That's always a challenge. I think the key is to be very clear about what 'done' means for each feature, and to prioritize ruthlessly."
  },
  {
    id: 18,
    start_time: 116.0,
    end_time: 123.5,
    speaker: 'Lenny',
    text: "How do you handle disagreements with engineering about scope or timeline?"
  },
  {
    id: 19,
    start_time: 124.0,
    end_time: 132.8,
    speaker: 'Guest',
    text: "I try to understand their perspective first. Usually, when engineers push back, there's a good technical reason. Then we work together to find a solution."
  },
  {
    id: 20,
    start_time: 133.5,
    end_time: 140.2,
    speaker: 'Lenny',
    text: "That's a collaborative approach. What about working with designers?"
  },
  {
    id: 21,
    start_time: 141.0,
    end_time: 149.5,
    speaker: 'Guest',
    text: "Designers and PMs need to be partners from day one. The best products come from close collaboration between product, design, and engineering."
  },
  {
    id: 22,
    start_time: 150.0,
    end_time: 157.8,
    speaker: 'Lenny',
    text: "Absolutely. What's your process for gathering user feedback?"
  },
  {
    id: 23,
    start_time: 158.5,
    end_time: 167.2,
    speaker: 'Guest',
    text: "We do a mix of things: user interviews, surveys, analytics, and in-app feedback. But the most valuable insights come from talking to users directly."
  },
  {
    id: 24,
    start_time: 168.0,
    end_time: 175.5,
    speaker: 'Lenny',
    text: "How often do you talk to users?"
  },
  {
    id: 25,
    start_time: 176.0,
    end_time: 184.8,
    speaker: 'Guest',
    text: "I try to do at least two user interviews per week. It keeps me grounded in reality and helps me understand what users actually need, not what I think they need."
  },
  {
    id: 26,
    start_time: 185.5,
    end_time: 192.2,
    speaker: 'Lenny',
    text: "That's a great habit. What advice would you give to someone just starting out in product management?"
  },
  {
    id: 27,
    start_time: 193.0,
    end_time: 201.5,
    speaker: 'Guest',
    text: "Learn to say no. You can't do everything, and trying to do too much means you'll do nothing well. Focus on what matters most."
  },
  {
    id: 28,
    start_time: 202.0,
    end_time: 209.8,
    speaker: 'Lenny',
    text: "That's excellent advice. What about building relationships with stakeholders?"
  },
  {
    id: 29,
    start_time: 210.5,
    end_time: 218.2,
    speaker: 'Guest',
    text: "Communication is key. Keep stakeholders informed, be transparent about challenges, and always explain the 'why' behind your decisions."
  },
  {
    id: 30,
    start_time: 219.0,
    end_time: 226.5,
    speaker: 'Lenny',
    text: "Great insights. Let's talk about product roadmaps. How do you approach planning?"
  },
  {
    id: 31,
    start_time: 227.0,
    end_time: 235.8,
    speaker: 'Guest',
    text: "I prefer a theme-based roadmap over a feature-based one. Focus on outcomes, not outputs. What problems are we solving, not what features are we building?"
  },
  {
    id: 32,
    start_time: 236.5,
    end_time: 243.2,
    speaker: 'Lenny',
    text: "That's a more strategic approach. How do you handle changing priorities?"
  },
  {
    id: 33,
    start_time: 244.0,
    end_time: 252.5,
    speaker: 'Guest',
    text: "Change is inevitable. The key is to be flexible but also to understand the cost of changing direction. Sometimes you need to say no to protect what you're already building."
  },
  {
    id: 34,
    start_time: 253.0,
    end_time: 260.8,
    speaker: 'Lenny',
    text: "What about dealing with failure? How do you handle when a product or feature doesn't work out?"
  },
  {
    id: 35,
    start_time: 261.5,
    end_time: 270.2,
    speaker: 'Guest',
    text: "Failure is part of the job. The important thing is to learn from it. What did we learn? What would we do differently? Use it as data for the next decision."
  },
  {
    id: 36,
    start_time: 271.0,
    end_time: 278.5,
    speaker: 'Lenny',
    text: "That's a growth mindset. What tools do you use to stay organized?"
  },
  {
    id: 37,
    start_time: 279.0,
    end_time: 287.8,
    speaker: 'Guest',
    text: "I keep it simple: a task list, a notes app, and good communication tools. The tools don't matter as much as the process and discipline."
  },
  {
    id: 38,
    start_time: 288.5,
    end_time: 295.2,
    speaker: 'Lenny',
    text: "What's the most challenging part of being a PM for you?"
  },
  {
    id: 39,
    start_time: 296.0,
    end_time: 304.5,
    speaker: 'Guest',
    text: "The constant context switching. You're talking to users, then engineers, then designers, then executives. It's mentally exhausting but also really rewarding."
  },
  {
    id: 40,
    start_time: 305.0,
    end_time: 312.8,
    speaker: 'Lenny',
    text: "That's a great way to put it. Well, thank you so much for sharing your insights today. This has been really valuable."
  },
  {
    id: 41,
    start_time: 313.5,
    end_time: 320.2,
    speaker: 'Guest',
    text: "Thank you for having me. I really enjoyed our conversation."
  },
  {
    id: 42,
    start_time: 321.0,
    end_time: 328.5,
    speaker: 'Lenny',
    text: "And thank you to our listeners. We'll be back next week with another great conversation about product management."
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
 * API 端点：GET /api/episodes/{episode_id}
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Array>} 字幕数组
 */
export async function getCuesByEpisodeId(episodeId) {
  try {
    const response = await api.get(`/api/episodes/${episodeId}`);
    return response.cues || [];
  } catch (error) {
    console.error(`[subtitleService] 获取字幕失败 (episodeId: ${episodeId}):`, error);
    // 如果 API 失败，暂时返回 mock 数据作为降级方案
    return getMockCues();
  }
}

/**
 * 根据 Episode ID 获取 Episode 详情（包含字幕数据）
 * 
 * API 端点：GET /api/episodes/{episode_id}
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Object>} Episode 对象，包含：
 *   - id, title, duration, transcription_status, transcription_progress
 *   - cues: 字幕数组
 *   - podcast_id, created_at 等
 */
export async function getEpisode(episodeId) {
  try {
    const response = await api.get(`/api/episodes/${episodeId}`);
    return response;
  } catch (error) {
    console.error(`[subtitleService] 获取 Episode 失败 (episodeId: ${episodeId}):`, error);
    throw error; // 不返回 mock 数据，让调用方处理错误
  }
}

/**
 * 获取 Episode 的所有 segment 状态信息
 * 
 * API 端点：GET /api/episodes/{episode_id}/segments
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Array>} Segment 数组，格式：
 *   [
 *     {
 *       segment_index: 0,
 *       segment_id: "segment_001",
 *       status: "completed",
 *       start_time: 0.0,
 *       end_time: 180.0,
 *       duration: 180.0,
 *       retry_count: 0,
 *       error_message: null
 *     },
 *     ...
 *   ]
 */
export async function getEpisodeSegments(episodeId) {
  try {
    const response = await api.get(`/api/episodes/${episodeId}/segments`);
    return response.segments || [];
  } catch (error) {
    console.error(`[subtitleService] 获取 Segment 状态失败 (episodeId: ${episodeId}):`, error);
    throw error;
  }
}

/**
 * 触发指定 segment 的识别任务
 * 
 * API 端点：POST /api/episodes/{episode_id}/segments/{segment_index}/transcribe
 * 
 * @param {number} episodeId - Episode ID
 * @param {number} segmentIndex - Segment 索引（从 0 开始）
 * @returns {Promise<Object>} 响应对象
 */
export async function triggerSegmentTranscription(episodeId, segmentIndex) {
  try {
    const response = await api.post(
      `/api/episodes/${episodeId}/segments/${segmentIndex}/transcribe`
    );
    return response;
  } catch (error) {
    console.error(
      `[subtitleService] 触发 Segment 识别失败 (episodeId: ${episodeId}, segmentIndex: ${segmentIndex}):`,
      error
    );
    throw error;
  }
}

/**
 * 恢复未完成的 segment 识别任务
 * 
 * API 端点：POST /api/episodes/{episode_id}/segments/recover
 * 
 * @param {number} episodeId - Episode ID
 * @returns {Promise<Object>} 响应对象
 */
export async function recoverIncompleteSegments(episodeId) {
  try {
    const response = await api.post(`/api/episodes/${episodeId}/segments/recover`);
    return response;
  } catch (error) {
    console.error(
      `[subtitleService] 恢复未完成 Segment 失败 (episodeId: ${episodeId}):`,
      error
    );
    throw error;
  }
}

export const subtitleService = {
  getMockCues,
  getCuesByEpisodeId,
  getEpisode,
  getEpisodeSegments,
  triggerSegmentTranscription,
  recoverIncompleteSegments,
};
