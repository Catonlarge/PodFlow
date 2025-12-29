# -*- coding: utf-8 -*-
"""
根据 Episode ID 删除 Episode 记录

用于清理数据库中的 Episode 记录，以便重新上传。
"""
import os
import sys
from pathlib import Path

# 添加 backend 目录到路径（从 scripts 目录往上到 backend）
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.models import SessionLocal, Episode


def delete_episode_by_id(episode_id: int) -> dict:
    """
    根据 Episode ID 删除对应的 Episode 记录
    
    参数:
        episode_id: Episode ID
        
    返回:
        dict: 删除结果
    """
    db = SessionLocal()
    try:
        # 查询 Episode
        episode = db.query(Episode).filter(Episode.id == episode_id).first()
        
        if not episode:
            return {
                "success": False,
                "message": f"Episode {episode_id} 不存在",
                "episode_id": episode_id
            }
        
        episode_title = episode.title
        file_hash = episode.file_hash
        audio_path = episode.audio_path
        
        # 删除 Episode（级联删除会自动处理关联的 AudioSegment、TranscriptCue 等）
        db.delete(episode)
        db.commit()
        
        return {
            "success": True,
            "message": f"Episode {episode_id} 已删除",
            "episode_id": episode_id,
            "episode_title": episode_title,
            "file_hash": file_hash,
            "audio_path": audio_path
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "message": f"删除失败: {str(e)}",
            "episode_id": episode_id,
            "error": str(e)
        }
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python delete_episode_by_id.py <Episode ID>")
        print("示例: python delete_episode_by_id.py 2")
        sys.exit(1)
    
    try:
        episode_id = int(sys.argv[1])
    except ValueError:
        print(f"[错误] 无效的 Episode ID: {sys.argv[1]}")
        sys.exit(1)
    
    result = delete_episode_by_id(episode_id)
    
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

