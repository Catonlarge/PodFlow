"""
测试 Whisper 服务
"""
import pytest
from unittest.mock import Mock, patch
from app.services.whisper_service import WhisperService


@pytest.fixture
def whisper_service():
    """创建 WhisperService 实例"""
    return WhisperService(model_name="tiny")  # 使用 tiny 模型进行测试


def test_whisper_service_init(whisper_service):
    """测试 WhisperService 初始化"""
    assert whisper_service.model_name == "tiny"
    assert whisper_service.model is None


@patch('app.services.whisper_service.whisper.load_model')
def test_load_model(mock_load_model, whisper_service):
    """测试加载模型"""
    mock_model = Mock()
    mock_load_model.return_value = mock_model
    
    whisper_service.load_model()
    
    assert whisper_service.model == mock_model
    mock_load_model.assert_called_once_with("tiny")


@patch('app.services.whisper_service.whisper.load_model')
def test_transcribe(mock_load_model, whisper_service):
    """测试转录音频"""
    # Mock 模型和转录结果
    mock_model = Mock()
    mock_result = {
        "text": "Hello world",
        "segments": [
            {"start": 0.0, "end": 1.0, "text": "Hello "},
            {"start": 1.0, "end": 2.0, "text": "world"}
        ],
        "language": "en"
    }
    mock_model.transcribe.return_value = mock_result
    mock_load_model.return_value = mock_model
    
    result = whisper_service.transcribe("test_audio.mp3")
    
    assert result["text"] == "Hello world"
    assert len(result["segments"]) == 2
    assert result["language"] == "en"


@patch('app.services.whisper_service.whisper.load_model')
def test_transcribe_with_timestamps(mock_load_model, whisper_service):
    """测试带时间戳的转录"""
    # Mock 模型和转录结果
    mock_model = Mock()
    mock_result = {
        "text": "Hello world",
        "segments": [
            {"start": 0.0, "end": 1.0, "text": "Hello "},
            {"start": 1.0, "end": 2.0, "text": "world"}
        ],
        "language": "en"
    }
    mock_model.transcribe.return_value = mock_result
    mock_load_model.return_value = mock_model
    
    result = whisper_service.transcribe_with_timestamps("test_audio.mp3")
    
    assert len(result) == 2
    assert result[0]["start"] == 0.0
    assert result[0]["end"] == 1.0
    assert result[0]["text"] == "Hello"
    assert result[1]["text"] == "world"

