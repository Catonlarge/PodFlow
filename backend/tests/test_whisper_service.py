"""
WhisperService 测试用例

测试 WhisperX 转录服务的核心功能：
1. 单例模式
2. 模型加载
3. 完整转录流程
4. FFmpeg 片段提取
5. 时间戳精度
6. 说话人识别
"""
import os
import pytest
import tempfile
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path

from app.services.whisper_service import WhisperService


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
    
    @patch('app.services.whisper_service.whisperx.load_audio')
    @patch('app.services.whisper_service.whisperx.load_align_model')
    @patch('app.services.whisper_service.whisperx.align')
    @patch('app.services.whisper_service.os.path.exists')
    def test_transcribe_full_pipeline_without_diarization(
        self, mock_exists, mock_align, mock_load_align, mock_load_audio, tmp_path
    ):
        """测试完整转录流程（不启用说话人区分）"""
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
        cues = service.transcribe_full_pipeline(str(audio_file), enable_diarization=False)
        
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
    def test_transcribe_full_pipeline_with_diarization(
        self, mock_exists, mock_assign_speakers, mock_diarize_pipeline,
        mock_align, mock_load_align, mock_load_audio, tmp_path
    ):
        """测试完整转录流程（启用说话人区分）"""
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
        cues = service.transcribe_full_pipeline(str(audio_file), enable_diarization=True)
        
        # 验证结果
        assert len(cues) == 2
        assert cues[0]["speaker"] == "SPEAKER_00"
        assert cues[1]["speaker"] == "SPEAKER_01"
    
    def test_transcribe_file_not_found(self):
        """测试文件不存在时的错误处理"""
        service = WhisperService.get_instance()
        
        with pytest.raises(FileNotFoundError, match="音频文件不存在"):
            service.transcribe_full_pipeline("nonexistent.mp3")
    
    def test_transcribe_models_not_loaded(self):
        """测试模型未加载时的错误处理"""
        # 重置状态
        WhisperService._models_loaded = False
        
        with pytest.raises(RuntimeError, match="模型未加载"):
            service = WhisperService.get_instance()
            service.transcribe_full_pipeline("test_audio.mp3")


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


class TestWhisperServiceDeviceInfo:
    """测试设备信息获取"""
    
    @patch('app.services.whisper_service.torch.cuda.is_available')
    @patch('app.services.whisper_service.torch.cuda.get_device_name')
    def test_get_device_info_cpu(self, mock_get_device, mock_cuda):
        """测试 CPU 模式下的设备信息"""
        mock_cuda.return_value = False
        
        info = WhisperService.get_device_info()
        
        assert info["cuda_available"] is False
        assert info["cuda_device_name"] is None
    
    @patch('app.services.whisper_service.torch.cuda.is_available')
    @patch('app.services.whisper_service.torch.cuda.get_device_name')
    def test_get_device_info_cuda(self, mock_get_device, mock_cuda):
        """测试 CUDA 模式下的设备信息"""
        mock_cuda.return_value = True
        mock_get_device.return_value = "RTX 5070"
        
        # 设置模型已加载状态
        WhisperService._device = "cuda"
        WhisperService._compute_type = "float16"
        WhisperService._models_loaded = True
        
        info = WhisperService.get_device_info()
        
        assert info["device"] == "cuda"
        assert info["compute_type"] == "float16"
        assert info["cuda_available"] is True
        assert info["cuda_device_name"] == "RTX 5070"
        assert info["models_loaded"] is True


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

