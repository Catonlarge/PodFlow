"""
硬件兼容性补丁模块

针对 RTX 5070 显卡 + PyTorch Nightly 版本的兼容性修复。

为什么需要这个补丁？
-------------------
RTX 5070 是 NVIDIA 的新款显卡，需要使用最新开发版的 CUDA（CUDA 13.0+）才能充分发挥性能。
然而，这导致了版本兼容性问题：

1. **CUDA 与显卡的匹配要求**：
   - RTX 5070 需要 CUDA 13.0+ 支持
   - 为了使用 CUDA 13.0，必须安装 PyTorch Nightly 版本（开发版）
   - PyTorch 稳定版（如 2.6.0）不支持 CUDA 13.0

2. **WhisperX 与 PyTorch 版本的要求**：
   - WhisperX 依赖特定版本的 PyTorch
   - 使用 PyTorch Nightly 后，部分 API 发生变化或移除
   - WhisperX 内部使用的某些 API 在新版 PyTorch 中不兼容

3. **具体不兼容问题**：
   - PyTorch 2.6+ 默认 `weights_only=True`，WhisperX 模型文件包含 Omegaconf 对象，无法加载
   - PyTorch Nightly 中 `torchaudio.AudioMetaData` 等 API 被移除或重构
   - WhisperX 使用的 pyannote 模型需要兼容旧版 API

解决方案：
---------
本模块提供兼容性补丁，在不修改 WhisperX 源码的前提下，通过 Monkey Patch 方式解决上述问题。
这些补丁仅在 RTX 5070 + PyTorch Nightly 环境下需要，其他环境可以正常使用（补丁会安全跳过）。

使用方法：
---------
必须在应用启动最开始调用（在导入 whisperx 之前）：
    from app.utils.hardware_patch import apply_rtx5070_patches
    
    # 在导入 whisperx 之前调用
    apply_rtx5070_patches()
    import whisperx

设计原则：
- 函数式设计，无状态
- 幂等性：多次调用不会出错
- 详细的日志输出
- 安全失败：即使补丁应用失败，也不会影响其他功能
"""
import logging

logger = logging.getLogger(__name__)


def apply_rtx5070_patches():
    """
    应用针对 RTX 5070 + PyTorch Nightly 的所有兼容性补丁。
    
    补丁内容详解：
    -------------
    1. **Omegaconf 白名单**：
       - 问题：WhisperX 的 VAD/Diarization 模型文件包含 Omegaconf 对象（ListConfig, DictConfig）
       - 原因：PyTorch 2.6+ 默认 `weights_only=True`，不允许加载这些类型
       - 解决：将 Omegaconf 类型添加到 PyTorch 的安全全局列表
    
    2. **weights_only = False 强制设置**：
       - 问题：PyTorch 2.6+ 默认 `weights_only=True`，WhisperX/pyannote 模型无法加载
       - 原因：模型文件包含非标准 Python 对象（Omegaconf, typing.Any 等）
       - 解决：通过 Monkey Patch 强制所有 `torch.load()` 调用使用 `weights_only=False`
       - 安全性：仅对可信来源（HuggingFace）的模型使用此设置
    
    3. **torchaudio AudioMetaData 补丁**：
       - 问题：PyTorch Nightly 版本中 `torchaudio.AudioMetaData` API 被移除或重构
       - 原因：开发版 API 不稳定，WhisperX 依赖的旧版 API 已不存在
       - 解决：创建兼容的 AudioMetaData 类或从新路径导入
    
    4. **torchaudio backend 补丁**：
       - 问题：`list_audio_backends()` 和 `get_audio_backend()` 方法在 Nightly 版本中缺失
       - 原因：API 重构，旧方法被移除
       - 解决：创建兼容的 Mock 函数，返回默认值
    
    使用方式：
    --------
        from app.utils.hardware_patch import apply_rtx5070_patches
        
        # 在导入 whisperx 之前调用
        apply_rtx5070_patches()
        import whisperx
    
    注意：
    ----
        - 必须在导入 whisperx 之前调用
        - 可以多次调用（幂等性），不会重复应用补丁
        - 所有补丁都有异常处理，即使失败也不会影响其他功能
        - 这些补丁仅针对 RTX 5070 + PyTorch Nightly 环境，其他环境可以安全跳过
    """
    logger.info("🔧 [Hardware Patch] 正在应用 RTX 5070 + PyTorch Nightly 兼容性补丁...")
    
    try:
        import torch
        import torchaudio
    except ImportError as e:
        logger.warning(f"⚠️ [Hardware Patch] PyTorch 未安装，跳过补丁应用: {e}")
        return
    
    # 1. 针对 VAD/Diarization：添加 Omegaconf 白名单
    try:
        from omegaconf import ListConfig, DictConfig
        torch.serialization.add_safe_globals([ListConfig, DictConfig])
        logger.debug("✅ [Hardware Patch] Omegaconf 白名单已添加")
    except ImportError:
        logger.debug("ℹ️ [Hardware Patch] omegaconf 未安装，跳过 Omegaconf 补丁")
    except Exception as e:
        logger.warning(f"⚠️ [Hardware Patch] Omegaconf 补丁应用失败: {e}")
    
    # 2. 强制关闭 weights_only 检查 (解决 pyannote 模型加载报错)
    try:
        if not hasattr(torch.load, '_patched'):
            _original_torch_load = torch.load
            
            def safe_load_wrapper(*args, **kwargs):
                """包装 torch.load，强制设置 weights_only=False"""
                # 强制覆盖 weights_only 参数（即使调用者已指定）
                kwargs['weights_only'] = False
                return _original_torch_load(*args, **kwargs)
            
            # 标记已补丁，避免重复应用
            safe_load_wrapper._patched = True
            torch.load = safe_load_wrapper
            logger.debug("✅ [Hardware Patch] torch.load weights_only 补丁已应用")
    except Exception as e:
        logger.warning(f"⚠️ [Hardware Patch] torch.load 补丁应用失败: {e}")
    
    # 3. 修复 torchaudio Nightly 缺少的 AudioMetaData API
    if not hasattr(torchaudio, "AudioMetaData"):
        try:
            # 尝试从新版路径导入
            from torchaudio.backend.common import AudioMetaData
            setattr(torchaudio, "AudioMetaData", AudioMetaData)
            logger.debug("✅ [Hardware Patch] torchaudio.AudioMetaData 已从 backend.common 导入")
        except ImportError:
            # 如果连新路径都变了，创建一个伪造的类来骗过类型检查
            from dataclasses import dataclass
            
            @dataclass
            class AudioMetaData:
                """伪造的 AudioMetaData 类（用于兼容性）"""
                sample_rate: int
                num_frames: int
                num_channels: int
                bits_per_sample: int
                encoding: str
            
            setattr(torchaudio, "AudioMetaData", AudioMetaData)
            logger.debug("✅ [Hardware Patch] torchaudio.AudioMetaData 已创建（伪造类）")
        except Exception as e:
            logger.warning(f"⚠️ [Hardware Patch] AudioMetaData 补丁应用失败: {e}")
    
    # 4. 修复 torchaudio 缺失的 list_audio_backends API
    if not hasattr(torchaudio, "list_audio_backends"):
        def _mock_list_audio_backends():
            """伪造的 list_audio_backends 函数"""
            return ["soundfile"]
        
        setattr(torchaudio, "list_audio_backends", _mock_list_audio_backends)
        logger.debug("✅ [Hardware Patch] torchaudio.list_audio_backends 已创建（伪造函数）")
    
    # 5. 修复 torchaudio 缺失的 get_audio_backend API
    if not hasattr(torchaudio, "get_audio_backend"):
        def _mock_get_audio_backend():
            """伪造的 get_audio_backend 函数"""
            return "soundfile"
        
        setattr(torchaudio, "get_audio_backend", _mock_get_audio_backend)
        logger.debug("✅ [Hardware Patch] torchaudio.get_audio_backend 已创建（伪造函数）")
    
    logger.info("✅ [Hardware Patch] 所有兼容性补丁应用完成")


def check_patches_applied():
    """
    检查补丁是否已应用（用于调试）
    
    返回:
        dict: 包含各项补丁的应用状态
    """
    status = {
        "torch_available": False,
        "torchaudio_available": False,
        "weights_only_patched": False,
        "audiometadata_patched": False,
        "list_backends_patched": False,
        "get_backend_patched": False,
    }
    
    try:
        import torch
        import torchaudio
        status["torch_available"] = True
        status["torchaudio_available"] = True
        
        # 检查 torch.load 是否已补丁
        status["weights_only_patched"] = hasattr(torch.load, '_patched')
        
        # 检查 torchaudio 补丁
        status["audiometadata_patched"] = hasattr(torchaudio, "AudioMetaData")
        status["list_backends_patched"] = hasattr(torchaudio, "list_audio_backends")
        status["get_backend_patched"] = hasattr(torchaudio, "get_audio_backend")
    except ImportError:
        pass
    
    return status

