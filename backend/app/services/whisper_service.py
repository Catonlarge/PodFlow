"""
Whisper 语音识别服务
"""
import whisper
from typing import Optional


class WhisperService:
    """Whisper 语音识别服务类"""
    
    def __init__(self, model_name: str = "base"):
        """
        初始化 Whisper 服务
        
        Args:
            model_name: Whisper 模型名称 (tiny, base, small, medium, large)
        """
        self.model_name = model_name
        self.model: Optional[whisper.Whisper] = None
    
    def load_model(self):
        """加载 Whisper 模型"""
        if self.model is None:
            self.model = whisper.load_model(self.model_name)
    
    def transcribe(self, audio_path: str) -> dict:
        """
        转录音频文件
        
        Args:
            audio_path: 音频文件路径
            
        Returns:
            包含转录文本和时间戳的字典
        """
        if self.model is None:
            self.load_model()
        
        result = self.model.transcribe(audio_path)
        return {
            "text": result["text"],
            "segments": result.get("segments", []),
            "language": result.get("language", "en")
        }
    
    def transcribe_with_timestamps(self, audio_path: str) -> list:
        """
        转录音频文件并返回带时间戳的文本段
        
        Args:
            audio_path: 音频文件路径
            
        Returns:
            包含时间戳和文本的列表
        """
        result = self.transcribe(audio_path)
        return [
            {
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip()
            }
            for segment in result["segments"]
        ]

