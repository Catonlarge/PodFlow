"""
修复 Episode 转录状态不一致问题

用于修复那些所有 Segment 都已完成但 Episode 状态不是 'completed' 的情况。

使用方法:
    python -m app.utils.fix_episode_status [episode_id]
    或
    python backend/app/utils/fix_episode_status.py [episode_id]
    或
    python -m app.utils.fix_episode_status all  # 修复所有有问题的 Episode

功能:
    1. 检查指定 Episode 的状态是否与实际 Segment 状态一致
    2. 如果不一致，自动修复状态
    3. 支持修复单个 Episode 或所有有问题的 Episode
"""

import os
import sys
from pathlib import Path

# 添加 backend 目录到 Python 路径
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from app.models import Episode, AudioSegment, TranscriptCue, get_db


def fix_episode_status(episode_id: int, dry_run: bool = False):
    """
    修复指定 Episode 的转录状态
    
    Args:
        episode_id: Episode ID
        dry_run: 如果为 True，只检查不修复
    """
    db = next(get_db())
    
    try:
        ep = db.query(Episode).filter(Episode.id == episode_id).first()
        
        if not ep:
            print(f"Episode {episode_id} 不存在")
            return False
        
        segs = db.query(AudioSegment).filter(
            AudioSegment.episode_id == episode_id
        ).all()
        
        if not segs:
            print(f"Episode {episode_id} 没有 Segment，跳过")
            return False
        
        # 修复 Segment 状态不一致问题
        segment_fixed = False
        from app.models import TranscriptCue
        
        for seg in segs:
            # 情况1: 如果 Segment 状态是 processing 但有错误信息，应该改为 failed
            if seg.status == "processing" and seg.error_message:
                print(f"  Segment {seg.segment_index} 状态不一致: processing 但有错误信息，修复为 failed")
                if not dry_run:
                    seg.status = "failed"
                    segment_fixed = True
            
            # 情况2: 如果 Segment 状态是 failed 但有字幕数据，应该改为 completed
            elif seg.status == "failed":
                cues_count = db.query(TranscriptCue).filter(
                    TranscriptCue.segment_id == seg.id
                ).count()
                if cues_count > 0:
                    print(f"  Segment {seg.segment_index} 状态不一致: failed 但有 {cues_count} 条字幕，修复为 completed")
                    if not dry_run:
                        seg.status = "completed"
                        seg.error_message = None
                        segment_fixed = True
        
        if segment_fixed:
            db.commit()
            # 重新查询以获取更新后的状态
            segs = db.query(AudioSegment).filter(
                AudioSegment.episode_id == episode_id
            ).all()
        
        # 统计各状态的 Segment 数量
        completed_count = sum(1 for s in segs if s.status == "completed")
        failed_count = sum(1 for s in segs if s.status == "failed")
        processing_count = sum(1 for s in segs if s.status == "processing")
        pending_count = sum(1 for s in segs if s.status == "pending")
        total_count = len(segs)
        
        # 判断正确的状态
        if completed_count == total_count:
            correct_status = "completed"
        elif failed_count == total_count:
            correct_status = "failed"
        elif processing_count > 0 or pending_count > 0:
            correct_status = "processing"
        elif completed_count > 0 and failed_count > 0:
            correct_status = "partial_failed"
        else:
            correct_status = "processing"  # 默认
        
        # 检查是否需要修复
        if ep.transcription_status == correct_status:
            print(f"Episode {episode_id} 状态正确: {correct_status}")
            return False
        
        print(f"Episode {episode_id} 状态不一致:")
        print(f"  当前状态: {ep.transcription_status}")
        print(f"  正确状态: {correct_status}")
        print(f"  Segment 统计: completed={completed_count}, failed={failed_count}, "
              f"processing={processing_count}, pending={pending_count}")
        
        if dry_run:
            print(f"  [DRY RUN] 应该修复为: {correct_status}")
            return True
        
        # 修复状态
        ep.transcription_status = correct_status
        db.commit()
        
        print(f"  [FIXED] 已修复为: {correct_status}")
        return True
        
    finally:
        db.close()


def fix_all_episodes(dry_run: bool = False):
    """
    修复所有有问题的 Episode
    
    Args:
        dry_run: 如果为 True，只检查不修复
    """
    db = next(get_db())
    
    try:
        episodes = db.query(Episode).all()
        fixed_count = 0
        
        for ep in episodes:
            if fix_episode_status(ep.id, dry_run=dry_run):
                fixed_count += 1
        
        print(f"\n总共修复了 {fixed_count} 个 Episode")
        
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python -m app.utils.fix_episode_status <episode_id|all> [--dry-run]")
        print("示例:")
        print("  python -m app.utils.fix_episode_status 10")
        print("  python -m app.utils.fix_episode_status all")
        print("  python -m app.utils.fix_episode_status 10 --dry-run")
        sys.exit(1)
    
    episode_arg = sys.argv[1]
    dry_run = "--dry-run" in sys.argv
    
    if episode_arg == "all":
        fix_all_episodes(dry_run=dry_run)
    else:
        try:
            episode_id = int(episode_arg)
            fix_episode_status(episode_id, dry_run=dry_run)
        except ValueError:
            print("错误: episode_id 必须是整数或 'all'")
            sys.exit(1)

