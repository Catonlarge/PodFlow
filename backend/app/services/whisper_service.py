"""
WhisperX 转录服务（单例模式）

封装 WhisperX 核心功能，实现模型常驻显存，支持分段转录与声纹识别：
1. 转录（Transcribe）
2. 对齐（Align）
3. 说话人区分（Diarization）- 支持显存常驻，避免分段间重复加载

设计要点：
- 单例模式：Whisper 模型常驻显存
- Diarization 模型手动管理：支持在 Episode 处理期间常驻，处理完成后释放
- 资源隔离：提供明确的显存释放接口
"""
import logging
import os
import subprocess
import gc
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
    
    管理 Whisper 和 Diarization 模型的生命周期。
    """
    
    _instance = None
    
    # Whisper 模型状态 (常驻)
    _model = None
    _device = None
    _compute_type = None
    _model_dir = None
    _models_loaded = False

    # Diarization 模型状态 (按需常驻，需手动释放)
    _diarize_model = None
    
    def __init__(self):
        """私有构造函数，请使用 get_instance()"""
        if not WhisperService._models_loaded:
            raise RuntimeError(
                "WhisperService 模型未加载。请先调用 WhisperService.load_models()"
            )
    
    @classmethod
    def get_instance(cls) -> "WhisperService":
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
        加载 Whisper ASR 模型到显存（应用启动时调用）
        注意：此处不加载 Diarization 模型，Diarization 模型由业务逻辑按需调用 load_diarization_model 加载
        """
        if cls._models_loaded:
            logger.warning("[WhisperService] ASR 模型已加载，跳过重复加载")
            return
        
        logger.info("[WhisperService] 开始加载 WhisperX ASR 模型...")
        
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
            current_file = Path(__file__).resolve()
            backend_dir = current_file.parent.parent.parent
            cls._model_dir = str(backend_dir / "data" / "transcript")
        else:
            cls._model_dir = model_dir
        
        os.makedirs(cls._model_dir, exist_ok=True)
        
        # 3. 加载转录模型
        if model_name is None:
            model_name = WHISPER_MODEL
            
        try:
            logger.info(f"[WhisperService] 正在加载 Whisper 模型: {model_name}")
            cls._model = whisperx.load_model(
                model_name,
                cls._device,
                compute_type=cls._compute_type,
                download_root=cls._model_dir
            )
            cls._models_loaded = True
            logger.info(f"[WhisperService] Whisper ASR 模型加载完成")
        except Exception as e:
            logger.error(f"[WhisperService] Whisper ASR 模型加载失败: {e}")
            raise RuntimeError(f"Whisper 模型加载失败: {e}") from e

    def load_diarization_model(self):
        """
        显式加载 Diarization 模型（用于 Episode 处理开始前）
        如果已加载，则直接返回，避免重复加载
        """
        if self._diarize_model is not None:
            return

        logger.info("[WhisperService] 加载 Pyannote Diarization 模型...")
        try:
            self._diarize_model = DiarizationPipeline(
                use_auth_token=HF_TOKEN, 
                device=self._device
            )
            logger.info("[WhisperService] Pyannote 模型加载成功")
        except Exception as e:
            logger.error(f"[WhisperService] Pyannote 模型加载失败: {e}")
            raise RuntimeError(f"Diarization 模型加载失败: {e}") from e

    def release_diarization_model(self):
        """
        显式释放 Diarization 模型（用于 Episode 处理结束后）
        """
        if self._diarize_model is not None:
            logger.info("[WhisperService] 释放 Pyannote Diarization 模型显存...")
            del self._diarize_model
            self._diarize_model = None
            
            # 强制垃圾回收和显存清理
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            logger.info("[WhisperService] Pyannote 模型已释放")

    def transcribe_segment(
        self,
        audio_path: str,
        language: Optional[str] = None,
        batch_size: int = 16,
        enable_diarization: bool = True
    ) -> List[Dict]:
        """
        转录单个音频片段（Transcribe + Align + Optional Diarize）
        
        设计变更：
        - 如果 enable_diarization 为 True，会直接使用 self._diarize_model。
        - 如果 self._diarize_model 未加载，会自动尝试加载（Lazy Load），但不会自动释放。
        - 这种设计允许在上层循环中复用同一个 Diarization 模型。
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        if not self._models_loaded:
            raise RuntimeError("WhisperService 模型未加载")
        
        logger.info(f"[WhisperService] 开始处理片段: {Path(audio_path).name}")
        
        try:
            # Step 1: 转录（Transcribe）
            # logger.debug("[WhisperService] Step 1/3: 转录中...")
            audio = whisperx.load_audio(audio_path)
            result = self._model.transcribe(audio, batch_size=batch_size, language=language)
            
            detected_language = result.get("language", "unknown")
            
            # Step 2: 对齐（Align）
            # logger.debug("[WhisperService] Step 2/3: 对齐中...")
            # 对齐模型比较轻量，Wav2Vec2 通常按需加载并缓存，whisperx 内部有缓存机制
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
            
            # Step 3: 说话人区分（Diarization）
            if enable_diarization:
                # 确保模型已加载
                if self._diarize_model is None:
                    logger.info("[WhisperService] Diarization 模型未预加载，正在自动加载...")
                    self.load_diarization_model()
                
                # logger.debug("[WhisperService] Step 3/3: 运行说话人区分...")
                diarize_segments = self._diarize_model(audio)
                result = whisperx.assign_word_speakers(diarize_segments, result)
            
            # 转换为标准格式
            cues = self._format_result_to_cues(result)
            # logger.info(f"[WhisperService] 片段处理完成，生成 {len(cues)} 条字幕")
            
            return cues
            
        except Exception as e:
            logger.error(f"[WhisperService] 片段转录失败: {e}", exc_info=True)
            raise RuntimeError(f"转录失败: {e}") from e
    
    def extract_segment_to_temp(
        self,
        audio_path: str,
        start_time: float,
        duration: float,
        output_dir: Optional[str] = None
    ) -> str:
        """
        使用 FFmpeg 提取音频片段到临时文件（WAV 格式，PCM 编码）
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
        
        # logger.debug(f"[WhisperService] 提取片段: {temp_path}")
        
        # 3. 使用 FFmpeg 提取
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", audio_path,
                    "-ss", str(start_time),
                    "-t", str(duration),
                    "-ar", "16000",
                    "-ac", "1",
                    "-c:a", "pcm_s16le", # PCM 确保精确切割
                    temp_path
                ],
                check=True,
                capture_output=True,
                text=True
            )
            return temp_path
            
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            logger.error(f"[WhisperService] FFmpeg 提取失败: {error_msg}")
            raise RuntimeError(f"FFmpeg 提取失败: {error_msg}") from e
        except FileNotFoundError:
            raise RuntimeError("FFmpeg 未安装或不在 PATH 中")
    
    def _format_result_to_cues(self, result: Dict) -> List[Dict]:
        """格式化 WhisperX 结果"""
        cues = []
        for seg in result.get("segments", []):
            speaker = seg.get("speaker", "Unknown")
            start = seg.get("start", 0.0)
            end = seg.get("end", 0.0)
            text = seg.get("text", "").strip()
            
            if text:
                cues.append({
                    "start": float(start),
                    "end": float(end),
                    "speaker": str(speaker),
                    "text": text
                })
        return cues
    
    @classmethod
    def get_device_info(cls) -> Dict[str, str]:
        """获取设备信息和显存状态"""
        vram_allocated = "N/A"
        if torch.cuda.is_available():
            vram_allocated = f"{torch.cuda.memory_allocated(0)/1024**3:.2f}GB"
            
        return {
            "device": cls._device or "unknown",
            "compute_type": cls._compute_type or "unknown",
            "asr_model_loaded": cls._models_loaded,
            "diarization_model_loaded": cls._diarize_model is not None,
            "cuda_available": torch.cuda.is_available(),
            "vram_allocated": vram_allocated
        }
