"""
TranscriptionService 测试用例

测试虚拟分段转录流程：
1. 创建虚拟分段（短音频/长音频）
2. 单个分段转录
3. 保存字幕到数据库（绝对时间计算）
4. 完整转录流程
5. 重试机制
6. 字幕排序（Critical）
"""
import os
import pytest
import tempfile
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
from datetime import datetime

from app.models import Episode, AudioSegment, TranscriptCue
from app.services.transcription_service import TranscriptionService
from app.services.whisper_service import WhisperService
from app.config import SEGMENT_DURATION


class TestCreateVirtualSegments:
    """测试虚拟分段创建逻辑"""
    
    def test_create_virtual_segments_short_audio(self, db_session):
        """测试短音频创建 1 个 segment"""
        # 创建 Episode（短音频，小于 SEGMENT_DURATION）
        episode = Episode(
            title="Short Audio Test",
            file_hash="short_audio_001",
            duration=60.0  # 60 秒，小于 180 秒
        )
        db_session.add(episode)
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 创建虚拟分段
        segments = service.create_virtual_segments(episode)
        
        # 验证
        assert len(segments) == 1
        assert segments[0].episode_id == episode.id
        assert segments[0].segment_index == 0
        assert segments[0].segment_id == "segment_000"
        assert segments[0].start_time == 0.0
        assert segments[0].end_time == 60.0
        assert segments[0].status == "pending"
        assert segments[0].segment_path is None
        
        # 验证数据库
        db_segments = db_session.query(AudioSegment).filter(
            AudioSegment.episode_id == episode.id
        ).all()
        assert len(db_segments) == 1
    
    def test_create_virtual_segments_long_audio(self, db_session):
        """测试长音频创建多个 segment"""
        # 创建 Episode（长音频，需要多个分段）
        episode = Episode(
            title="Long Audio Test",
            file_hash="long_audio_001",
            duration=600.0  # 600 秒，需要 ceil(600/180) = 4 个分段
        )
        db_session.add(episode)
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 创建虚拟分段
        segments = service.create_virtual_segments(episode)
        
        # 验证
        expected_segments = 4  # ceil(600/180) = 4
        assert len(segments) == expected_segments
        
        # 验证每个分段的时间范围
        assert segments[0].segment_index == 0
        assert segments[0].start_time == 0.0
        assert segments[0].end_time == 180.0
        
        assert segments[1].segment_index == 1
        assert segments[1].start_time == 180.0
        assert segments[1].end_time == 360.0
        
        assert segments[2].segment_index == 2
        assert segments[2].start_time == 360.0
        assert segments[2].end_time == 540.0
        
        assert segments[3].segment_index == 3
        assert segments[3].start_time == 540.0
        assert segments[3].end_time == 600.0  # 最后一个分段可能小于 SEGMENT_DURATION
        
        # 验证所有分段都是 pending 状态
        for seg in segments:
            assert seg.status == "pending"
            assert seg.segment_path is None
    
    def test_create_virtual_segments_skip_existing(self, db_session):
        """测试如果已有分段，跳过创建"""
        # 创建 Episode
        episode = Episode(
            title="Existing Segments Test",
            file_hash="existing_segments_001",
            duration=600.0
        )
        db_session.add(episode)
        db_session.commit()
        
        # 手动创建一个分段
        existing_segment = AudioSegment(
            episode_id=episode.id,
            segment_index=0,
            segment_id="segment_000",
            start_time=0.0,
            end_time=180.0,
            status="completed"
        )
        db_session.add(existing_segment)
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 尝试创建虚拟分段（应该跳过）
        segments = service.create_virtual_segments(episode)
        
        # 验证：返回已有分段，且没有创建新的
        assert len(segments) == 1
        assert segments[0].id == existing_segment.id
        assert segments[0].status == "completed"
        
        # 验证数据库中没有新增分段
        db_segments = db_session.query(AudioSegment).filter(
            AudioSegment.episode_id == episode.id
        ).all()
        assert len(db_segments) == 1


class TestSaveCuesToDb:
    """测试保存字幕到数据库（绝对时间计算）"""
    
    def test_save_cues_to_db_absolute_time(self, db_session):
        """测试绝对时间计算正确"""
        # 创建 Episode 和 Segment
        episode = Episode(
            title="Absolute Time Test",
            file_hash="absolute_time_001",
            duration=600.0
        )
        db_session.add(episode)
        db_session.commit()
        
        segment = AudioSegment(
            episode_id=episode.id,
            segment_index=0,
            segment_id="segment_000",
            start_time=180.0,  # Segment 从 180 秒开始
            end_time=360.0,
            status="pending"
        )
        db_session.add(segment)
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 准备字幕数据（相对时间）
        cues = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "First sentence"},
            {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01", "text": "Second sentence"},
            {"start": 10.0, "end": 15.0, "speaker": "SPEAKER_00", "text": "Third sentence"}
        ]
        
        # 保存字幕
        cues_count = service.save_cues_to_db(cues, segment)
        
        # 验证
        assert cues_count == 3
        
        # 查询数据库中的字幕
        db_cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.segment_id == segment.id
        ).order_by(TranscriptCue.start_time).all()
        
        assert len(db_cues) == 3
        
        # 验证绝对时间计算正确
        # Segment 从 180 秒开始，所以：
        # - 第一个 cue: 180.0 + 0.0 = 180.0
        # - 第二个 cue: 180.0 + 5.0 = 185.0
        # - 第三个 cue: 180.0 + 10.0 = 190.0
        assert db_cues[0].start_time == 180.0
        assert db_cues[0].end_time == 185.0
        assert db_cues[0].speaker == "SPEAKER_00"
        assert db_cues[0].text == "First sentence"
        
        assert db_cues[1].start_time == 185.0
        assert db_cues[1].end_time == 190.0
        assert db_cues[1].speaker == "SPEAKER_01"
        assert db_cues[1].text == "Second sentence"
        
        assert db_cues[2].start_time == 190.0
        assert db_cues[2].end_time == 195.0
        assert db_cues[2].speaker == "SPEAKER_00"
        assert db_cues[2].text == "Third sentence"
        
        # 验证所有字幕都关联到正确的 Episode
        for cue in db_cues:
            assert cue.episode_id == episode.id
            assert cue.segment_id == segment.id
    
    def test_save_cues_to_db_retry_scenario(self, db_session):
        """测试重试场景：删除旧字幕后重新插入"""
        # 创建 Episode 和 Segment
        episode = Episode(
            title="Retry Test",
            file_hash="retry_test_001",
            duration=600.0
        )
        db_session.add(episode)
        db_session.commit()
        
        segment = AudioSegment(
            episode_id=episode.id,
            segment_index=0,
            segment_id="segment_000",
            start_time=0.0,
            end_time=180.0,
            status="failed"
        )
        db_session.add(segment)
        db_session.commit()
        
        # 创建旧字幕（模拟第一次转录失败后的残留）
        old_cue = TranscriptCue(
            episode_id=episode.id,
            segment_id=segment.id,
            start_time=0.0,
            end_time=5.0,
            speaker="SPEAKER_00",
            text="Old text"
        )
        db_session.add(old_cue)
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 保存旧字幕的 ID（用于验证）
        old_cue_id = old_cue.id
        
        # 保存新字幕（重试场景）
        new_cues = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "New text"}
        ]
        cues_count = service.save_cues_to_db(new_cues, segment)
        
        # 验证：旧字幕已删除，新字幕已插入
        assert cues_count == 1
        
        # 刷新 session 以确保看到最新状态
        db_session.expire_all()
        
        # 验证新字幕已插入且内容正确
        db_cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.segment_id == segment.id
        ).all()
        
        assert len(db_cues) == 1
        assert db_cues[0].text == "New text"
        
        # 验证旧字幕已删除（通过查询旧 ID，应该返回 None 或不同的记录）
        old_cue_check = db_session.query(TranscriptCue).filter(
            TranscriptCue.id == old_cue_id
        ).first()
        
        # 如果旧记录还存在，验证它已被更新为新内容（SQLite 可能重用 ID）
        if old_cue_check is not None:
            assert old_cue_check.text == "New text", "旧记录应该被更新为新内容"
        # 如果旧记录不存在，说明已正确删除


class TestTranscribeVirtualSegment:
    """测试单个虚拟分段转录"""
    
    @patch('app.services.transcription_service.WhisperService')
    def test_transcribe_virtual_segment_success(self, mock_whisper_class, db_session):
        """测试成功转录单个分段"""
        # 创建临时音频文件
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_audio:
            tmp_audio.write(b"fake audio data")
            audio_path = tmp_audio.name
        
        try:
            # 创建 Episode
            episode = Episode(
                title="Transcribe Test",
                file_hash="transcribe_test_001",
                duration=600.0,
                audio_path=audio_path,
                language="en-US"
            )
            db_session.add(episode)
            db_session.commit()
            
            # 创建 Segment
            segment = AudioSegment(
                episode_id=episode.id,
                segment_index=0,
                segment_id="segment_000",
                start_time=0.0,
                end_time=180.0,
                status="pending"
            )
            db_session.add(segment)
            db_session.commit()
            
            # Mock WhisperService
            mock_whisper = Mock(spec=WhisperService)
            mock_whisper.extract_segment_to_temp.return_value = "/tmp/test_segment.wav"
            mock_whisper.transcribe_segment.return_value = [
                {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Test transcription"}
            ]
            
            service = TranscriptionService(db_session, mock_whisper)
            
            # 转录分段
            cues_count = service.transcribe_virtual_segment(segment)
            
            # 验证
            assert cues_count == 1
            assert segment.status == "completed"
            assert segment.recognized_at is not None
            assert segment.segment_path is None  # 转录成功后清空
            
            # 验证字幕已保存
            db_cues = db_session.query(TranscriptCue).filter(
                TranscriptCue.segment_id == segment.id
            ).all()
            assert len(db_cues) == 1
            
            # 验证调用了正确的方法
            mock_whisper.extract_segment_to_temp.assert_called_once()
            mock_whisper.transcribe_segment.assert_called_once()
            
        finally:
            # 清理临时文件
            if os.path.exists(audio_path):
                os.remove(audio_path)
    
    def test_transcribe_virtual_segment_already_completed(self, db_session):
        """测试已完成的分段跳过转录"""
        # 创建 Episode 和已完成的 Segment
        episode = Episode(
            title="Already Completed Test",
            file_hash="completed_test_001",
            duration=600.0
        )
        db_session.add(episode)
        db_session.commit()
        
        segment = AudioSegment(
            episode_id=episode.id,
            segment_index=0,
            segment_id="segment_000",
            start_time=0.0,
            end_time=180.0,
            status="completed"
        )
        db_session.add(segment)
        db_session.commit()
        
        # 创建已有字幕
        existing_cue = TranscriptCue(
            episode_id=episode.id,
            segment_id=segment.id,
            start_time=0.0,
            end_time=5.0,
            speaker="SPEAKER_00",
            text="Existing text"
        )
        db_session.add(existing_cue)
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 尝试转录（应该跳过）
        cues_count = service.transcribe_virtual_segment(segment)
        
        # 验证：返回已有字幕数量，且没有调用转录方法
        assert cues_count == 1
        mock_whisper.extract_segment_to_temp.assert_not_called()
        mock_whisper.transcribe_segment.assert_not_called()


class TestCueSortingByStartTime:
    """测试字幕按 start_time 排序（Critical）"""
    
    def test_cue_sorting_by_start_time_critical(self, db_session):
        """验证字幕按 start_time 排序正确（Critical 测试）"""
        # 创建 Episode 和多个 Segment
        episode = Episode(
            title="Sorting Test",
            file_hash="sorting_test_001",
            duration=600.0
        )
        db_session.add(episode)
        db_session.commit()
        
        # 创建 3 个分段（模拟异步转录，可能乱序完成）
        segment1 = AudioSegment(
            episode_id=episode.id,
            segment_index=0,
            segment_id="segment_000",
            start_time=0.0,
            end_time=180.0,
            status="completed"
        )
        segment2 = AudioSegment(
            episode_id=episode.id,
            segment_index=1,
            segment_id="segment_001",
            start_time=180.0,
            end_time=360.0,
            status="completed"
        )
        segment3 = AudioSegment(
            episode_id=episode.id,
            segment_index=2,
            segment_id="segment_002",
            start_time=360.0,
            end_time=540.0,
            status="completed"
        )
        db_session.add_all([segment1, segment2, segment3])
        db_session.commit()
        
        # Mock WhisperService
        mock_whisper = Mock(spec=WhisperService)
        service = TranscriptionService(db_session, mock_whisper)
        
        # 模拟异步转录：乱序保存字幕
        # Segment 2 先完成
        service.save_cues_to_db(
            [
                {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Segment 2, first"},
                {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01", "text": "Segment 2, second"}
            ],
            segment2
        )
        
        # Segment 3 第二个完成
        service.save_cues_to_db(
            [
                {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Segment 3, first"},
                {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01", "text": "Segment 3, second"}
            ],
            segment3
        )
        
        # Segment 1 最后完成
        service.save_cues_to_db(
            [
                {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Segment 1, first"},
                {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01", "text": "Segment 1, second"}
            ],
            segment1
        )
        
        # 查询所有字幕，按 start_time 排序
        all_cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.episode_id == episode.id
        ).order_by(TranscriptCue.start_time).all()
        
        # 验证：即使异步完成，字幕也按绝对时间正确排序
        assert len(all_cues) == 6
        
        # 验证顺序（按绝对时间）
        # Segment 1: 0.0 + 0.0 = 0.0, 0.0 + 5.0 = 5.0
        # Segment 2: 180.0 + 0.0 = 180.0, 180.0 + 5.0 = 185.0
        # Segment 3: 360.0 + 0.0 = 360.0, 360.0 + 5.0 = 365.0
        assert all_cues[0].start_time == 0.0
        assert all_cues[0].text == "Segment 1, first"
        
        assert all_cues[1].start_time == 5.0
        assert all_cues[1].text == "Segment 1, second"
        
        assert all_cues[2].start_time == 180.0
        assert all_cues[2].text == "Segment 2, first"
        
        assert all_cues[3].start_time == 185.0
        assert all_cues[3].text == "Segment 2, second"
        
        assert all_cues[4].start_time == 360.0
        assert all_cues[4].text == "Segment 3, first"
        
        assert all_cues[5].start_time == 365.0
        assert all_cues[5].text == "Segment 3, second"
        
        # 验证时间戳连续（无重叠，无间隙）
        for i in range(len(all_cues) - 1):
            assert all_cues[i].end_time <= all_cues[i + 1].start_time


class TestSegmentAndTranscribe:
    """测试完整转录流程"""
    
    @patch('app.services.transcription_service.WhisperService')
    def test_segment_and_transcribe_full(self, mock_whisper_class, db_session):
        """测试完整转录流程"""
        # 创建临时音频文件
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_audio:
            tmp_audio.write(b"fake audio data")
            audio_path = tmp_audio.name
        
        try:
            # 创建 Episode
            episode = Episode(
                title="Full Transcribe Test",
                file_hash="full_transcribe_001",
                duration=400.0,  # 需要 3 个分段
                audio_path=audio_path,
                language="en-US"
            )
            db_session.add(episode)
            db_session.commit()
            
            # Mock WhisperService
            mock_whisper = Mock(spec=WhisperService)
            mock_whisper.extract_segment_to_temp.return_value = "/tmp/test_segment.wav"
            mock_whisper.transcribe_segment.return_value = [
                {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Test text"}
            ]
            
            service = TranscriptionService(db_session, mock_whisper)
            
            # 执行完整转录流程
            service.segment_and_transcribe(episode.id)
            
            # 验证 Episode 状态
            db_session.refresh(episode)
            assert episode.transcription_status == "completed"
            
            # 验证分段已创建
            segments = db_session.query(AudioSegment).filter(
                AudioSegment.episode_id == episode.id
            ).order_by(AudioSegment.segment_index).all()
            
            assert len(segments) == 3  # ceil(400/180) = 3
            
            # 验证所有分段都已完成
            for seg in segments:
                assert seg.status == "completed"
            
            # 验证字幕已保存
            cues = db_session.query(TranscriptCue).filter(
                TranscriptCue.episode_id == episode.id
            ).all()
            assert len(cues) == 3  # 每个分段 1 条字幕
            
        finally:
            # 清理临时文件
            if os.path.exists(audio_path):
                os.remove(audio_path)

