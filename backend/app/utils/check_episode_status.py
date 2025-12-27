"""
检查 Episode 转录状态脚本

用于检查指定 Episode 的转录状态，诊断状态不一致问题。

使用方法:
    python -m app.utils.check_episode_status [episode_id]
    或
    python backend/app/utils/check_episode_status.py [episode_id]

功能:
    1. 检查 Episode 的 transcription_status
    2. 统计所有 AudioSegment 的状态分布
    3. 诊断状态不一致问题（如所有段都完成但状态不是 completed）
"""

import os
import sys
from pathlib import Path

# 添加 backend 目录到 Python 路径
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from app.models import Episode, AudioSegment, get_db


def check_episode_status(episode_id: int):
    """
    检查指定 Episode 的转录状态
    
    Args:
        episode_id: Episode ID
    """
    db = next(get_db())
    
    try:
        ep = db.query(Episode).filter(Episode.id == episode_id).first()
        
        if not ep:
            print(f"Episode {episode_id} 不存在")
            return
        
        print(f"Episode {episode_id} 信息:")
        print(f"  标题: {ep.title}")
        print(f"  当前状态: {ep.transcription_status}")
        print(f"  状态显示: {ep.transcription_status_display}")
        print(f"  转录进度: {ep.transcription_progress}%")
        
        segs = db.query(AudioSegment).filter(
            AudioSegment.episode_id == episode_id
        ).order_by(AudioSegment.segment_index).all()
        
        print(f"\n分段统计:")
        print(f"  总段数: {len(segs)}")
        print(f"  已完成: {sum(1 for s in segs if s.status == 'completed')}")
        print(f"  失败: {sum(1 for s in segs if s.status == 'failed')}")
        print(f"  处理中: {sum(1 for s in segs if s.status == 'processing')}")
        print(f"  等待中: {sum(1 for s in segs if s.status == 'pending')}")
        
        if segs:
            print(f"\n各段详细状态:")
            for seg in segs:
                print(f"  Segment {seg.segment_index} ({seg.segment_id}): {seg.status}")
                if seg.error_message:
                    print(f"    错误信息: {seg.error_message}")
        
        # 诊断状态不一致问题
        all_completed = all(seg.status == "completed" for seg in segs) if segs else False
        has_failed = any(seg.status == "failed" for seg in segs)
        has_processing = any(seg.status == "processing" for seg in segs)
        has_pending = any(seg.status == "pending" for seg in segs)
        
        print(f"\n状态诊断:")
        if all_completed and ep.transcription_status != "completed":
            print(f"  [WARNING] 问题发现：所有段都已完成，但 Episode 状态是 '{ep.transcription_status}'，应该是 'completed'")
        elif not all_completed and ep.transcription_status == "completed":
            print(f"  [WARNING] 问题发现：Episode 状态是 'completed'，但并非所有段都已完成")
        elif has_failed and not has_processing and not has_pending:
            # 所有段要么完成要么失败，没有进行中的
            completed_count = sum(1 for s in segs if s.status == "completed")
            failed_count = sum(1 for s in segs if s.status == "failed")
            if completed_count > 0 and failed_count > 0:
                if ep.transcription_status != "partial_failed":
                    print(f"  [WARNING] 问题发现：有完成也有失败的段，但 Episode 状态是 '{ep.transcription_status}'，应该是 'partial_failed'")
            elif completed_count == 0:
                if ep.transcription_status != "failed":
                    print(f"  [WARNING] 问题发现：所有段都失败，但 Episode 状态是 '{ep.transcription_status}'，应该是 'failed'")
        else:
            print(f"  [OK] 状态一致")
            
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            episode_id = int(sys.argv[1])
        except ValueError:
            print("错误: episode_id 必须是整数")
            sys.exit(1)
    else:
        print("用法: python -m app.utils.check_episode_status <episode_id>")
        print("示例: python -m app.utils.check_episode_status 10")
        sys.exit(1)
    
    check_episode_status(episode_id)

