/**
 * 时间格式化工具函数
 * 
 * 将秒数格式化为 mm:ss 格式
 * 
 * @param {number} seconds - 秒数（可以是浮点数）
 * @returns {string} 格式化后的时间字符串，格式为 mm:ss
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

