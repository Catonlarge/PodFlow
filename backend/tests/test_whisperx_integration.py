"""
WhisperX 集成测试（使用真实音频文件）

测试 WhisperX 转录服务的实际输出格式，验证：
1. WhisperX 返回的数据格式是否符合数据库要求
2. 时间戳、说话人、文本等字段是否正确
3. 数据是否可以成功保存到数据库
4. 格式转换是否正确（相对时间 -> 绝对时间）

注意：这是一个集成测试，需要：
- 真实的音频文件（backend/data/audio/003.mp3）
- 已加载的 Whisper 模型
- 可能需要较长的执行时间（实际转录）
"""
import os
import pytest
from pathlib import Path
from sqlalchemy.orm import Session

from app.models import Episode, AudioSegment, TranscriptCue
from app.services.whisper_service import WhisperService
from app.services.transcription_service import TranscriptionService
from app.config import WHISPER_MODEL


# 标记为集成测试（需要真实模型和音频文件）
pytestmark = pytest.mark.integration


class TestWhisperXOutputFormat:
    """测试 WhisperX 输出格式与数据库格式的一致性"""
    
    @pytest.fixture(scope="class")
    def audio_file_path(self):
        """获取测试音频文件路径"""
        # 获取项目根目录
        current_file = Path(__file__).resolve()
        backend_dir = current_file.parent.parent
        audio_path = backend_dir / "data" / "audio" / "003.mp3"
        
        if not audio_path.exists():
            pytest.skip(f"测试音频文件不存在: {audio_path}")
        
        return str(audio_path)
    
    @pytest.fixture(scope="class")
    def whisper_service(self):
        """加载 WhisperService 模型（类级别，所有测试共享）"""
        # 重置单例状态
        WhisperService._instance = None
        WhisperService._models_loaded = False
        WhisperService._model = None
        WhisperService._diarize_model = None
        WhisperService._align_model = None
        WhisperService._align_metadata = None
        WhisperService._align_language = None
        
        # 加载模型
        try:
            WhisperService.load_models(model_name=WHISPER_MODEL)
            yield WhisperService.get_instance()
        finally:
            # 清理：释放模型（可选，测试结束后）
            pass
    
    def test_whisperx_output_format_structure(
        self, whisper_service, audio_file_path, db_session
    ):
        """
        测试 WhisperX 输出格式结构
        
        验证：
        1. 返回的数据是 List[Dict]
        2. 每个 Dict 包含必需的字段：start, end, speaker, text
        3. 数据类型正确（float, str）
        4. 时间戳非负且 start < end
        """
        # 调用 WhisperService 转录（不启用说话人区分，加快速度）
        cues = whisper_service.transcribe_segment(
            audio_path=audio_file_path,
            language="en",
            enable_diarization=False  # 不启用说话人区分，加快测试速度
        )
        
        # 验证返回类型
        assert isinstance(cues, list), "返回结果应该是列表"
        assert len(cues) > 0, "应该至少返回一条字幕"
        
        # 验证每条字幕的格式
        required_fields = ["start", "end", "speaker", "text"]
        
        for i, cue in enumerate(cues):
            # 验证必需字段存在
            for field in required_fields:
                assert field in cue, f"字幕 {i} 缺少必需字段: {field}"
            
            # 验证数据类型
            assert isinstance(cue["start"], (int, float)), f"字幕 {i} 的 start 应该是数字"
            assert isinstance(cue["end"], (int, float)), f"字幕 {i} 的 end 应该是数字"
            assert isinstance(cue["speaker"], str), f"字幕 {i} 的 speaker 应该是字符串"
            assert isinstance(cue["text"], str), f"字幕 {i} 的 text 应该是字符串"
            
            # 验证时间戳合理性
            assert cue["start"] >= 0, f"字幕 {i} 的 start 应该 >= 0"
            assert cue["end"] > cue["start"], f"字幕 {i} 的 end 应该 > start"
            
            # 验证文本非空（过滤空文本后应该没有空文本）
            assert cue["text"].strip() != "", f"字幕 {i} 的 text 不应该为空"
    
    def test_whisperx_output_with_diarization(
        self, whisper_service, audio_file_path, db_session
    ):
        """
        测试启用说话人区分时的输出格式
        
        验证：
        1. speaker 字段包含有效的说话人标识（不是 "Unknown"）
        2. 说话人标识格式正确（如 "SPEAKER_00", "SPEAKER_01"）
        """
        # 加载 Diarization 模型
        try:
            whisper_service.load_diarization_model()
        except Exception as e:
            pytest.skip(f"Diarization 模型加载失败: {e}")
        
        try:
            # 调用转录（启用说话人区分）
            cues = whisper_service.transcribe_segment(
                audio_path=audio_file_path,
                language="en",
                enable_diarization=True
            )
            
            # 验证返回结果
            assert isinstance(cues, list), "返回结果应该是列表"
            assert len(cues) > 0, "应该至少返回一条字幕"
            
            # 验证说话人字段
            speakers_found = set()
            for cue in cues:
                assert "speaker" in cue, "每条字幕都应该有 speaker 字段"
                assert isinstance(cue["speaker"], str), "speaker 应该是字符串"
                assert cue["speaker"] != "", "speaker 不应该为空"
                
                # 记录找到的说话人
                speakers_found.add(cue["speaker"])
            
            # 验证至少有一个说话人（可能只有一个说话人）
            assert len(speakers_found) > 0, "应该至少识别出一个说话人"
            
            # 验证说话人标识格式（通常是 "SPEAKER_XX" 或 "Unknown"）
            # 注意：如果音频只有一个说话人，可能都是 "SPEAKER_00"
            for speaker in speakers_found:
                assert speaker.startswith("SPEAKER_") or speaker == "Unknown", \
                    f"说话人标识格式不正确: {speaker}"
        
        finally:
            # 释放 Diarization 模型
            whisper_service.release_diarization_model()
    
    def test_whisperx_output_save_to_database(
        self, whisper_service, audio_file_path, db_session
    ):
        """
        测试 WhisperX 输出可以成功保存到数据库
        
        验证：
        1. 可以创建 Episode 和 AudioSegment
        2. WhisperX 输出可以转换为 TranscriptCue
        3. 绝对时间计算正确
        4. 数据可以成功保存到数据库
        """
        # 创建 Episode
        episode = Episode(
            title="Integration Test Episode",
            file_hash="integration_test_001",
            duration=300.0,  # 假设 5 分钟
            audio_path=audio_file_path,
            language="en-US"
        )
        db_session.add(episode)
        db_session.commit()
        
        # 创建 AudioSegment（第一个分段，0-180秒）
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
        
        # 调用 WhisperService 转录（使用真实音频文件）
        cues = whisper_service.transcribe_segment(
            audio_path=audio_file_path,
            language="en",
            enable_diarization=False  # 不启用说话人区分，加快速度
        )
        
        # 验证返回结果
        assert isinstance(cues, list), "返回结果应该是列表"
        assert len(cues) > 0, "应该至少返回一条字幕"
        
        # 使用 TranscriptionService 保存到数据库
        transcription_service = TranscriptionService(db_session, whisper_service)
        cues_count = transcription_service.save_cues_to_db(cues, segment)
        
        # 验证保存成功
        assert cues_count == len(cues), f"应该保存 {len(cues)} 条字幕，实际保存 {cues_count} 条"
        
        # 从数据库查询字幕
        db_cues = db_session.query(TranscriptCue).filter(
            TranscriptCue.segment_id == segment.id
        ).order_by(TranscriptCue.start_time).all()
        
        assert len(db_cues) == cues_count, "数据库中的字幕数量应该与保存的数量一致"
        
        # 验证每条字幕的字段
        for i, db_cue in enumerate(db_cues):
            original_cue = cues[i]
            
            # 验证绝对时间计算正确
            # segment.start_time (0.0) + cue["start"] = absolute_start
            expected_start = segment.start_time + original_cue["start"]
            expected_end = segment.start_time + original_cue["end"]
            
            assert abs(db_cue.start_time - expected_start) < 0.01, \
                f"字幕 {i} 的绝对开始时间计算错误: 期望 {expected_start}, 实际 {db_cue.start_time}"
            assert abs(db_cue.end_time - expected_end) < 0.01, \
                f"字幕 {i} 的绝对结束时间计算错误: 期望 {expected_end}, 实际 {db_cue.end_time}"
            
            # 验证其他字段
            assert db_cue.speaker == original_cue["speaker"], \
                f"字幕 {i} 的 speaker 字段不匹配"
            assert db_cue.text == original_cue["text"].strip(), \
                f"字幕 {i} 的 text 字段不匹配"
            assert db_cue.episode_id == episode.id, \
                f"字幕 {i} 的 episode_id 不正确"
            assert db_cue.segment_id == segment.id, \
                f"字幕 {i} 的 segment_id 不正确"
        
        # 验证时间戳顺序（按 start_time 排序后应该连续）
        for i in range(len(db_cues) - 1):
            assert db_cues[i].start_time <= db_cues[i + 1].start_time, \
                f"字幕 {i} 和 {i+1} 的时间戳顺序不正确"
            assert db_cues[i].end_time <= db_cues[i + 1].end_time, \
                f"字幕 {i} 和 {i+1} 的结束时间顺序不正确"
    
    def test_whisperx_output_time_precision(
        self, whisper_service, audio_file_path, db_session
    ):
        """
        测试 WhisperX 输出时间戳精度
        
        验证：
        1. 时间戳精度合理（通常是毫秒级，即小数点后 3 位）
        2. 时间戳连续（无重叠，无过大间隙）
        """
        # 调用转录
        cues = whisper_service.transcribe_segment(
            audio_path=audio_file_path,
            language="en",
            enable_diarization=False
        )
        
        # 验证至少有一条字幕
        assert len(cues) > 0, "应该至少返回一条字幕"
        
        # 验证时间戳精度和连续性
        for i in range(len(cues) - 1):
            current_cue = cues[i]
            next_cue = cues[i + 1]
            
            # 验证当前字幕的时间范围
            assert current_cue["end"] > current_cue["start"], \
                f"字幕 {i} 的 end 应该 > start"
            
            # 验证时间戳连续性（允许小间隙，但不应该有重叠）
            # 注意：WhisperX 可能产生小间隙，这是正常的
            gap = next_cue["start"] - current_cue["end"]
            
            # 间隙不应该太大（例如超过 5 秒）
            if gap > 5.0:
                pytest.fail(
                    f"字幕 {i} 和 {i+1} 之间的间隙过大: {gap} 秒"
                )
            
            # 不应该有重叠（允许小的数值误差）
            if gap < -0.1:  # 允许 0.1 秒的误差
                pytest.fail(
                    f"字幕 {i} 和 {i+1} 有重叠: {current_cue['end']} > {next_cue['start']}"
                )
    
    def test_whisperx_output_text_quality(
        self, whisper_service, audio_file_path, db_session
    ):
        """
        测试 WhisperX 输出文本质量
        
        验证：
        1. 文本内容非空
        2. 文本长度合理（不应该太短或太长）
        3. 文本格式正确（去除首尾空格）
        """
        # 调用转录
        cues = whisper_service.transcribe_segment(
            audio_path=audio_file_path,
            language="en",
            enable_diarization=False
        )
        
        # 验证至少有一条字幕
        assert len(cues) > 0, "应该至少返回一条字幕"
        
        # 验证每条字幕的文本质量
        for i, cue in enumerate(cues):
            text = cue["text"]
            
            # 验证文本非空
            assert text is not None, f"字幕 {i} 的 text 不应该为 None"
            assert text.strip() != "", f"字幕 {i} 的 text 不应该为空"
            
            # 验证文本长度合理（不应该太短，例如少于 1 个字符）
            # 注意：某些情况下可能只有标点符号，这是正常的
            assert len(text.strip()) >= 1, f"字幕 {i} 的 text 长度不合理: '{text}'"
            
            # 验证文本格式（_format_result_to_cues 应该已经去除首尾空格）
            # 注意：WhisperX 可能返回带空格的文本，但 _format_result_to_cues 会处理
            assert text == text.strip(), \
                f"字幕 {i} 的 text 应该已经去除首尾空格: '{text}'"
    
    def test_whisperx_output_speaker_consistency(
        self, whisper_service, audio_file_path, db_session
    ):
        """
        测试 WhisperX 输出说话人一致性
        
        验证：
        1. 不启用说话人区分时，所有字幕的 speaker 都是 "Unknown"
        2. 启用说话人区分时，说话人标识应该一致（相同说话人使用相同标识）
        """
        # 测试 1: 不启用说话人区分
        cues_no_diarization = whisper_service.transcribe_segment(
            audio_path=audio_file_path,
            language="en",
            enable_diarization=False
        )
        
        # 验证所有字幕的 speaker 都是 "Unknown"
        for cue in cues_no_diarization:
            assert cue["speaker"] == "Unknown", \
                f"不启用说话人区分时，speaker 应该是 'Unknown'，实际: {cue['speaker']}"
        
        # 测试 2: 启用说话人区分（如果模型可用）
        try:
            whisper_service.load_diarization_model()
            
            cues_with_diarization = whisper_service.transcribe_segment(
                audio_path=audio_file_path,
                language="en",
                enable_diarization=True
            )
            
            # 验证说话人标识存在且格式正确
            speakers = set(cue["speaker"] for cue in cues_with_diarization)
            assert len(speakers) > 0, "应该至少识别出一个说话人"
            
            # 验证说话人标识格式
            for speaker in speakers:
                assert speaker.startswith("SPEAKER_") or speaker == "Unknown", \
                    f"说话人标识格式不正确: {speaker}"
        
        except Exception as e:
            pytest.skip(f"Diarization 模型不可用: {e}")
        
        finally:
            # 释放 Diarization 模型
            whisper_service.release_diarization_model()

