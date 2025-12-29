# -*- coding: utf-8 -*-
"""
根据文件路径删除 Episode 记录

用于清理数据库中的 Episode 记录，以便重新上传。
"""
import os
import sys
from pathlib import Path

# 添加 backend 目录到路径（从 scripts 目录往上到 backend）
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.models import SessionLocal, Episode


def delete_episode_by_path(audio_path: str) -> dict:
    """
    根据音频文件路径删除对应的 Episode 记录
    
    参数:
        audio_path: 音频文件路径（绝对路径或相对路径）
        
    返回:
        dict: 删除结果
    """
    # 规范化路径（处理相对路径和绝对路径）
    audio_path_normalized = os.path.normpath(audio_path)
    
    # 如果是相对路径，转换为绝对路径（相对于 backend 目录）
    if not os.path.isabs(audio_path_normalized):
        backend_dir = Path(__file__).parent.parent
        audio_path_normalized = str((backend_dir / audio_path_normalized).resolve())
    
    db = SessionLocal()
    try:
        # 查询 Episode
        episode = db.query(Episode).filter(
            Episode.audio_path == audio_path_normalized
        ).first()
        
        if not episode:
            # 尝试使用文件名匹配（处理路径格式差异）
            audio_filename = os.path.basename(audio_path_normalized)
            episode = db.query(Episode).filter(
                Episode.audio_path.like(f"%{audio_filename}%")
            ).first()
        
        if not episode:
            return {
                "success": False,
                "message": f"未找到对应的 Episode 记录: {audio_path_normalized}",
                "episode_id": None
            }
        
        episode_id = episode.id
        episode_title = episode.title
        file_hash = episode.file_hash
        
        # 删除 Episode（级联删除会自动处理关联的 AudioSegment、TranscriptCue 等）
        db.delete(episode)
        db.commit()
        
        return {
            "success": True,
            "message": f"Episode {episode_id} 已删除",
            "episode_id": episode_id,
            "episode_title": episode_title,
            "file_hash": file_hash,
            "audio_path": audio_path_normalized
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "message": f"删除失败: {str(e)}",
            "episode_id": None,
            "error": str(e)
        }
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python delete_episode_by_path.py <音频文件路径>")
        print("示例: python delete_episode_by_path.py \"data/sample_audio/audio.mp3\"")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    
    result = delete_episode_by_path(audio_file)
    
    if result["success"]:
        print(f"[成功] {result['message']}")
        print(f"   Episode ID: {result['episode_id']}")
        print(f"   标题: {result['episode_title']}")
        print(f"   文件路径: {result['audio_path']}")
        print(f"   文件哈希: {result['file_hash']}")
    else:
        print(f"[失败] {result['message']}")
        if "error" in result:
            print(f"   错误详情: {result['error']}")
        sys.exit(1)

