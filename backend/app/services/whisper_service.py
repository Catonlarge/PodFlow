"""
WhisperX 转录服务（单例模式）

封装 WhisperX 核心功能，实现模型常驻显存，支持分段转录与声纹识别：
1. 转录（Transcribe）
2. 对齐（Align）- 支持模型缓存，相同语言片段复用模型
3. 说话人区分（Diarization）- 支持显存常驻，避免分段间重复加载

设计要点：
- 单例模式：Whisper 模型常驻显存
- 对齐模型缓存：避免重复加载相同语言的 Wav2Vec2 对齐模型
- Diarization 模型手动管理：支持在 Episode 处理期间常驻，处理完成后释放
- 并发安全：使用可重入锁（RLock）保护 GPU 推理操作，确保多线程/多请求环境下的安全性
- 资源隔离：提供明确的显存释放接口
"""
import logging
import os
import subprocess
import gc
import threading
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

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    logger.warning("[WhisperService] psutil 未安装，无法监控系统内存")


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
    
    # Alignment 模型状态 (缓存，避免重复加载)
    _align_model = None
    _align_metadata = None
    _align_language = None
    
    # 线程锁 (保护 GPU 推理操作的并发安全，使用可重入锁以避免嵌套调用时的死锁)
    _gpu_lock = threading.RLock()
    
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
        
        # 3. 检查内存状态
        memory_ok = cls.check_memory_before_load()
        if not memory_ok:
            logger.warning("[WhisperService] 内存/显存使用率较高，加载模型可能导致 OOM")
        
        # 记录当前内存状态
        memory_info = cls.get_memory_info()
        logger.info(f"[WhisperService] 当前内存状态: {memory_info}")
        
        # 4. 加载转录模型
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
            
            # 加载后再次检查内存
            post_memory_info = cls.get_memory_info()
            logger.info(f"[WhisperService] Whisper ASR 模型加载完成 | 加载后内存状态: {post_memory_info}")
        except Exception as e:
            logger.error(f"[WhisperService] Whisper ASR 模型加载失败: {e}")
            raise RuntimeError(f"Whisper 模型加载失败: {e}") from e

    def load_diarization_model(self):
        """
        显式加载 Diarization 模型（用于 Episode 处理开始前）
        如果已加载，则直接返回，避免重复加载
        
        注意：此方法在 transcribe_segment 中可能被调用（lazy load），
        因此使用可重入锁以确保线程安全。
        """
        if self._diarize_model is not None:
            return

        # 使用锁保护 GPU 模型加载操作
        with self._gpu_lock:
            # 双重检查（防止并发调用时重复加载）
            if self._diarize_model is not None:
                return

            # 检查内存状态
            memory_ok = self.check_memory_before_load()
            if not memory_ok:
                logger.warning("[WhisperService] 内存/显存使用率较高，加载 Diarization 模型可能导致 OOM")
            
            # 记录加载前内存状态
            pre_memory_info = self.get_memory_info()
            logger.info(f"[WhisperService] 加载前内存状态: {pre_memory_info}")
            
            logger.info("[WhisperService] 加载 Pyannote Diarization 模型...")
            try:
                self._diarize_model = DiarizationPipeline(
                    use_auth_token=HF_TOKEN, 
                    device=self._device
                )
                
                # 记录加载后内存状态
                post_memory_info = self.get_memory_info()
                logger.info(f"[WhisperService] Pyannote 模型加载成功 | 加载后内存状态: {post_memory_info}")
            except Exception as e:
                logger.error(f"[WhisperService] Pyannote 模型加载失败: {e}")
                raise RuntimeError(f"Diarization 模型加载失败: {e}") from e

    def release_diarization_model(self):
        """
        显式释放 Diarization 模型（用于 Episode 处理结束后）
        
        注意：使用锁保护 GPU 显存释放操作，确保线程安全。
        """
        # 使用锁保护 GPU 显存释放操作
        with self._gpu_lock:
            if self._diarize_model is not None:
                logger.info("[WhisperService] 释放 Pyannote Diarization 模型显存...")
                del self._diarize_model
                self._diarize_model = None
                
                # 强制垃圾回收和显存清理
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                logger.info("[WhisperService] Pyannote 模型已释放")

    def _get_or_load_align_model(self, language_code: str) -> Tuple:
        """
        获取或加载对齐模型（带缓存机制）
        
        如果语言代码与已缓存的相同，直接返回缓存的模型和元数据。
        否则，加载新的对齐模型并更新缓存。
        
        参数:
            language_code: 语言代码（如 "en", "zh" 等）
        
        返回:
            Tuple: (model, metadata) 对齐模型和元数据
        """
        # 如果已缓存且语言相同，直接返回（使用类变量）
        if (WhisperService._align_model is not None and 
            WhisperService._align_metadata is not None and 
            WhisperService._align_language == language_code):
            logger.debug(
                f"[WhisperService] 复用已缓存的对齐模型 "
                f"(语言: {language_code})"
            )
            return WhisperService._align_model, WhisperService._align_metadata
        
        # 需要加载新的对齐模型
        logger.debug(
            f"[WhisperService] 加载对齐模型 "
            f"(语言: {language_code}, "
            f"之前缓存: {WhisperService._align_language or '无'})"
        )
        
        try:
            model_a, metadata = whisperx.load_align_model(
                language_code=language_code,
                device=self._device
            )
            
            # 更新缓存（使用类变量）
            WhisperService._align_model = model_a
            WhisperService._align_metadata = metadata
            WhisperService._align_language = language_code
            
            return model_a, metadata
            
        except Exception as e:
            logger.error(f"[WhisperService] 对齐模型加载失败: {e}")
            raise RuntimeError(f"对齐模型加载失败: {e}") from e

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
        - 使用线程锁保护 GPU 推理操作，确保并发安全。
        - 对齐模型已缓存，相同语言的片段会复用已加载的模型。
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        if not self._models_loaded:
            raise RuntimeError("WhisperService 模型未加载")
        
        logger.info(f"[WhisperService] 开始处理片段: {Path(audio_path).name}")
        
        # 使用线程锁保护 GPU 推理操作（确保并发安全）
        with self._gpu_lock:
            try:
                # Step 1: 转录（Transcribe）
                audio = whisperx.load_audio(audio_path)
                result = self._model.transcribe(audio, batch_size=batch_size, language=language)
                
                detected_language = result.get("language", "unknown")
                
                # Step 2: 对齐（Align）- 使用缓存机制避免重复加载
                model_a, metadata = self._get_or_load_align_model(detected_language)
                result = whisperx.align(
                    result["segments"],
                    model_a,
                    metadata,
                    audio,
                    self._device,
                    return_char_alignments=False
                )
                
                # Step 3: 说话人区分（Diarization）- 复用内存中的 audio 数组
                if enable_diarization:
                    # 确保模型已加载
                    if self._diarize_model is None:
                        logger.info("[WhisperService] Diarization 模型未预加载，正在自动加载...")
                        self.load_diarization_model()
                    
                    # 复用已加载的 audio 数组，避免重新读取文件
                    diarize_segments = self._diarize_model(audio)
                    result = whisperx.assign_word_speakers(diarize_segments, result)
                
                # 转换为标准格式
                cues = self._format_result_to_cues(result)
                
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
    
    @staticmethod
    def get_memory_info() -> Dict[str, any]:
        """
        获取系统内存和显存使用情况
        
        返回:
            Dict: 包含系统内存和显存信息的字典
        """
        memory_info = {
            "system_memory": {},
            "gpu_memory": {}
        }
        
        # 系统内存监控
        if PSUTIL_AVAILABLE:
            try:
                mem = psutil.virtual_memory()
                memory_info["system_memory"] = {
                    "total_gb": f"{mem.total / 1024**3:.2f}",
                    "available_gb": f"{mem.available / 1024**3:.2f}",
                    "used_gb": f"{mem.used / 1024**3:.2f}",
                    "percent": f"{mem.percent:.1f}%"
                }
            except Exception as e:
                logger.warning(f"[WhisperService] 获取系统内存信息失败: {e}")
                memory_info["system_memory"] = {"error": str(e)}
        else:
            memory_info["system_memory"] = {"status": "psutil not available"}
        
        # GPU 显存监控
        if torch.cuda.is_available():
            try:
                device = torch.cuda.current_device()
                total_memory = torch.cuda.get_device_properties(device).total_memory / 1024**3
                allocated_memory = torch.cuda.memory_allocated(device) / 1024**3
                reserved_memory = torch.cuda.memory_reserved(device) / 1024**3
                free_memory = total_memory - reserved_memory
                
                memory_info["gpu_memory"] = {
                    "total_gb": f"{total_memory:.2f}",
                    "allocated_gb": f"{allocated_memory:.2f}",
                    "reserved_gb": f"{reserved_memory:.2f}",
                    "free_gb": f"{free_memory:.2f}",
                    "percent": f"{(reserved_memory / total_memory * 100):.1f}%"
                }
            except Exception as e:
                logger.warning(f"[WhisperService] 获取显存信息失败: {e}")
                memory_info["gpu_memory"] = {"error": str(e)}
        else:
            memory_info["gpu_memory"] = {"status": "CUDA not available"}
        
        return memory_info
    
    @staticmethod
    def check_memory_before_load(warning_threshold: float = 0.85) -> bool:
        """
        在加载模型前检查内存和显存是否充足
        
        参数:
            warning_threshold (float): 警告阈值（0.0-1.0），默认 0.85（85%）
        
        返回:
            bool: True 表示内存充足，False 表示内存不足
        """
        warnings = []
        
        # 检查系统内存
        if PSUTIL_AVAILABLE:
            try:
                mem = psutil.virtual_memory()
                mem_percent = mem.percent / 100.0
                if mem_percent > warning_threshold:
                    warnings.append(
                        f"系统内存使用率过高: {mem.percent:.1f}% "
                        f"(可用: {mem.available / 1024**3:.2f}GB / 总计: {mem.total / 1024**3:.2f}GB)"
                    )
            except Exception as e:
                logger.warning(f"[WhisperService] 检查系统内存失败: {e}")
        
        # 检查 GPU 显存
        if torch.cuda.is_available():
            try:
                device = torch.cuda.current_device()
                total_memory = torch.cuda.get_device_properties(device).total_memory
                reserved_memory = torch.cuda.memory_reserved(device)
                reserved_percent = reserved_memory / total_memory
                
                if reserved_percent > warning_threshold:
                    free_memory = (total_memory - reserved_memory) / 1024**3
                    total_memory_gb = total_memory / 1024**3
                    warnings.append(
                        f"GPU 显存使用率过高: {reserved_percent * 100:.1f}% "
                        f"(可用: {free_memory:.2f}GB / 总计: {total_memory_gb:.2f}GB)"
                    )
            except Exception as e:
                logger.warning(f"[WhisperService] 检查显存失败: {e}")
        
        # 输出警告
        if warnings:
            for warning in warnings:
                logger.warning(f"[WhisperService] ⚠️ {warning}")
            return False
        
        return True
    
    @classmethod
    def get_device_info(cls) -> Dict[str, any]:
        """
        获取设备信息和显存状态（增强版，包含详细内存信息）
        """
        memory_info = cls.get_memory_info()
        
        vram_allocated = "N/A"
        vram_total = "N/A"
        vram_free = "N/A"
        vram_percent = "N/A"
        
        if torch.cuda.is_available():
            try:
                device = torch.cuda.current_device()
                vram_allocated = f"{torch.cuda.memory_allocated(0)/1024**3:.2f}GB"
                vram_total = f"{torch.cuda.get_device_properties(device).total_memory/1024**3:.2f}GB"
                reserved = torch.cuda.memory_reserved(device)
                vram_free = f"{(torch.cuda.get_device_properties(device).total_memory - reserved)/1024**3:.2f}GB"
                vram_percent = f"{(reserved / torch.cuda.get_device_properties(device).total_memory * 100):.1f}%"
            except Exception:
                pass
            
        return {
            "device": cls._device or "unknown",
            "compute_type": cls._compute_type or "unknown",
            "asr_model_loaded": cls._models_loaded,
            "diarization_model_loaded": cls._diarize_model is not None,
            "align_model_loaded": cls._align_model is not None,
            "align_model_language": cls._align_language,
            "cuda_available": torch.cuda.is_available(),
            "vram_allocated": vram_allocated,
            "vram_total": vram_total,
            "vram_free": vram_free,
            "vram_percent": vram_percent,
            "memory_info": memory_info
        }
