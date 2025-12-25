import sys
import os
import time  # [新增 1] 导入时间模块
from pathlib import Path


# 添加项目路径（必须在导入 app 模块之前）
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent.parent  # services -> app -> backend
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# 现在可以安全导入 app 模块了
from app.config import HF_TOKEN


import sys
import os
import time
import gc 
from pathlib import Path

# ==========================================
# [终极补丁区] RTX 5070 + PyTorch Nightly 全兼容修复
# ==========================================
import torch
import torchaudio

# 1. 针对 VAD/Diarization：添加 Omegaconf 白名单
try:
    from omegaconf import ListConfig, DictConfig
    torch.serialization.add_safe_globals([ListConfig, DictConfig])
except ImportError:
    pass
except Exception:
    pass

# 2. 强制关闭 weights_only 检查 (解决 pyannote 模型加载报错)
try:
    _original_torch_load = torch.load
    def safe_load_wrapper(*args, **kwargs):
        kwargs['weights_only'] = False
        return _original_torch_load(*args, **kwargs)
    torch.load = safe_load_wrapper
except Exception:
    pass

# 3. 修复 torchaudio Nightly 缺少的 API
if not hasattr(torchaudio, "AudioMetaData"):
    try:
        from torchaudio.backend.common import AudioMetaData
        setattr(torchaudio, "AudioMetaData", AudioMetaData)
    except ImportError:
        from dataclasses import dataclass
        @dataclass
        class AudioMetaData:
            sample_rate: int
            num_frames: int
            num_channels: int
            bits_per_sample: int
            encoding: str
        setattr(torchaudio, "AudioMetaData", AudioMetaData)

if not hasattr(torchaudio, "list_audio_backends"):
    def _mock_list_audio_backends():
        return ["soundfile"] 
    setattr(torchaudio, "list_audio_backends", _mock_list_audio_backends)

if not hasattr(torchaudio, "get_audio_backend"):
    def _mock_get_audio_backend():
        return "soundfile"
    setattr(torchaudio, "get_audio_backend", _mock_get_audio_backend)

# ==========================================

import whisperx
from whisperx.diarize import DiarizationPipeline

# 添加项目路径
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# ==========================================
# [配置区] 请在此处填入你的 Token
# ==========================================
# ⚠️ 必须在 HuggingFace 同意 pyannote/segmentation-3.0 的协议

def transcribe_demo():
    print("\n--- WhisperX 全流程：转录 + 对齐 + 角色区分 ---")
    
    # 1. 硬件准备
    if torch.cuda.is_available():
        device = "cuda"
        compute_type = "float16"
        print(f"✅ 硬件就绪: {torch.cuda.get_device_name(0)}")
    else:
        device = "cpu"
        compute_type = "int8"
        print("⚠️ 使用 CPU 运行")

    audio_file = r"D:\programming_enviroment\learning-EnglishPod3\backend\data\audio\003.mp3"
    model_dir = r"D:\programming_enviroment\learning-EnglishPod3\backend\data\transcript"
    
    if not os.path.exists(model_dir):
        os.makedirs(model_dir)

    try:
        if not os.path.exists(audio_file):
            print(f"❌ 错误: 找不到音频文件 {audio_file}")
            return

        # ==========================================
        # Step 1: 转录 (Transcribe)
        # ==========================================
        print(f"\n🚀 [Step 1/3] 正在加载 Whisper 模型并转录...")
        t0 = time.time()
        
        # 加载转录模型
        model = whisperx.load_model("large-v2", device, compute_type=compute_type, download_root=model_dir)
        
        # 加载音频
        audio = whisperx.load_audio(audio_file)
        
        # 执行转录
        result = model.transcribe(audio, batch_size=16)
        
        # 释放显存：转录模型用完即弃（为了给后面的模型腾地方，虽然 5070 显存很大）
        # gc.collect()
        # torch.cuda.empty_cache()
        # del model
        
        t1 = time.time()
        print(f"✅ 转录完成 (耗时 {t1 - t0:.2f}s) | 识别语言: {result['language']}")

        # ==========================================
        # Step 2: 对齐 (Align)
        # ==========================================
        print(f"\n🚀 [Step 2/3] 正在加载对齐模型并校准时间戳...")
        t2 = time.time()
        
        # 加载专门的对齐模型（Wav2Vec2）
        model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
        
        # 执行对齐
        result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)
        
        # 释放显存
        # gc.collect()
        # torch.cuda.empty_cache()
        # del model_a
        
        t3 = time.time()
        print(f"✅ 对齐完成 (耗时 {t3 - t2:.2f}s)")

        # ==========================================
        # Step 3: 说话人区分 (Diarization)
        # ==========================================
        print(f"\n🚀 [Step 3/3] 正在加载 Diarization 模型区分角色...")
        t4 = time.time()
        
        # 加载 Pyannote 模型 (需要 HF Token)
        # 注意：这里会触发 weights_only 检查，我们上面的补丁至关重要
        diarize_model = DiarizationPipeline(use_auth_token=HF_TOKEN, device=device)
        
        # 执行区分
        # min_speakers 和 max_speakers 可选，如果不确定就去掉
        diarize_segments = diarize_model(audio)
        
        # 将角色标签合并回转录结果
        result = whisperx.assign_word_speakers(diarize_segments, result)
        
        t5 = time.time()
        print(f"✅ 角色区分完成 (耗时 {t5 - t4:.2f}s)")
        
        print(f"\n🏁 全流程总耗时: {t5 - t0:.2f} 秒")

        # ==========================================
        # 结果展示
        # ==========================================
        print("\n--- 最终剧本预览 ---")
        for seg in result["segments"]:
            # 某些片段可能无法识别说话人，处理 KeyError
            speaker = seg.get("speaker", "Unknown")
            start = seg['start']
            end = seg['end']
            text = seg['text'].strip()
            print(f"[{start:6.2f}s -> {end:6.2f}s] {speaker}: {text}")

    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        if "401 Client Error" in str(e) or "403 Client Error" in str(e):
            print("\n🚨 鉴权失败提示：")
            print("1. 请确保你在代码顶部填入了正确的 HF_TOKEN")
            print("2. 请确保你已在 HuggingFace 官网接受了 'pyannote/segmentation-3.0' 的用户协议")

if __name__ == "__main__":
    transcribe_demo()