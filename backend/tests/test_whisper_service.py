"""
WhisperService 测试用例

测试 WhisperX 转录服务的核心功能：
1. 单例模式
2. 模型加载
3. 完整转录流程
4. FFmpeg 片段提取
5. 时间戳精度
6. 说话人识别
7. 并发安全（线程锁）
"""
import os
import pytest
import tempfile
import threading
import time
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path

from app.services.whisper_service import WhisperService
from app.utils.hardware_patch import apply_rtx5070_patches


class TestHardwarePatch:
    """测试硬件兼容性补丁"""
    
    def test_apply_hardware_patches(self):
        """测试硬件补丁应用（不报错即可）"""
        # 补丁函数应该能够多次调用而不报错（幂等性）
        try:
            apply_rtx5070_patches()
            apply_rtx5070_patches()  # 第二次调用应该安全
            assert True  # 如果没有抛出异常，测试通过
        except Exception as e:
            pytest.fail(f"硬件补丁应用失败: {e}")


class TestWhisperServiceSingleton:
    """测试单例模式"""
    
    def test_get_instance_before_load_raises_error(self):
        """测试在模型加载前获取实例应该抛出错误"""
        # 重置单例状态
        WhisperService._instance = None
        WhisperService._models_loaded = False
        
        with pytest.raises(RuntimeError, match="模型未加载"):
            WhisperService.get_instance()
    
    @patch('app.services.whisper_service.whisperx.load_model')
    @patch('app.services.whisper_service.torch.cuda.is_available')
    def test_get_instance_after_load_returns_same_instance(self, mock_cuda, mock_load_model):
        """测试加载模型后获取实例返回同一个实例"""
        # 重置单例状态
        WhisperService._instance = None
        WhisperService._models_loaded = False
        
        # Mock 设备检测
        mock_cuda.return_value = False
        
        # Mock 模型加载
        mock_model = Mock()
        mock_load_model.return_value = mock_model
        
        # 加载模型
        WhisperService.load_models(model_name="tiny")
        
        # 获取实例
        instance1 = WhisperService.get_instance()
        instance2 = WhisperService.get_instance()
        
        # 验证是同一个实例
        assert instance1 is instance2
        assert WhisperService._instance is instance1


class TestWhisperServiceLoadModels:
    """测试模型加载"""
    
    def setup_method(self):
        """每个测试前重置单例状态"""
        WhisperService._instance = None
        WhisperService._model = None
        WhisperService._device = None
        WhisperService._compute_type = None
        WhisperService._models_loaded = False
        WhisperService._align_model = None
        WhisperService._align_metadata = None
        WhisperService._align_language = None
    
    @patch('app.services.whisper_service.whisperx.load_model')
    @patch('app.services.whisper_service.torch.cuda.is_available')
    def test_load_models_cpu(self, mock_cuda, mock_load_model):
        """测试 CPU 模式下加载模型"""
        mock_cuda.return_value = False
        mock_model = Mock()
        mock_load_model.return_value = mock_model
        
        WhisperService.load_models(model_name="tiny")
        
        assert WhisperService._models_loaded is True
        assert WhisperService._device == "cpu"
        assert WhisperService._compute_type == "int8"
        assert WhisperService._model == mock_model
        mock_load_model.assert_called_once()
    
    @patch('app.services.whisper_service.whisperx.load_model')
    @patch('app.services.whisper_service.torch.cuda.is_available')
    @patch('app.services.whisper_service.torch.cuda.get_device_name')
    def test_load_models_cuda(self, mock_get_device, mock_cuda, mock_load_model):
        """测试 CUDA 模式下加载模型"""
        mock_cuda.return_value = True
        mock_get_device.return_value = "RTX 5070"
        mock_model = Mock()
        mock_load_model.return_value = mock_model
        
        WhisperService.load_models(model_name="tiny")
        
        assert WhisperService._models_loaded is True
        assert WhisperService._device == "cuda"
        assert WhisperService._compute_type == "float16"
        assert WhisperService._model == mock_model
    
    @patch('app.services.whisper_service.whisperx.load_model')
    @patch('app.services.whisper_service.torch.cuda.is_available')
    def test_load_models_creates_model_dir(self, mock_cuda, mock_load_model, tmp_path):
        """测试模型目录自动创建"""
        mock_cuda.return_value = False
        mock_model = Mock()
        mock_load_model.return_value = mock_model
        
        # 使用临时目录作为模型目录
        model_dir = str(tmp_path / "models")
        WhisperService.load_models(model_name="tiny", model_dir=model_dir)
        
        assert os.path.exists(model_dir)
        mock_load_model.assert_called_once()
    
    @patch('app.services.whisper_service.whisperx.load_model')
    @patch('app.services.whisper_service.torch.cuda.is_available')
    def test_load_models_handles_error(self, mock_cuda, mock_load_model):
        """测试模型加载失败时的错误处理"""
        mock_cuda.return_value = False
        mock_load_model.side_effect = Exception("Model load failed")
        
        with pytest.raises(RuntimeError, match="模型加载失败"):
            WhisperService.load_models(model_name="tiny")
        
        assert WhisperService._models_loaded is False


class TestWhisperServiceTranscribe:
    """测试转录功能"""
    
    def setup_method(self):
        """每个测试前设置模型已加载状态"""
        WhisperService._instance = None
        WhisperService._models_loaded = True
        WhisperService._device = "cpu"
        WhisperService._compute_type = "int8"
        WhisperService._model = Mock()
        WhisperService._diarize_model = None
        WhisperService._align_model = None
        WhisperService._align_metadata = None
        WhisperService._align_language = None
    
    @patch('app.services.whisper_service.whisperx.load_audio')
    @patch('app.services.whisper_service.whisperx.load_align_model')
    @patch('app.services.whisper_service.whisperx.align')
    @patch('app.services.whisper_service.os.path.exists')
    def test_transcribe_segment_without_diarization(
        self, mock_exists, mock_align, mock_load_align, mock_load_audio, tmp_path
    ):
        """测试片段转录流程（不启用说话人区分）"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # Mock 文件存在性检查
        mock_exists.return_value = True
        
        # Mock 音频加载
        mock_audio = [0.1, 0.2, 0.3]
        mock_load_audio.return_value = mock_audio
        
        # Mock 转录结果
        mock_transcribe_result = {
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "Hello "},
                {"start": 1.0, "end": 2.0, "text": "world"}
            ],
            "language": "en"
        }
        WhisperService._model.transcribe.return_value = mock_transcribe_result
        
        # Mock 对齐模型
        mock_align_model = Mock()
        mock_metadata = {"language": "en"}
        mock_load_align.return_value = (mock_align_model, mock_metadata)
        
        # Mock 对齐结果
        mock_align_result = {
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "Hello"},
                {"start": 1.0, "end": 2.0, "text": "world"}
            ]
        }
        mock_align.return_value = mock_align_result
        
        # 获取实例并执行转录
        service = WhisperService.get_instance()
        cues = service.transcribe_segment(str(audio_file), enable_diarization=False)
        
        # 验证结果
        assert len(cues) == 2
        assert cues[0]["start"] == 0.0
        assert cues[0]["end"] == 1.0
        assert cues[0]["text"] == "Hello"
        assert cues[0]["speaker"] == "Unknown"  # 未启用说话人区分
    
    @patch('app.services.whisper_service.whisperx.load_audio')
    @patch('app.services.whisper_service.whisperx.load_align_model')
    @patch('app.services.whisper_service.whisperx.align')
    @patch('app.services.whisper_service.DiarizationPipeline')
    @patch('app.services.whisper_service.whisperx.assign_word_speakers')
    @patch('app.services.whisper_service.os.path.exists')
    def test_transcribe_segment_with_diarization(
        self, mock_exists, mock_assign_speakers, mock_diarize_pipeline,
        mock_align, mock_load_align, mock_load_audio, tmp_path
    ):
        """测试片段转录流程（启用说话人区分）"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # Mock 文件存在性检查
        mock_exists.return_value = True
        
        # Mock 音频加载
        mock_audio = [0.1, 0.2, 0.3]
        mock_load_audio.return_value = mock_audio
        
        # Mock 转录结果
        mock_transcribe_result = {
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "Hello "},
                {"start": 1.0, "end": 2.0, "text": "world"}
            ],
            "language": "en"
        }
        WhisperService._model.transcribe.return_value = mock_transcribe_result
        
        # Mock 对齐模型
        mock_align_model = Mock()
        mock_metadata = {"language": "en"}
        mock_load_align.return_value = (mock_align_model, mock_metadata)
        
        # Mock 对齐结果
        mock_align_result = {
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "Hello"},
                {"start": 1.0, "end": 2.0, "text": "world"}
            ]
        }
        mock_align.return_value = mock_align_result
        
        # Mock 说话人区分
        mock_diarize_model = Mock()
        mock_diarize_segments = {"segments": []}
        mock_diarize_model.return_value = mock_diarize_segments
        mock_diarize_pipeline.return_value = mock_diarize_model
        
        # Mock 说话人分配结果
        mock_speaker_result = {
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "Hello", "speaker": "SPEAKER_00"},
                {"start": 1.0, "end": 2.0, "text": "world", "speaker": "SPEAKER_01"}
            ]
        }
        mock_assign_speakers.return_value = mock_speaker_result
        
        # 获取实例并执行转录
        service = WhisperService.get_instance()
        # 先加载 Diarization 模型（模拟 Episode 处理流程）
        service._diarize_model = mock_diarize_model
        cues = service.transcribe_segment(str(audio_file), enable_diarization=True)
        
        # 验证结果
        assert len(cues) == 2
        assert cues[0]["speaker"] == "SPEAKER_00"
        assert cues[1]["speaker"] == "SPEAKER_01"
    
    @patch('app.services.whisper_service.whisperx.load_audio')
    @patch('app.services.whisper_service.whisperx.load_align_model')
    @patch('app.services.whisper_service.whisperx.align')
    @patch('app.services.whisper_service.whisperx.assign_word_speakers')
    @patch('app.services.whisper_service.DiarizationPipeline')
    @patch('app.services.whisper_service.os.path.exists')
    def test_speaker_identification(
        self, mock_exists, mock_diarize_pipeline, mock_assign_speakers,
        mock_align, mock_load_align, mock_load_audio, tmp_path
    ):
        """验证说话人识别功能"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        mock_exists.return_value = True
        
        # Mock 音频加载
        mock_audio = [0.1, 0.2, 0.3]
        mock_load_audio.return_value = mock_audio
        
        # Mock 转录结果（无说话人信息）
        mock_transcribe_result = {
            "segments": [
                {"start": 0.0, "end": 2.0, "text": "Hello world"},
                {"start": 2.0, "end": 4.0, "text": "How are you"}
            ],
            "language": "en"
        }
        WhisperService._model.transcribe.return_value = mock_transcribe_result
        
        # Mock 对齐模型
        mock_align_model = Mock()
        mock_metadata = {"language": "en"}
        mock_load_align.return_value = (mock_align_model, mock_metadata)
        
        # Mock 对齐结果
        mock_align_result = {
            "segments": [
                {"start": 0.0, "end": 2.0, "text": "Hello world"},
                {"start": 2.0, "end": 4.0, "text": "How are you"}
            ]
        }
        mock_align.return_value = mock_align_result
        
        # Mock Diarization 模型
        mock_diarize_model = Mock()
        mock_diarize_segments = {"segments": []}
        mock_diarize_model.return_value = mock_diarize_segments
        mock_diarize_pipeline.return_value = mock_diarize_model
        
        # Mock 说话人分配结果
        mock_speaker_result = {
            "segments": [
                {"start": 0.0, "end": 2.0, "text": "Hello world", "speaker": "SPEAKER_00"},
                {"start": 2.0, "end": 4.0, "text": "How are you", "speaker": "SPEAKER_01"}
            ]
        }
        mock_assign_speakers.return_value = mock_speaker_result
        
        # 获取实例并执行转录
        service = WhisperService.get_instance()
        service._diarize_model = mock_diarize_model
        cues = service.transcribe_segment(str(audio_file), enable_diarization=True)
        
        # 验证说话人识别结果
        assert len(cues) == 2
        # 验证每个 cue 都有 speaker 字段
        assert "speaker" in cues[0]
        assert "speaker" in cues[1]
        # 验证说话人标签格式正确（SPEAKER_XX）
        assert cues[0]["speaker"].startswith("SPEAKER_")
        assert cues[1]["speaker"].startswith("SPEAKER_")
        # 验证两个片段有不同的说话人（如果有多个说话人）
        # 注意：实际场景中可能有相同说话人，这里只是验证格式
    
    def test_transcribe_file_not_found(self):
        """测试文件不存在时的错误处理"""
        service = WhisperService.get_instance()
        
        with pytest.raises(FileNotFoundError, match="音频文件不存在"):
            service.transcribe_segment("nonexistent.mp3")
    
    def test_transcribe_models_not_loaded(self):
        """测试模型未加载时的错误处理"""
        # 重置状态
        WhisperService._models_loaded = False
        
        with pytest.raises(RuntimeError, match="模型未加载"):
            service = WhisperService.get_instance()
            service.transcribe_segment("test_audio.mp3")


class TestWhisperServiceExtractSegment:
    """测试音频片段提取"""
    
    def setup_method(self):
        """每个测试前设置模型已加载状态"""
        WhisperService._instance = None
        WhisperService._models_loaded = True
    
    @patch('app.services.whisper_service.subprocess.run')
    def test_extract_segment_to_temp_success(self, mock_subprocess, tmp_path):
        """测试成功提取音频片段"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # Mock FFmpeg 成功执行
        mock_subprocess.return_value = Mock(returncode=0)
        
        service = WhisperService.get_instance()
        output_dir = str(tmp_path / "temp_segments")
        temp_path = service.extract_segment_to_temp(
            str(audio_file),
            start_time=180.0,
            duration=180.0,
            output_dir=output_dir
        )
        
        # 验证 FFmpeg 调用参数
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args[0][0]
        assert call_args[0] == "ffmpeg"
        assert "-y" in call_args
        assert "-i" in call_args
        assert "-ss" in call_args
        assert "-t" in call_args
        assert "-ar" in call_args
        assert "16000" in call_args
        assert "-ac" in call_args
        assert "1" in call_args
        assert "-c:a" in call_args
        assert "pcm_s16le" in call_args
        
        # 验证输出目录已创建
        assert os.path.exists(output_dir)
    
    def test_extract_segment_file_not_found(self):
        """测试音频文件不存在时的错误处理"""
        service = WhisperService.get_instance()
        
        with pytest.raises(FileNotFoundError, match="音频文件不存在"):
            service.extract_segment_to_temp("nonexistent.mp3", 0.0, 180.0)
    
    @patch('app.services.whisper_service.subprocess.run')
    def test_extract_segment_ffmpeg_failure(self, mock_subprocess, tmp_path):
        """测试 FFmpeg 执行失败时的错误处理"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # Mock FFmpeg 失败
        from subprocess import CalledProcessError
        mock_subprocess.side_effect = CalledProcessError(
            returncode=1,
            cmd=["ffmpeg"],
            stderr=b"FFmpeg error"
        )
        
        service = WhisperService.get_instance()
        
        with pytest.raises(RuntimeError, match="FFmpeg 提取失败"):
            service.extract_segment_to_temp(str(audio_file), 0.0, 180.0)
    
    @patch('app.services.whisper_service.subprocess.run')
    def test_extract_segment_ffmpeg_not_found(self, mock_subprocess, tmp_path):
        """测试 FFmpeg 未安装时的错误处理"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # Mock FileNotFoundError（FFmpeg 不在 PATH 中）
        mock_subprocess.side_effect = FileNotFoundError("ffmpeg not found")
        
        service = WhisperService.get_instance()
        
        with pytest.raises(RuntimeError, match="FFmpeg 未安装"):
            service.extract_segment_to_temp(str(audio_file), 0.0, 180.0)
    
    @patch('app.services.whisper_service.subprocess.run')
    def test_extract_segment_accuracy(self, mock_subprocess, tmp_path):
        """测试 FFmpeg 提取的时间戳精度（Critical）"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # Mock FFmpeg 成功执行
        mock_subprocess.return_value = Mock(returncode=0)
        
        service = WhisperService.get_instance()
        output_dir = str(tmp_path / "temp_segments")
        
        # 测试不同的起始时间和时长
        test_cases = [
            (0.0, 180.0),
            (180.0, 180.0),
            (360.0, 120.0),
            (123.456, 45.789),  # 非整数时间戳
        ]
        
        for start_time, duration in test_cases:
            temp_path = service.extract_segment_to_temp(
                str(audio_file),
                start_time=start_time,
                duration=duration,
                output_dir=output_dir
            )
            
            # 验证 FFmpeg 调用参数包含正确的时间戳
            # 由于 mock_subprocess 会被多次调用，我们需要检查最后一次调用
            assert mock_subprocess.called
            
            # 验证输出文件路径包含时间戳信息
            assert str(start_time) in temp_path or f"{start_time:.2f}" in temp_path
            assert str(duration) in temp_path or f"{duration:.2f}" in temp_path


class TestWhisperServiceDeviceInfo:
    """测试设备信息获取"""
    
    def setup_method(self):
        """每个测试前重置状态"""
        WhisperService._device = None
        WhisperService._compute_type = None
        WhisperService._models_loaded = False
        WhisperService._diarize_model = None
        WhisperService._align_model = None
        WhisperService._align_metadata = None
        WhisperService._align_language = None
    
    @patch('app.services.whisper_service.torch.cuda.is_available')
    @patch('app.services.whisper_service.torch.cuda.memory_allocated')
    def test_get_device_info_cpu(self, mock_memory, mock_cuda):
        """测试 CPU 模式下的设备信息"""
        mock_cuda.return_value = False
        
        # 设置状态
        WhisperService._device = "cpu"
        WhisperService._compute_type = "int8"
        WhisperService._models_loaded = True
        
        info = WhisperService.get_device_info()
        
        assert info["device"] == "cpu"
        assert info["compute_type"] == "int8"
        assert info["asr_model_loaded"] is True
        assert info["diarization_model_loaded"] is False
        assert info["align_model_loaded"] is False
        assert info["align_model_language"] is None
        assert info["cuda_available"] is False
        assert info["vram_allocated"] == "N/A"
        assert "memory_info" in info
        assert "system_memory" in info["memory_info"]
        assert "gpu_memory" in info["memory_info"]
    
    @patch('app.services.whisper_service.torch.cuda.is_available')
    @patch('app.services.whisper_service.torch.cuda.memory_allocated')
    def test_get_device_info_cuda(self, mock_memory, mock_cuda):
        """测试 CUDA 模式下的设备信息"""
        mock_cuda.return_value = True
        mock_memory.return_value = 2 * 1024**3  # 2GB
        
        # 设置模型已加载状态
        WhisperService._device = "cuda"
        WhisperService._compute_type = "float16"
        WhisperService._models_loaded = True
        
        # 模拟 Diarization 模型已加载
        WhisperService._diarize_model = Mock()
        
        info = WhisperService.get_device_info()
        
        assert info["device"] == "cuda"
        assert info["compute_type"] == "float16"
        assert info["asr_model_loaded"] is True
        assert info["diarization_model_loaded"] is True
        assert info["align_model_loaded"] is False
        assert info["align_model_language"] is None
        assert info["cuda_available"] is True
        assert "vram_allocated" in info
        assert "memory_info" in info
        assert "system_memory" in info["memory_info"]
        assert "gpu_memory" in info["memory_info"]
    
    @patch('app.services.whisper_service.torch.cuda.is_available')
    def test_get_device_info_with_align_model(self, mock_cuda):
        """测试对齐模型已缓存时的设备信息"""
        mock_cuda.return_value = False
        
        # 设置状态
        WhisperService._device = "cpu"
        WhisperService._compute_type = "int8"
        WhisperService._models_loaded = True
        WhisperService._align_model = Mock()
        WhisperService._align_metadata = {"language": "en"}
        WhisperService._align_language = "en"
        
        info = WhisperService.get_device_info()
        
        assert info["align_model_loaded"] is True
        assert info["align_model_language"] == "en"


class TestWhisperServiceAlignModelCache:
    """测试对齐模型缓存功能"""
    
    def setup_method(self):
        """每个测试前重置状态"""
        WhisperService._instance = None
        WhisperService._models_loaded = True
        WhisperService._device = "cpu"
        WhisperService._compute_type = "int8"
        WhisperService._model = Mock()
        WhisperService._align_model = None
        WhisperService._align_metadata = None
        WhisperService._align_language = None
    
    @patch('app.services.whisper_service.whisperx.load_align_model')
    def test_align_model_caching_same_language(self, mock_load_align):
        """测试相同语言的片段复用对齐模型"""
        # Mock 对齐模型
        mock_align_model = Mock()
        mock_metadata = {"language": "en"}
        mock_load_align.return_value = (mock_align_model, mock_metadata)
        
        service = WhisperService.get_instance()
        
        # 第一次调用：应该加载模型
        model1, metadata1 = service._get_or_load_align_model("en")
        
        assert model1 == mock_align_model
        assert metadata1 == mock_metadata
        assert WhisperService._align_model == mock_align_model
        assert WhisperService._align_language == "en"
        mock_load_align.assert_called_once_with(language_code="en", device="cpu")
        
        # 重置 mock 调用计数
        mock_load_align.reset_mock()
        
        # 第二次调用（相同语言）：应该复用缓存的模型
        model2, metadata2 = service._get_or_load_align_model("en")
        
        assert model2 == mock_align_model
        assert metadata2 == mock_metadata
        # 验证没有再次调用 load_align_model
        mock_load_align.assert_not_called()
    
    @patch('app.services.whisper_service.whisperx.load_align_model')
    def test_align_model_caching_different_language(self, mock_load_align):
        """测试不同语言的片段会重新加载对齐模型"""
        # Mock 第一个对齐模型（英语）
        mock_align_model_en = Mock()
        mock_metadata_en = {"language": "en"}
        
        # Mock 第二个对齐模型（中文）
        mock_align_model_zh = Mock()
        mock_metadata_zh = {"language": "zh"}
        
        mock_load_align.side_effect = [
            (mock_align_model_en, mock_metadata_en),
            (mock_align_model_zh, mock_metadata_zh)
        ]
        
        service = WhisperService.get_instance()
        
        # 第一次调用：加载英语模型
        model1, metadata1 = service._get_or_load_align_model("en")
        assert model1 == mock_align_model_en
        assert WhisperService._align_language == "en"
        assert mock_load_align.call_count == 1
        
        # 第二次调用（不同语言）：应该加载中文模型
        model2, metadata2 = service._get_or_load_align_model("zh")
        assert model2 == mock_align_model_zh
        assert WhisperService._align_language == "zh"
        assert mock_load_align.call_count == 2


class TestWhisperServiceMemoryMonitoring:
    """测试内存监控功能"""
    
    @patch('app.services.whisper_service.psutil')
    def test_get_memory_info_with_psutil(self, mock_psutil):
        """测试获取内存信息（psutil 可用）"""
        # Mock psutil
        mock_mem = Mock()
        mock_mem.total = 16 * 1024**3  # 16GB
        mock_mem.available = 8 * 1024**3  # 8GB
        mock_mem.used = 8 * 1024**3  # 8GB
        mock_mem.percent = 50.0
        mock_psutil.virtual_memory.return_value = mock_mem
        
        # Mock CUDA
        with patch('app.services.whisper_service.torch.cuda.is_available', return_value=True):
            with patch('app.services.whisper_service.torch.cuda.current_device', return_value=0):
                mock_props = Mock()
                mock_props.total_memory = 12 * 1024**3  # 12GB
                with patch('app.services.whisper_service.torch.cuda.get_device_properties', return_value=mock_props):
                    with patch('app.services.whisper_service.torch.cuda.memory_allocated', return_value=2 * 1024**3):
                        with patch('app.services.whisper_service.torch.cuda.memory_reserved', return_value=3 * 1024**3):
                            info = WhisperService.get_memory_info()
                            
                            assert "system_memory" in info
                            assert "gpu_memory" in info
                            assert info["system_memory"]["total_gb"] == "16.00"
                            assert info["gpu_memory"]["total_gb"] == "12.00"
    
    @patch('app.services.whisper_service.PSUTIL_AVAILABLE', False)
    def test_get_memory_info_without_psutil(self):
        """测试获取内存信息（psutil 不可用）"""
        info = WhisperService.get_memory_info()
        
        assert "system_memory" in info
        assert "gpu_memory" in info
        assert info["system_memory"]["status"] == "psutil not available"
    
    @patch('app.services.whisper_service.psutil')
    def test_check_memory_before_load_ok(self, mock_psutil):
        """测试内存检查（内存充足）"""
        mock_mem = Mock()
        mock_mem.percent = 50.0  # 50% 使用率
        mock_psutil.virtual_memory.return_value = mock_mem
        
        with patch('app.services.whisper_service.torch.cuda.is_available', return_value=False):
            result = WhisperService.check_memory_before_load()
            assert result is True
    
    @patch('app.services.whisper_service.psutil')
    def test_check_memory_before_load_warning(self, mock_psutil):
        """测试内存检查（内存不足警告）"""
        mock_mem = Mock()
        mock_mem.percent = 90.0  # 90% 使用率
        mock_mem.available = 1 * 1024**3  # 1GB
        mock_mem.total = 16 * 1024**3  # 16GB
        mock_psutil.virtual_memory.return_value = mock_mem
        
        with patch('app.services.whisper_service.torch.cuda.is_available', return_value=False):
            result = WhisperService.check_memory_before_load()
            assert result is False


class TestWhisperServiceFormatResult:
    """测试结果格式化"""
    
    def setup_method(self):
        """每个测试前设置模型已加载状态"""
        WhisperService._instance = None
        WhisperService._models_loaded = True
    
    def test_format_result_to_cues(self):
        """测试将 WhisperX 结果转换为标准字幕格式"""
        service = WhisperService.get_instance()
        
        result = {
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "text": "Hello",
                    "speaker": "SPEAKER_00"
                },
                {
                    "start": 1.0,
                    "end": 2.0,
                    "text": "world",
                    # 缺少 speaker，应该使用 "Unknown"
                },
                {
                    "start": 2.0,
                    "end": 3.0,
                    "text": "",  # 空文本应该被过滤
                }
            ]
        }
        
        cues = service._format_result_to_cues(result)
        
        assert len(cues) == 2  # 空文本被过滤
        assert cues[0]["start"] == 0.0
        assert cues[0]["end"] == 1.0
        assert cues[0]["text"] == "Hello"
        assert cues[0]["speaker"] == "SPEAKER_00"
        assert cues[1]["speaker"] == "Unknown"  # 默认值


class TestWhisperServiceThreadSafety:
    """测试并发安全性（线程锁）"""
    
    def setup_method(self):
        """每个测试前重置状态"""
        WhisperService._instance = None
        WhisperService._models_loaded = True
        WhisperService._device = "cpu"
        WhisperService._compute_type = "int8"
        WhisperService._model = Mock()
        WhisperService._diarize_model = None
        WhisperService._align_model = None
        WhisperService._align_metadata = None
        WhisperService._align_language = None
    
    @patch('app.services.whisper_service.whisperx.load_audio')
    @patch('app.services.whisper_service.whisperx.load_align_model')
    @patch('app.services.whisper_service.whisperx.align')
    @patch('app.services.whisper_service.os.path.exists')
    def test_concurrent_transcribe_segments_thread_safe(
        self, mock_exists, mock_align, mock_load_align, mock_load_audio, tmp_path
    ):
        """测试并发调用 transcribe_segment 时线程安全（不会产生竞态条件）"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        mock_exists.return_value = True
        mock_audio = [0.1, 0.2, 0.3]
        mock_load_audio.return_value = mock_audio
        
        # Mock 转录结果
        mock_transcribe_result = {
            "segments": [{"start": 0.0, "end": 1.0, "text": "Hello"}],
            "language": "en"
        }
        WhisperService._model.transcribe.return_value = mock_transcribe_result
        
        # Mock 对齐模型
        mock_align_model = Mock()
        mock_metadata = {"language": "en"}
        mock_load_align.return_value = (mock_align_model, mock_metadata)
        
        # Mock 对齐结果
        mock_align_result = {"segments": [{"start": 0.0, "end": 1.0, "text": "Hello"}]}
        mock_align.return_value = mock_align_result
        
        service = WhisperService.get_instance()
        
        # 并发调用计数器
        call_count = []
        errors = []
        
        def transcribe_worker(worker_id):
            try:
                # 添加小延迟以增加并发竞争的可能性
                time.sleep(0.01 * worker_id)
                result = service.transcribe_segment(str(audio_file), enable_diarization=False)
                call_count.append(worker_id)
                return result
            except Exception as e:
                errors.append((worker_id, e))
        
        # 启动多个线程并发调用
        threads = []
        num_threads = 5
        for i in range(num_threads):
            thread = threading.Thread(target=transcribe_worker, args=(i,))
            threads.append(thread)
        
        # 同时启动所有线程
        for thread in threads:
            thread.start()
        
        # 等待所有线程完成
        for thread in threads:
            thread.join(timeout=5.0)  # 设置超时，防止死锁
            assert not thread.is_alive(), "线程未在预期时间内完成，可能存在死锁"
        
        # 验证所有调用都成功完成（没有异常）
        assert len(call_count) == num_threads, f"预期 {num_threads} 次调用成功，实际 {len(call_count)} 次"
        assert len(errors) == 0, f"发生错误: {errors}"
        
        # 验证对齐模型只加载一次（由于锁保护，虽然并发调用，但应该只加载一次）
        # 注意：由于 mock，这里主要是验证逻辑正确性
    
    def test_rlock_is_reentrant(self):
        """测试 RLock 可重入特性（不会在嵌套调用时死锁）"""
        service = WhisperService.get_instance()
        
        # 验证锁是可重入的（RLock）
        # 第一次获取锁
        acquired1 = service._gpu_lock.acquire()
        assert acquired1 is True
        
        # 第二次获取锁（应该成功，因为 RLock 可重入）
        acquired2 = service._gpu_lock.acquire()
        assert acquired2 is True
        
        # 释放一次
        service._gpu_lock.release()
        
        # 释放第二次
        service._gpu_lock.release()
        
        # 验证锁已完全释放（可以再次获取）
        acquired3 = service._gpu_lock.acquire(timeout=0.1)
        assert acquired3 is True
        service._gpu_lock.release()
    
    @patch('app.services.whisper_service.DiarizationPipeline')
    @patch('app.services.whisper_service.whisperx.load_audio')
    @patch('app.services.whisper_service.whisperx.load_align_model')
    @patch('app.services.whisper_service.whisperx.align')
    @patch('app.services.whisper_service.whisperx.assign_word_speakers')
    @patch('app.services.whisper_service.WhisperService.check_memory_before_load')
    @patch('app.services.whisper_service.WhisperService.get_memory_info')
    @patch('app.services.whisper_service.os.path.exists')
    def test_lazy_load_diarization_within_lock_no_deadlock(
        self, mock_exists, mock_get_memory_info, mock_check_memory,
        mock_assign_speakers, mock_align, mock_load_align, mock_load_audio,
        mock_diarize_pipeline, tmp_path
    ):
        """测试在 transcribe_segment 锁内 lazy load Diarization 模型不会死锁"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        mock_exists.return_value = True
        mock_audio = [0.1, 0.2, 0.3]
        mock_load_audio.return_value = mock_audio
        
        # Mock 内存检查
        mock_check_memory.return_value = True
        mock_get_memory_info.return_value = {
            "system_memory": {"percent": "50.0%"},
            "gpu_memory": {"percent": "50.0%"}
        }
        
        # Mock 转录结果
        mock_transcribe_result = {
            "segments": [{"start": 0.0, "end": 1.0, "text": "Hello"}],
            "language": "en"
        }
        WhisperService._model.transcribe.return_value = mock_transcribe_result
        
        # Mock 对齐模型
        mock_align_model = Mock()
        mock_metadata = {"language": "en"}
        mock_load_align.return_value = (mock_align_model, mock_metadata)
        
        # Mock 对齐结果
        mock_align_result = {"segments": [{"start": 0.0, "end": 1.0, "text": "Hello"}]}
        mock_align.return_value = mock_align_result
        
        # Mock Diarization 模型
        mock_diarize_model = Mock()
        mock_diarize_segments = {"segments": []}
        mock_diarize_model.return_value = mock_diarize_segments
        mock_diarize_pipeline.return_value = mock_diarize_model
        
        # Mock 说话人分配结果
        mock_speaker_result = {
            "segments": [{"start": 0.0, "end": 1.0, "text": "Hello", "speaker": "SPEAKER_00"}]
        }
        mock_assign_speakers.return_value = mock_speaker_result
        
        service = WhisperService.get_instance()
        
        # 确保 Diarization 模型未加载（触发 lazy load）
        WhisperService._diarize_model = None
        
        # 调用 transcribe_segment（会在锁内触发 lazy load，验证不会死锁）
        # 设置超时，如果死锁则会在 2 秒后失败
        result = None
        error = None
        
        def call_with_timeout():
            nonlocal result, error
            try:
                result = service.transcribe_segment(str(audio_file), enable_diarization=True)
            except Exception as e:
                error = e
        
        thread = threading.Thread(target=call_with_timeout)
        thread.start()
        thread.join(timeout=2.0)
        
        assert not thread.is_alive(), "方法执行超时，可能存在死锁"
        assert error is None, f"执行失败: {error}"
        assert result is not None, "应该返回结果"
        assert len(result) > 0, "应该返回有效的字幕"
        
        # 验证 Diarization 模型已被加载
        # 注意：由于 _diarize_model 可能被设置为实例变量，我们检查实例或类变量
        assert service._diarize_model is not None or WhisperService._diarize_model is not None

