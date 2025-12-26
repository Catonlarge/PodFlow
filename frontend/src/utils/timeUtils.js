/**
 * 时间格式化工具函数
 * 
 * 将秒数格式化为 mm:ss 或 h:mm:ss 格式（根据时长自动选择）
 * 
 * @param {number} seconds - 秒数（可以是浮点数）
 * @returns {string} 格式化后的时间字符串，格式为 mm:ss 或 h:mm:ss
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

/**
 * 时间格式化工具函数（负号格式）
 * 
 * 将秒数格式化为负号格式，用于已播放时间显示
 * 格式：-h:mm:ss 或 -mm:ss（根据时长自动选择）
 * 
 * @param {number} seconds - 秒数（可以是浮点数）
 * @returns {string} 格式化后的时间字符串，格式为 -h:mm:ss 或 -mm:ss
 */
export function formatTimeWithNegative(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return '-00:00';
  }
  
  const formatted = formatTime(seconds);
  return `-${formatted}`;
}

