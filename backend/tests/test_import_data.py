"""
测试手动导入音频和字幕数据的功能

验证：
- 导入脚本是否正确创建数据库记录
- 数据完整性（时间排序等）
- 与数据库模型的集成
"""

import pytest
import os
import json
import tempfile
from datetime import datetime

from app.models import Podcast, Episode, AudioSegment, TranscriptCue, SessionLocal
from app.services.import_test_data import (
    validate_transcript_json,
    import_audio_and_transcript
)


@pytest.fixture
def sample_transcript_data():
    """示例字幕数据（符合 PRD 格式）"""
    return {
        "cues": [
            {"start": 0.0, "end": 2.0, "speaker": "Speaker1", "text": "Hello world."},
            {"start": 2.5, "end": 5.0, "speaker": "Speaker2", "text": "This is a test."},
            {"start": 5.5, "end": 8.0, "speaker": "Speaker1", "text": "How are you?"},
            {"start": 8.5, "end": 12.0, "speaker": "Speaker2", "text": "I'm doing great, thanks!"}
        ]
    }


@pytest.fixture
def sample_transcript_file(sample_transcript_data, tmp_path):
    """创建临时字幕 JSON 文件"""
    transcript_file = tmp_path / "test_transcript.json"
    with open(transcript_file, 'w', encoding='utf-8') as f:
        json.dump(sample_transcript_data, f)
    return str(transcript_file)


@pytest.fixture
def sample_audio_file(tmp_path):
    """创建临时音频文件（空文件，仅用于测试）"""
    audio_file = tmp_path / "test_audio.mp3"
    audio_file.write_bytes(b"fake audio data")
    return str(audio_file)


class TestTranscriptValidation:
    """测试字幕 JSON 格式验证"""
    
    def test_valid_transcript(self, sample_transcript_data):
        """测试有效的字幕格式"""
        assert validate_transcript_json(sample_transcript_data) is True
    
    def test_missing_cues_field(self):
        """测试缺少 cues 字段"""
        invalid_data = {"data": []}
        assert validate_transcript_json(invalid_data) is False
    
    def test_empty_cues_array(self):
        """测试空的 cues 数组"""
        invalid_data = {"cues": []}
        assert validate_transcript_json(invalid_data) is False
    
    def test_missing_required_fields(self):
        """测试缺少必需字段"""
        invalid_data = {
            "cues": [
                {"start": 0.0, "text": "Missing end field"}
            ]
        }
        assert validate_transcript_json(invalid_data) is False
    
    def test_invalid_time_order(self):
        """测试无效的时间顺序（start >= end）"""
        invalid_data = {
            "cues": [
                {"start": 5.0, "end": 2.0, "text": "Invalid time"}
            ]
        }
        assert validate_transcript_json(invalid_data) is False
    
    def test_optional_speaker_field(self):
        """测试 speaker 字段为可选"""
        valid_data = {
            "cues": [
                {"start": 0.0, "end": 2.0, "text": "No speaker field"}
            ]
        }
        assert validate_transcript_json(valid_data) is True


class TestImportData:
    """测试数据导入功能"""
    
    def test_import_success(self, sample_audio_file, sample_transcript_file, db_session):
        """测试成功导入音频和字幕"""
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file,
            episode_title="测试音频",
            create_audio_segment=True
        )
        
        assert result["success"] is True
        assert result["episode_id"] is not None
        assert result["cue_count"] == 4
        
        # 验证 Episode 创建成功
        episode = db_session.query(Episode).filter(
            Episode.id == result["episode_id"]
        ).first()
        assert episode is not None
        assert episode.title == "测试音频"
        assert episode.show_name == "本地音频"  # 无 podcast_id
    
    def test_import_with_podcast(self, sample_audio_file, sample_transcript_file, db_session):
        """测试导入时创建 Podcast"""
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file,
            podcast_title="测试播客",
            episode_title="测试单集",
            create_audio_segment=True
        )
        
        assert result["success"] is True
        assert result["podcast_id"] is not None
        
        # 验证 Podcast 创建成功
        podcast = db_session.query(Podcast).filter(
            Podcast.id == result["podcast_id"]
        ).first()
        assert podcast is not None
        assert podcast.title == "测试播客"
        
        # 验证 Episode 关联 Podcast
        episode = db_session.query(Episode).filter(
            Episode.id == result["episode_id"]
        ).first()
        assert episode.podcast_id == podcast.id
        assert episode.show_name == "测试播客"
    
    def test_duplicate_import_prevention(self, sample_audio_file, sample_transcript_file, db_session):
        """测试防止重复导入（基于 file_hash）"""
        # 第一次导入
        result1 = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file
        )
        assert result1["success"] is True
        
        # 第二次导入相同文件
        result2 = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file
        )
        assert result2["success"] is False
        assert result2["message"] == "音频已存在"
        assert result2["episode_id"] == result1["episode_id"]
    
    def test_cue_time_sorting(self, sample_audio_file, sample_transcript_file, db_session):
        """测试 cue 按时间排序"""
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file
        )
        
        # 查询所有 cue，按 start_time 排序
        cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.episode_id == result["episode_id"]
        ).order_by(TranscriptCue.start_time).all()
        
        # 验证时间递增
        for i in range(len(cues) - 1):
            assert cues[i].start_time <= cues[i+1].start_time
    
    def test_audio_segment_creation_short_audio(self, sample_audio_file, sample_transcript_file, db_session):
        """测试短音频创建单个 AudioSegment"""
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file,
            create_audio_segment=True
        )
        
        episode = db_session.query(Episode).filter(
            Episode.id == result["episode_id"]
        ).first()
        
        # 音频时长 < 180 秒，应该只创建 1 个 segment
        segments = db_session.query(AudioSegment).filter(
            AudioSegment.episode_id == episode.id
        ).all()
        
        if not episode.needs_segmentation:
            assert len(segments) == 1
            assert segments[0].segment_index == 0
            assert segments[0].segment_id == "segment_000"
            assert segments[0].start_time == 0.0
            assert segments[0].end_time == episode.duration
    
    def test_cue_segment_association(self, sample_audio_file, sample_transcript_file, db_session):
        """测试 TranscriptCue 与 AudioSegment 的关联"""
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file,
            create_audio_segment=True
        )
        
        # 查询所有 cue
        cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.episode_id == result["episode_id"]
        ).all()
        
        # 如果创建了 AudioSegment，每个 cue 都应该关联一个 segment
        segments = db_session.query(AudioSegment).filter(
            AudioSegment.episode_id == result["episode_id"]
        ).all()
        
        if len(segments) > 0:
            for cue in cues:
                # 验证 cue 关联了某个 segment
                if cue.segment_id:
                    segment = db_session.query(AudioSegment).filter(
                        AudioSegment.id == cue.segment_id
                    ).first()
                    assert segment is not None
                    # 验证 cue 的时间在 segment 的时间范围内
                    assert segment.start_time <= cue.start_time < segment.end_time
    
    def test_import_without_audio_segment(self, sample_audio_file, sample_transcript_file, db_session):
        """测试不创建 AudioSegment 的导入"""
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=sample_transcript_file,
            create_audio_segment=False
        )
        
        # 验证没有创建 AudioSegment
        segments = db_session.query(AudioSegment).filter(
            AudioSegment.episode_id == result["episode_id"]
        ).all()
        assert len(segments) == 0
        
        # 验证 TranscriptCue 的 segment_id 为 None
        cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.episode_id == result["episode_id"]
        ).all()
        for cue in cues:
            assert cue.segment_id is None
    
    def test_speaker_default_value(self, sample_audio_file, tmp_path, db_session):
        """测试 speaker 字段的默认值"""
        # 创建没有 speaker 字段的字幕文件
        transcript_data = {
            "cues": [
                {"start": 0.0, "end": 2.0, "text": "No speaker"}
            ]
        }
        transcript_file = tmp_path / "no_speaker.json"
        with open(transcript_file, 'w', encoding='utf-8') as f:
            json.dump(transcript_data, f)
        
        result = import_audio_and_transcript(
            audio_path=sample_audio_file,
            transcript_json_path=str(transcript_file)
        )
        
        # 验证 speaker 默认为 "Unknown"
        cue = db_session.query(TranscriptCue).filter(
            TranscriptCue.episode_id == result["episode_id"]
        ).first()
        assert cue.speaker == "Unknown"

