import SparkMD5 from 'spark-md5';

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 文件扩展名（包含点号，如 ".mp3"）
 */
export function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
}

/**
 * 格式化文件大小显示
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的文件大小（如 "1.5 MB"）
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 读取音频文件时长
 * @param {File} file - 音频文件对象
 * @returns {Promise<number>} 音频时长（秒）
 */
export function readAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };

    const onLoaded = () => {
      cleanup();
      resolve(audio.duration);
    };

    const onError = (error) => {
      cleanup();
      reject(new Error('无法读取音频文件时长'));
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
  });
}

/**
 * 计算文件 MD5 hash（分块读取，避免内存溢出）
 * @param {File} file - 文件对象
 * @returns {Promise<string>} MD5 hash 字符串（hex）
 */
export function calculateFileMD5(file) {
  return new Promise((resolve, reject) => {
    const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
    const chunkSize = 2097152; // 2MB chunks
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      spark.append(e.target.result);
      currentChunk++;

      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(new Error('读取文件失败'));
    };

    const loadNext = () => {
      const start = currentChunk * chunkSize;
      const end = start + chunkSize >= file.size ? file.size : start + chunkSize;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    };

    loadNext();
  });
}

