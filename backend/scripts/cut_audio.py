# -*- coding: utf-8 -*-
"""
音频切割工具脚本

用于从音频文件中切出指定时长的片段，保持原始格式。
"""
import os
import subprocess
import sys
from pathlib import Path


def cut_audio_first_n_minutes(audio_path: str, minutes: float, output_path: str = None) -> str:
    """
    切出音频文件的前 N 分钟
    
    参数:
        audio_path: 输入音频文件路径
        minutes: 要切出的分钟数
        output_path: 输出文件路径（可选，默认在输入文件同目录下）
        
    返回:
        str: 输出文件路径
        
    异常:
        FileNotFoundError: 输入文件不存在或 FFmpeg 未安装
        RuntimeError: FFmpeg 执行失败
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")
    
    # 确定输出路径
    if output_path is None:
        input_path = Path(audio_path)
        output_path = str(input_path.parent / f"{input_path.stem}_first_{int(minutes)}min{input_path.suffix}")
    
    # 计算时长（秒）
    duration_seconds = minutes * 60
    
    # 使用 FFmpeg 切出前 N 分钟
    # 注意：使用 -c copy 可以保持原始格式，但可能不够精确
    # 如果需要精确切割，应该重新编码（但会改变格式）
    # 这里使用 -c copy 以保持原始格式和快速处理
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", audio_path,
                "-t", str(duration_seconds),  # 从开头切出指定时长
                "-c", "copy",  # 保持原始编码格式（快速，但可能不够精确）
                output_path
            ],
            check=True,
            capture_output=True,
            text=True
        )
        print(f"[成功] 成功切出前 {minutes} 分钟音频")
        print(f"   输入: {audio_path}")
        print(f"   输出: {output_path}")
        return output_path
        
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr if isinstance(e.stderr, str) else e.stderr.decode('utf-8', errors='ignore')
        raise RuntimeError(f"FFmpeg 执行失败: {error_msg}") from e
    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg 未安装或不在 PATH 中。\n"
            "请安装 FFmpeg 并添加到系统 PATH。"
        )


if __name__ == "__main__":
    # 命令行使用
    if len(sys.argv) < 2:
        print("用法: python cut_audio.py <音频文件路径> [分钟数] [输出路径]")
        print("示例: python cut_audio.py audio.mp3 15")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    minutes = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0
    output_file = sys.argv[3] if len(sys.argv) > 3 else None
    
    try:
        result_path = cut_audio_first_n_minutes(audio_file, minutes, output_file)
        print(f"\n完成！输出文件: {result_path}")
    except Exception as e:
        print(f"[错误] {e}", file=sys.stderr)
        sys.exit(1)

