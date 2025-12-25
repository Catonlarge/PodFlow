"""
文件工具函数模块

提供文件处理相关的工具函数：
1. 异步 MD5 计算（不阻塞主线程）
2. 音频时长获取
3. 文件格式验证
"""
import asyncio
import hashlib
import logging
import os
import subprocess
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Tuple, Optional

from app.config import MAX_FILE_SIZE

logger = logging.getLogger(__name__)

# ==================== 全局线程池（单例模式）====================

# 用于异步 MD5 计算的线程池
# max_workers=4：平衡并发性能和资源占用
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="md5_calc")


# ==================== 文件格式配置 ====================

# 支持的音频文件格式
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}


# ==================== MD5 计算函数 ====================

def calculate_md5_sync(file_path: str) -> str:
    """
    同步版本的 MD5 计算（在线程池中执行）
    
    参数:
        file_path: 文件路径
        
    返回:
        str: MD5 hash 的十六进制字符串
        
    注意:
        - 使用分块读取（1MB chunks），节省内存
        - 适用于大文件（不会一次性加载到内存）
    """
    hash_md5 = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            # 分块读取，每次 1MB
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception as e:
        logger.error(f"计算 MD5 失败: {file_path}, 错误: {e}", exc_info=True)
        raise


async def calculate_md5_async(file_path: str) -> str:
    """
    异步计算文件 MD5（不阻塞主线程）
    
    参数:
        file_path: 文件路径
        
    返回:
        str: MD5 hash 的十六进制字符串
        
    注意:
        - 使用 ThreadPoolExecutor 在线程池中执行同步计算
        - 不会阻塞 FastAPI 的主事件循环
        - 其他 API 请求可以正常响应
        
    示例:
        ```python
        file_hash = await calculate_md5_async("/path/to/file.mp3")
        ```
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, calculate_md5_sync, file_path)


# ==================== 音频时长获取 ====================

def get_audio_duration(file_path: str) -> float:
    """
    获取音频时长（秒）
    
    使用 ffprobe（FFmpeg 的一部分）获取音频时长
    支持所有格式：MP3, WAV, M4A, FLAC, OGG 等
    
    参数:
        file_path: 音频文件路径
        
    返回:
        float: 音频时长（秒）
        
    异常:
        FileNotFoundError: 文件不存在
        RuntimeError: 无法获取时长（ffprobe 未安装或文件格式不支持）
        
    注意:
        - 需要系统安装 FFmpeg（ffprobe 是 FFmpeg 的一部分）
        - Windows 需要将 FFmpeg 添加到 PATH
        - ffprobe 轻量级，只读取元数据，不加载整个音频文件
        
    示例:
        ```python
        duration = get_audio_duration("/path/to/audio.mp3")
        print(f"音频时长: {duration:.2f} 秒")
        ```
    """
    if not os.path.exists(file_path):
        logger.error(f"音频文件不存在: {file_path}")
        raise FileNotFoundError(f"音频文件不存在: {file_path}")
    
    try:
        # 使用 ffprobe 获取音频时长（只读取元数据，不加载整个文件）
        cmd = [
            "ffprobe",
            "-v", "quiet",           # 静默模式
            "-print_format", "json", # JSON 输出
            "-show_format",          # 显示格式信息
            file_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            timeout=10  # 10 秒超时
        )
        
        # 解析 JSON 输出
        data = json.loads(result.stdout)
        duration_str = data.get("format", {}).get("duration")
        
        if not duration_str:
            raise RuntimeError(f"无法从音频文件获取时长信息: {file_path}")
        
        duration = float(duration_str)
        if duration <= 0:
            raise RuntimeError(f"音频时长无效: {duration} 秒")
        
        logger.debug(f"获取音频时长: {file_path} -> {duration:.2f} 秒")
        return duration
        
    except FileNotFoundError:
        error_msg = (
            "ffprobe 未找到。请安装 FFmpeg：\n"
            "- Windows: 下载 FFmpeg 并添加到 PATH\n"
            "- macOS: brew install ffmpeg\n"
            "- Linux: apt-get install ffmpeg"
        )
        logger.error(error_msg)
        raise RuntimeError(error_msg)
    except subprocess.TimeoutExpired:
        error_msg = f"获取音频时长超时: {file_path}"
        logger.error(error_msg)
        raise RuntimeError(error_msg)
    except subprocess.CalledProcessError as e:
        error_msg = f"ffprobe 执行失败: {e.stderr}"
        logger.error(f"获取音频时长失败: {file_path}, 错误: {error_msg}")
        raise RuntimeError(f"无法获取音频时长: {error_msg}")
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        error_msg = f"解析 ffprobe 输出失败: {str(e)}"
        logger.error(f"获取音频时长失败: {file_path}, 错误: {error_msg}")
        raise RuntimeError(f"无法获取音频时长: {error_msg}")
    except Exception as e:
        logger.error(f"获取音频时长失败: {file_path}, 错误: {e}", exc_info=True)
        raise RuntimeError(f"无法获取音频时长: {str(e)}") from e


# ==================== 文件格式验证 ====================

def validate_audio_file(filename: str, file_size: int) -> Tuple[bool, str]:
    """
    验证音频文件格式和大小
    
    参数:
        filename: 文件名（用于检查扩展名）
        file_size: 文件大小（字节）
        
    返回:
        Tuple[bool, str]: (是否有效, 错误信息)
        - 如果有效: (True, "")
        - 如果无效: (False, "错误描述")
        
    验证规则:
        1. 检查文件扩展名是否在允许列表中
        2. 检查文件大小是否超过限制（MAX_FILE_SIZE）
        
    示例:
        ```python
        is_valid, error_msg = validate_audio_file("audio.mp3", 1024 * 1024)
        if not is_valid:
            print(f"文件无效: {error_msg}")
        ```
    """
    # 检查扩展名
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"不支持的文件格式: {ext}。支持的格式: {', '.join(ALLOWED_EXTENSIONS)}"
    
    # 检查文件大小
    if file_size > MAX_FILE_SIZE:
        max_size_mb = MAX_FILE_SIZE / (1024 * 1024)
        file_size_mb = file_size / (1024 * 1024)
        return False, f"文件大小超过限制: {file_size_mb:.2f}MB > {max_size_mb:.2f}MB"
    
    # 检查文件大小是否为正数
    if file_size <= 0:
        return False, "文件大小无效（必须大于 0）"
    
    return True, ""


# ==================== 辅助函数 ====================

def get_file_extension(filename: str) -> str:
    """
    获取文件扩展名（小写，包含点号）
    
    参数:
        filename: 文件名
        
    返回:
        str: 扩展名（如 ".mp3"）
        
    示例:
        ```python
        ext = get_file_extension("audio.mp3")  # 返回 ".mp3"
        ```
    """
    return Path(filename).suffix.lower()


def format_file_size(size_bytes: int) -> str:
    """
    格式化文件大小（人类可读格式）
    
    参数:
        size_bytes: 文件大小（字节）
        
    返回:
        str: 格式化后的文件大小（如 "1.5 MB"）
        
    示例:
        ```python
        size_str = format_file_size(1024 * 1024 * 1.5)  # 返回 "1.50 MB"
        ```
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"

