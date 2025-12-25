"""
WhisperX 转录服务（单例模式）

封装 WhisperX 核心功能，实现模型常驻显存，支持完整转录流程：
1. 转录（Transcribe）
2. 对齐（Align）
3. 说话人区分（Diarization）

设计要点：
- 单例模式：模型只加载一次，常驻显存，避免重复加载导致的显存浪费
- 设备自动检测：支持 CUDA 和 CPU
- 完整的错误处理和日志记录
"""
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Optional, Tuple

# 必须在导入 whisperx 之前应用硬件补丁
from app.utils.hardware_patch import apply_rtx5070_patches

# 应用补丁（幂等性，多次调用不会出错）
apply_rtx5070_patches()

import whisperx
from whisperx.diarize import DiarizationPipeline
import torch

from app.config import HF_TOKEN, WHISPER_MODEL

logger = logging.getLogger(__name__)


class WhisperService:
    """
    WhisperX 转录服务（单例模式）
    
    封装 WhisperX 核心功能，实现模型常驻显存。
    模型在应用启动时加载一次，后续所有转录请求共享同一个模型实例。
    
    使用方式：
        # 应用启动时加载模型
        WhisperService.load_models()
        
        # 获取单例实例
        service = WhisperService.get_instance()
        
        # 执行转录
        cues = service.transcribe_full_pipeline("audio.mp3")
    """
    
    _instance = None
    _model = None
    _device = None
    _compute_type = None
    _model_dir = None
    _models_loaded = False
    
    def __init__(self):
        """
        私有构造函数（单例模式）
        
        注意：不要直接调用此构造函数，使用 get_instance() 获取实例。
        """
        if not WhisperService._models_loaded:
            raise RuntimeError(
                "WhisperService 模型未加载。请先调用 WhisperService.load_models()"
            )
    
    @classmethod
    def get_instance(cls) -> "WhisperService":
        """
        获取单例实例
        
        返回:
            WhisperService: 单例实例
        
        异常:
            RuntimeError: 如果模型未加载
        """
        if cls._instance is None:
            if not cls._models_loaded:
                raise RuntimeError(
                    "WhisperService 模型未加载。请先调用 WhisperService.load_models()"
                )
            cls._instance = cls.__new__(cls)
        return cls._instance
    
    @classmethod
    def load_models(cls, model_name: Optional[str] = None, model_dir: Optional[str] = None):
        """
        加载 WhisperX 模型到显存（应用启动时调用）
        
        此方法在应用启动时调用一次，加载模型到显存。
        模型会常驻显存，后续所有转录请求共享同一个模型实例。
        
        参数:
            model_name (str, optional): Whisper 模型名称（如 "large-v2", "base"）
                默认使用 config.WHISPER_MODEL
            model_dir (str, optional): 模型缓存目录
                默认使用 backend/data/transcript/
        
        异常:
            RuntimeError: 如果模型加载失败
        """
        if cls._models_loaded:
            logger.warning("[WhisperService] 模型已加载，跳过重复加载")
            return
        
        logger.info("[WhisperService] 开始加载 WhisperX 模型...")
        
        # 1. 设备检测
        if torch.cuda.is_available():
            cls._device = "cuda"
            cls._compute_type = "float16"
            device_name = torch.cuda.get_device_name(0)
            logger.info(f"[WhisperService] 硬件就绪: {device_name} (CUDA)")
        else:
            cls._device = "cpu"
            cls._compute_type = "int8"
            logger.warning("[WhisperService] 使用 CPU 运行（性能较慢）")
        
        # 2. 模型目录设置
        if model_dir is None:
            # 默认使用 backend/data/transcript/
            current_file = Path(__file__).resolve()
            backend_dir = current_file.parent.parent.parent
            cls._model_dir = str(backend_dir / "data" / "transcript")
        else:
            cls._model_dir = model_dir
        
        os.makedirs(cls._model_dir, exist_ok=True)
        logger.debug(f"[WhisperService] 模型缓存目录: {cls._model_dir}")
        
        # 3. 模型名称
        if model_name is None:
            model_name = WHISPER_MODEL
        
        # 4. 加载转录模型
        try:
            logger.info(f"[WhisperService] 正在加载 Whisper 模型: {model_name}")
            cls._model = whisperx.load_model(
                model_name,
                cls._device,
                compute_type=cls._compute_type,
                download_root=cls._model_dir
            )
            logger.info(f"[WhisperService] Whisper 模型加载完成: {model_name}")
        except Exception as e:
            logger.error(f"[WhisperService] Whisper 模型加载失败: {e}")
            raise RuntimeError(f"Whisper 模型加载失败: {e}") from e
        
        cls._models_loaded = True
        logger.info("[WhisperService] 所有模型加载完成，服务就绪")
    
    def transcribe_full_pipeline(
        self,
        audio_path: str,
        language: Optional[str] = None,
        batch_size: int = 16,
        enable_diarization: bool = True
    ) -> List[Dict]:
        """
        完整转录流程：转录 + 对齐 + 说话人区分
        
        执行完整的 WhisperX 转录流程：
        1. 转录（Transcribe）：使用 Whisper 模型转录音频
        2. 对齐（Align）：使用 Wav2Vec2 模型校准时间戳
        3. 说话人区分（Diarization）：使用 Pyannote 模型区分说话人
        
        参数:
            audio_path (str): 音频文件路径
            language (str, optional): 语言代码（如 "en", "zh"）
                如果为 None，自动检测语言
            batch_size (int): 批处理大小（默认 16）
            enable_diarization (bool): 是否启用说话人区分（默认 True）
        
        返回:
            List[Dict]: 字幕列表，格式为：
                [
                    {
                        "start": float,      # 开始时间（秒）
                        "end": float,        # 结束时间（秒）
                        "speaker": str,      # 说话人标签（如 "SPEAKER_00"）
                        "text": str          # 转录文本
                    },
                    ...
                ]
        
        异常:
            FileNotFoundError: 如果音频文件不存在
            RuntimeError: 如果转录失败
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        if not self._models_loaded:
            raise RuntimeError("WhisperService 模型未加载")
        
        logger.info(f"[WhisperService] 开始转录: {audio_path}")
        
        try:
            # Step 1: 转录（Transcribe）
            logger.debug("[WhisperService] Step 1/3: 转录中...")
            audio = whisperx.load_audio(audio_path)
            result = self._model.transcribe(audio, batch_size=batch_size, language=language)
            
            detected_language = result.get("language", "unknown")
            logger.info(f"[WhisperService] 转录完成 | 识别语言: {detected_language}")
            
            # Step 2: 对齐（Align）
            logger.debug("[WhisperService] Step 2/3: 对齐中...")
            model_a, metadata = whisperx.load_align_model(
                language_code=detected_language,
                device=self._device
            )
            result = whisperx.align(
                result["segments"],
                model_a,
                metadata,
                audio,
                self._device,
                return_char_alignments=False
            )
            logger.info("[WhisperService] 对齐完成")
            
            # Step 3: 说话人区分（Diarization）
            if enable_diarization:
                logger.debug("[WhisperService] Step 3/3: 说话人区分中...")
                diarize_model = DiarizationPipeline(use_auth_token=HF_TOKEN, device=self._device)
                diarize_segments = diarize_model(audio)
                result = whisperx.assign_word_speakers(diarize_segments, result)
                logger.info("[WhisperService] 说话人区分完成")
            else:
                logger.debug("[WhisperService] 跳过说话人区分")
            
            # 转换为标准格式
            cues = self._format_result_to_cues(result)
            logger.info(f"[WhisperService] 转录完成，共 {len(cues)} 条字幕")
            
            return cues
            
        except Exception as e:
            logger.error(f"[WhisperService] 转录失败: {e}", exc_info=True)
            raise RuntimeError(f"转录失败: {e}") from e
    
    def extract_segment_to_temp(
        self,
        audio_path: str,
        start_time: float,
        duration: float,
        output_dir: Optional[str] = None
    ) -> str:
        """
        使用 FFmpeg 提取音频片段到临时文件（WAV 格式，精准切割）
        
        使用 FFmpeg 从原音频中提取指定时间范围的片段，并转码为 WAV 格式。
        关键：使用 PCM 编码（pcm_s16le），确保秒级精准切割（不使用 -c copy）。
        
        为什么使用 PCM 编码？
        ---------------------
        - MP3 是压缩格式，只能在关键帧（Keyframe）处切割
        - 如果指定的 start_time 不是关键帧，FFmpeg 会寻找最近的关键帧
        - 导致切出的音频有几秒偏差，Whisper 识别的时间戳整体偏移
        - 使用 PCM 编码可以秒级精准切割，无关键帧限制
        
        参数:
            audio_path (str): 原音频文件路径
            start_time (float): 开始时间（秒）
            duration (float): 片段时长（秒）
            output_dir (str, optional): 输出目录
                默认使用 backend/data/temp_segments/
        
        返回:
            str: 临时文件路径（WAV 格式）
        
        异常:
            FileNotFoundError: 如果音频文件不存在
            subprocess.CalledProcessError: 如果 FFmpeg 执行失败
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        # 1. 确定输出目录
        if output_dir is None:
            current_file = Path(__file__).resolve()
            backend_dir = current_file.parent.parent.parent
            output_dir = str(backend_dir / "data" / "temp_segments")
        
        os.makedirs(output_dir, exist_ok=True)
        
        # 2. 生成临时文件路径
        audio_name = Path(audio_path).stem
        temp_filename = f"segment_{start_time:.2f}_{duration:.2f}_{audio_name}.wav"
        temp_path = os.path.join(output_dir, temp_filename)
        
        logger.debug(
            f"[WhisperService] 提取音频片段: {audio_path} "
            f"[{start_time:.2f}s, {start_time + duration:.2f}s] -> {temp_path}"
        )
        
        # 3. 使用 FFmpeg 提取片段（PCM 编码，精准切割）
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",  # -y: 覆盖已存在的文件
                    "-i", audio_path,
                    "-ss", str(start_time),  # 开始时间
                    "-t", str(duration),     # 持续时间
                    "-ar", "16000",          # 采样率：16kHz（Whisper 需要）
                    "-ac", "1",              # 声道数：单声道
                    "-c:a", "pcm_s16le",     # 编码：PCM 16-bit little-endian（精准切割）
                    temp_path
                ],
                check=True,
                capture_output=True,  # 捕获输出，避免污染日志
                text=True
            )
            logger.debug(f"[WhisperService] 音频片段提取完成: {temp_path}")
            return temp_path
            
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            logger.error(f"[WhisperService] FFmpeg 提取失败: {error_msg}")
            raise RuntimeError(f"FFmpeg 提取失败: {error_msg}") from e
        except FileNotFoundError:
            logger.error("[WhisperService] FFmpeg 未安装或不在 PATH 中")
            raise RuntimeError("FFmpeg 未安装或不在 PATH 中。请安装 FFmpeg 并添加到系统 PATH。")
    
    def _format_result_to_cues(self, result: Dict) -> List[Dict]:
        """
        将 WhisperX 结果转换为标准字幕格式
        
        参数:
            result (Dict): WhisperX 转录结果
        
        返回:
            List[Dict]: 标准字幕列表
        """
        cues = []
        
        for seg in result.get("segments", []):
            # 某些片段可能无法识别说话人，使用 "Unknown" 作为默认值
            speaker = seg.get("speaker", "Unknown")
            start = seg.get("start", 0.0)
            end = seg.get("end", 0.0)
            text = seg.get("text", "").strip()
            
            if text:  # 只添加非空文本
                cues.append({
                    "start": float(start),
                    "end": float(end),
                    "speaker": str(speaker),
                    "text": text
                })
        
        return cues
    
    @classmethod
    def get_device_info(cls) -> Dict[str, str]:
        """
        获取设备信息（用于调试和监控）
        
        返回:
            Dict[str, str]: 设备信息
        """
        return {
            "device": cls._device or "unknown",
            "compute_type": cls._compute_type or "unknown",
            "models_loaded": cls._models_loaded,
            "cuda_available": torch.cuda.is_available(),
            "cuda_device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
        }

