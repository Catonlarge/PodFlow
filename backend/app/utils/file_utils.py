# -*- coding: utf-8 -*-
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


# ==================== 文件内容真伪验证 ====================

def is_valid_audio_header(file_path: str) -> bool:
    """
    读取文件头前几个字节，粗略判断是否为音频/视频文件
    
    通过检查文件头的 Magic Bytes 来识别真实的音频文件格式，防止
    HTML、JSON、文本文件伪装成音频文件混入系统。
    
    参数:
        file_path: 文件路径
        
    返回:
        bool: True 表示文件头看起来像音频/视频，False 表示可能是文本文件
        
    验证规则:
        1. 检查文件开头是否包含 HTML/JSON/文本标识符（如 "<!DO", "<htm", "{", "Traceback"）
        2. 如果是纯文本开头，直接返回 False
        3. 对于二进制文件（包含音频 Magic Bytes），返回 True
        
    注意:
        - 此函数主要用于拦截明显的文本文件伪装
        - 更严格的音频格式验证由 get_audio_duration 完成（需要 ffprobe）
        - MP3 文件可能没有 ID3 标签，所以不强制要求特定的 Magic Bytes
        
    示例:
        ```python
        if not is_valid_audio_header("/path/to/file.mp3"):
            raise ValueError("文件内容异常：这看起来像是一个文本文件而不是音频")
        ```
    """
    try:
        with open(file_path, 'rb') as f:
            header = f.read(50)  # 读取前 50 字节用于检查
            
        if len(header) == 0:
            logger.warning(f"文件为空: {file_path}")
            return False
        
        # 检查是否为纯文本/HTML/JSON（这是核心拦截逻辑）
        try:
            # 尝试解码为文本，检查是否包含明显的文本标识符
            text_start = header.decode('utf-8', errors='ignore').strip()
            
            # 检查常见的文本文件开头标识
            text_indicators = ['<!DO', '<htm', '<html', '<HTML', '{', '[', 
                             'Traceback', 'Error', 'Exception', 'fake audio']
            
            for indicator in text_indicators:
                if text_start.startswith(indicator):
                    logger.warning(
                        f"检测到非音频文件头 (看起来像文本): "
                        f"{text_start[:50]}"
                    )
                    return False
        except Exception:
            # 如果解码失败，可能是二进制文件，继续检查 Magic Bytes
            pass
        
        # 检查常见的音频/视频文件头特征 (Magic Numbers)
        header_hex = header[:10].hex().upper()
        
        # MP3 文件特征:
        # 1. ID3 标签: 49 44 33 (ASCII "ID3")
        # 2. MP3 frame sync: FF F3, FF F2, FF FB, FF FA (MPEG-1 Layer III)
        # 3. 无 ID3 标签的 MP3 直接以 FF 开头（帧同步）
        
        # WAV 文件: 52 49 46 46 (ASCII "RIFF")
        # FLAC 文件: 66 4C 61 43 (ASCII "fLaC")
        # OGG 文件: 4F 67 67 53 (ASCII "OggS")
        # M4A/MP4: 通常以 00 00 00 ... 66 74 79 70 开头 (ftyp)
        
        # 检查是否有已知的音频文件头
        if header[:3] == b'ID3':  # ID3 tag (MP3)
            return True
        if header[:4] == b'RIFF':  # WAV
            return True
        if header[:4] == b'fLaC':  # FLAC
            return True
        if header[:4] == b'OggS':  # OGG
            return True
        # 检查 M4A/MP4 文件：前 4 字节是 box size，接下来 4 字节是 box type "ftyp"
        # 或者前 3 字节是 \x00\x00\x00 且包含 ftyp
        if len(header) >= 8 and header[:3] == b'\x00\x00\x00' and b'ftyp' in header[:20]:
            return True
        
        # MP3 无 ID3 标签：检查帧同步 (FF 后跟 F 开头的字节)
        if len(header) >= 2:
            if header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
                # 这是一个 MP3 帧同步标记
                return True
        
        # 如果文件是二进制（包含大量非打印字符），且没有明显的文本标识，
        # 可能是有效的音频文件（即使我们没有识别出特定的 Magic Bytes）
        # 这里采用宽松策略：只要不是明显的文本，就允许通过
        # 最终的验证由 get_audio_duration 完成（需要 ffprobe）
        
        # 统计非打印字符比例
        non_printable = sum(1 for b in header if b < 0x20 and b not in [0x09, 0x0A, 0x0D])
        if non_printable > len(header) * 0.3:  # 超过 30% 是非打印字符
            # 可能是二进制文件（音频）
            return True
        
        # 如果到这里还没有返回，文件可能是文本但通过了前面的检查
        # 为了安全，返回 False
        logger.warning(f"无法确定文件类型，文件头: {header_hex[:20]}")
        return False
        
    except Exception as e:
        logger.error(f"文件头校验失败: {file_path}, 错误: {e}", exc_info=True)
        return False


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

