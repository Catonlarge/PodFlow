"""
手动导入音频和字幕数据的测试脚本

用途：快速验证数据库模型，无需实现 Whisper 转录服务
使用场景：
- 已有字幕 JSON 文件（符合 PRD 格式）
- 想快速测试数据库设计是否满足需求
- 开发前端时需要真实数据

使用方法：
    python -m scripts.import_test_data --audio "path/to/audio.mp3" --transcript "path/to/transcript.json"
"""

import sys
import os
import json
import hashlib
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
# 路径已正确，无需修改

from app.models import Base, Podcast, Episode, AudioSegment, TranscriptCue, SessionLocal, engine
from mutagen import File as MutagenFile


def get_audio_duration(audio_path: str) -> float:
    """
    获取音频时长（秒）
    
    使用 mutagen 库读取音频元数据
    如果失败，返回默认值 0.0
    """
    try:
        audio = MutagenFile(audio_path)
        if audio and audio.info:
            return float(audio.info.length)
    except Exception as e:
        print(f"[WARNING] 无法读取音频时长: {e}")
    return 0.0


def calculate_file_hash(file_path: str) -> str:
    """
    计算文件 MD5 hash
    """
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def validate_transcript_json(transcript_data: dict) -> bool:
    """
    验证字幕 JSON 格式是否符合 PRD 要求
    
    要求格式：
    {
        "cues": [
            {
                "start": 0.28,
                "end": 2.22,
                "speaker": "Lenny",  # 可选
                "text": "Thank you..."
            }
        ]
    }
    """
    if "cues" not in transcript_data:
        print("[ERROR] 字幕 JSON 缺少 'cues' 字段")
        return False
    
    cues = transcript_data["cues"]
    if not isinstance(cues, list):
        print("[ERROR] 'cues' 必须是数组")
        return False
    
    if len(cues) == 0:
        print("[ERROR] 'cues' 数组为空")
        return False
    
    # 验证每个 cue 的格式
    for idx, cue in enumerate(cues):
        required_fields = ["start", "end", "text"]
        for field in required_fields:
            if field not in cue:
                print(f"[ERROR] cue[{idx}] 缺少必需字段 '{field}'")
                return False
        
        # 验证时间戳类型
        if not isinstance(cue["start"], (int, float)):
            print(f"[ERROR] cue[{idx}].start 必须是数字")
            return False
        
        if not isinstance(cue["end"], (int, float)):
            print(f"[ERROR] cue[{idx}].end 必须是数字")
            return False
        
        # 验证时间戳逻辑
        if cue["start"] >= cue["end"]:
            print(f"[ERROR] cue[{idx}].start ({cue['start']}) 必须小于 end ({cue['end']})")
            return False
    
    print(f"[OK] 字幕 JSON 格式验证通过（共 {len(cues)} 个 cue）")
    return True


def import_audio_and_transcript(
    audio_path: str,
    transcript_json_path: str,
    podcast_title: str = None,
    episode_title: str = None,
    create_audio_segment: bool = True
) -> dict:
    """
    导入音频和字幕数据到数据库
    
    Args:
        audio_path: 音频文件路径
        transcript_json_path: 字幕 JSON 文件路径
        podcast_title: 播客名称（可选，如果不提供则创建本地音频）
        episode_title: 单集标题（可选，默认使用文件名）
        create_audio_segment: 是否创建 AudioSegment（默认 True，用于测试虚拟分段）
    
    Returns:
        dict: 导入结果，包含 episode_id 和统计信息
    """
    # 验证文件存在
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")
    
    if not os.path.exists(transcript_json_path):
        raise FileNotFoundError(f"字幕文件不存在: {transcript_json_path}")
    
    # 读取字幕 JSON
    print(f"\n[INFO] 读取字幕文件: {transcript_json_path}")
    with open(transcript_json_path, 'r', encoding='utf-8') as f:
        transcript_data = json.load(f)
    
    # 验证字幕格式
    if not validate_transcript_json(transcript_data):
        raise ValueError("字幕 JSON 格式不正确")
    
    # 读取音频元数据
    print(f"\n[INFO] 读取音频文件: {audio_path}")
    duration = get_audio_duration(audio_path)
    file_hash = calculate_file_hash(audio_path)
    file_size = os.path.getsize(audio_path)
    
    print(f"   - 时长: {duration:.2f} 秒 ({duration/60:.1f} 分钟)")
    print(f"   - 文件大小: {file_size / (1024*1024):.2f} MB")
    print(f"   - MD5 Hash: {file_hash[:16]}...")
    
    # 创建数据库会话
    db = SessionLocal()
    
    try:
        # 1. 检查是否已存在（根据 file_hash）
        existing_episode = db.query(Episode).filter(Episode.file_hash == file_hash).first()
        if existing_episode:
            print(f"\n[WARNING] 该音频已存在（Episode ID: {existing_episode.id}）")
            return {
                "success": False,
                "message": "音频已存在",
                "episode_id": existing_episode.id
            }
        
        # 2. 创建或获取 Podcast（如果提供了 podcast_title）
        podcast = None
        if podcast_title:
            podcast = db.query(Podcast).filter(Podcast.title == podcast_title).first()
            if not podcast:
                print(f"\n[INFO] 创建播客: {podcast_title}")
                podcast = Podcast(
                    title=podcast_title,
                    description=f"导入于 {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}",
                    created_at=datetime.utcnow()
                )
                db.add(podcast)
                db.commit()
                db.refresh(podcast)
                print(f"   [OK] Podcast ID: {podcast.id}")
        
        # 3. 创建 Episode
        if not episode_title:
            episode_title = os.path.basename(audio_path)
        
        print(f"\n[INFO] 创建 Episode: {episode_title}")
        episode = Episode(
            podcast_id=podcast.id if podcast else None,
            title=episode_title,
            original_filename=os.path.basename(audio_path),
            original_path=audio_path,
            audio_path=audio_path,  # 实际项目中应该复制到 backend/data/audios/
            file_hash=file_hash,
            file_size=file_size,
            duration=duration if duration > 0 else transcript_data["cues"][-1]["end"],
            language="en-US",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(episode)
        db.commit()
        db.refresh(episode)
        print(f"   [OK] Episode ID: {episode.id}")
        print(f"   - show_name: {episode.show_name}")
        print(f"   - needs_segmentation: {episode.needs_segmentation}")
        print(f"   - total_segments: {episode.total_segments}")
        
        # 4. 创建 AudioSegment（可选，用于测试虚拟分段）
        if create_audio_segment:
            print(f"\n[INFO] 创建 AudioSegment（虚拟分段）")
            
            if episode.needs_segmentation:
                # 长音频：创建多个 segment
                import math
                num_segments = episode.total_segments
                segment_duration = episode.segment_duration
                
                for i in range(num_segments):
                    start_time = i * segment_duration
                    end_time = min((i + 1) * segment_duration, episode.duration)
                    
                    segment = AudioSegment(
                        episode_id=episode.id,
                        segment_index=i,
                        segment_id=f"segment_{i:03d}",
                        segment_path=None,  # 虚拟分段，无物理文件
                        start_time=start_time,
                        end_time=end_time,
                        status="completed",  # 标记为已完成（手动导入）
                        retry_count=0,
                        transcription_started_at=datetime.utcnow(),
                        recognized_at=datetime.utcnow(),
                        created_at=datetime.utcnow()
                    )
                    db.add(segment)
                    print(f"   - Segment {i}: {start_time:.1f}s - {end_time:.1f}s")
            else:
                # 短音频：创建单个 segment
                segment = AudioSegment(
                    episode_id=episode.id,
                    segment_index=0,
                    segment_id="segment_000",
                    segment_path=None,
                    start_time=0.0,
                    end_time=episode.duration,
                    status="completed",
                    retry_count=0,
                    transcription_started_at=datetime.utcnow(),
                    recognized_at=datetime.utcnow(),
                    created_at=datetime.utcnow()
                )
                db.add(segment)
                print(f"   - Segment 0: 0.0s - {episode.duration:.1f}s（短音频，单段）")
            
            db.commit()
            print(f"   [OK] 创建了 {episode.total_segments} 个 AudioSegment")
        
        # 5. 导入 TranscriptCue
        print(f"\n[INFO] 导入字幕（{len(transcript_data['cues'])} 个 cue）")
        
        for idx, cue_data in enumerate(transcript_data["cues"], start=1):
            # 查找对应的 AudioSegment（如果创建了）
            segment_id = None
            if create_audio_segment:
                for seg in db.query(AudioSegment).filter(
                    AudioSegment.episode_id == episode.id
                ).all():
                    if seg.start_time <= cue_data["start"] < seg.end_time:
                        segment_id = seg.id
                        break
            
            cue = TranscriptCue(
                episode_id=episode.id,
                segment_id=segment_id,
                cue_index=idx,  # 全局连续索引
                start_time=cue_data["start"],
                end_time=cue_data["end"],
                speaker=cue_data.get("speaker", "Unknown"),
                text=cue_data["text"],
                created_at=datetime.utcnow()
            )
            db.add(cue)
            
            if idx % 100 == 0:
                print(f"   - 已导入 {idx}/{len(transcript_data['cues'])} 个 cue...")
        
        db.commit()
        print(f"   [OK] 全部导入完成")
        
        # 6. 验证数据
        print(f"\n[INFO] 数据验证")
        cue_count = db.query(TranscriptCue).filter(
            TranscriptCue.episode_id == episode.id
        ).count()
        print(f"   - TranscriptCue 数量: {cue_count}")
        
        # 验证 cue_index 连续性
        cues = db.query(TranscriptCue).filter(
            TranscriptCue.episode_id == episode.id
        ).order_by(TranscriptCue.cue_index).all()
        
        is_continuous = all(
            cues[i].cue_index == i + 1 
            for i in range(len(cues))
        )
        print(f"   - cue_index 连续性: {'[OK] 通过' if is_continuous else '[ERROR] 失败'}")
        
        # 验证时间排序
        is_sorted = all(
            cues[i].start_time <= cues[i+1].start_time 
            for i in range(len(cues) - 1)
        )
        print(f"   - 时间排序: {'[OK] 通过' if is_sorted else '[ERROR] 失败'}")
        
        return {
            "success": True,
            "episode_id": episode.id,
            "podcast_id": podcast.id if podcast else None,
            "cue_count": cue_count,
            "duration": episode.duration,
            "needs_segmentation": episode.needs_segmentation,
            "total_segments": episode.total_segments
        }
    
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] 导入失败: {e}")
        raise
    
    finally:
        db.close()


def main():
    """
    命令行入口
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="导入音频和字幕数据到数据库")
    parser.add_argument("--audio", required=True, help="音频文件路径")
    parser.add_argument("--transcript", required=True, help="字幕 JSON 文件路径")
    parser.add_argument("--podcast", help="播客名称（可选）")
    parser.add_argument("--title", help="单集标题（可选，默认使用文件名）")
    parser.add_argument("--no-segment", action="store_true", help="不创建 AudioSegment")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("=" * 60)
    print("PodFlow - 手动导入音频和字幕数据")
    print("=" * 60)
    print("=" * 60)
    
    # 确保数据库表已创建
    Base.metadata.create_all(bind=engine)
    
    result = import_audio_and_transcript(
        audio_path=args.audio,
        transcript_json_path=args.transcript,
        podcast_title=args.podcast,
        episode_title=args.title,
        create_audio_segment=not args.no_segment
    )
    
    if result["success"]:
        print("\n" + "=" * 60)
        print("[SUCCESS] 导入成功！")
        print("=" * 60)
        print(f"Episode ID: {result['episode_id']}")
        print(f"字幕数量: {result['cue_count']}")
        print(f"音频时长: {result['duration']:.1f} 秒")
        print(f"需要分段: {result['needs_segmentation']}")
        print(f"总段数: {result['total_segments']}")
        print("\n下一步：")
        print("  1. 运行测试验证数据: pytest tests/test_import_data.py -v")
        print("  2. 或者启动后端 API: uvicorn app.main:app --reload")
    else:
        print(f"\n[WARNING] {result['message']}")


if __name__ == "__main__":
    main()

