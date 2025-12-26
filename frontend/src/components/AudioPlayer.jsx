import AudioBarContainer from './player/AudioBarContainer';

/**
 * AudioPlayer 组件
 * 
 * 根据 PRD 6.2.3 实现的完整音频控制模块
 * 重构后：作为包装组件，保持向后兼容的API
 * 
 * @param {Object} props
 * @param {string} props.audioUrl - 音频文件 URL（必需）
 * @param {Function} [props.onTimeUpdate] - 时间更新回调函数 (currentTime) => void
 * @param {number} [props.initialVolume=0.8] - 初始音量（0-1，默认 0.8）
 */
function AudioPlayer({ audioUrl, onTimeUpdate, initialVolume = 0.8 }) {
  return (
    <AudioBarContainer
      audioUrl={audioUrl}
      onTimeUpdate={onTimeUpdate}
      initialVolume={initialVolume}
    />
  );
}

export default AudioPlayer;
