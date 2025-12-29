# -*- coding: utf-8 -*-
"""
查询 Episode 记录

用于查看数据库中的 Episode 记录，帮助调试。
"""
import sys
from pathlib import Path

# 添加 backend 目录到路径（从 scripts 目录往上到 backend）
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.models import SessionLocal, Episode


def query_episodes_by_filename(filename: str):
    """
    根据文件名查询 Episode 记录
    """
    db = SessionLocal()
    try:
        # 查询包含该文件名的 Episode
        episodes = db.query(Episode).filter(
            Episode.audio_path.like(f"%{filename}%")
        ).all()
        
        if not episodes:
            print(f"未找到包含 '{filename}' 的 Episode 记录")
            return
        
        print(f"找到 {len(episodes)} 条记录：\n")
        for episode in episodes:
            print(f"Episode ID: {episode.id}")
            print(f"  标题: {episode.title}")
            print(f"  文件路径: {episode.audio_path}")
            print(f"  文件哈希: {episode.file_hash}")
            print(f"  状态: {episode.transcription_status}")
            print()
        
    finally:
        db.close()


def list_all_episodes():
    """
    列出所有 Episode 记录
    """
    db = SessionLocal()
    try:
        episodes = db.query(Episode).all()
        
        if not episodes:
            print("数据库中没有 Episode 记录")
            return
        
        print(f"共有 {len(episodes)} 条 Episode 记录：\n")
        for episode in episodes:
            print(f"Episode ID: {episode.id}")
            print(f"  标题: {episode.title}")
            print(f"  文件路径: {episode.audio_path}")
            print(f"  文件哈希: {episode.file_hash}")
            print(f"  状态: {episode.transcription_status}")
            print()
        
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        filename = sys.argv[1]
        query_episodes_by_filename(filename)
    else:
        list_all_episodes()

