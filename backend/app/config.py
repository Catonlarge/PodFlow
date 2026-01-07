"""
PodFlow 全局配置参数

包含系统级配置，如音频分段阈值、转录参数以及统一的 AI 服务配置。
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# ==================== 1. 显式加载 .env 文件 ====================
# 获取当前文件 (config.py) 的绝对路径
# 路径关系: backend/app/config.py -> parent=app -> parent=backend
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / '.env'

# 强制加载指定的 .env 文件，override=True 确保 .env 优先级高于系统变量
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH, override=True)
else:
    print(f"[WARNING] .env file not found at: {ENV_PATH}")


# ==================== 核心服务配置 ====================

# HuggingFace Token（必需，用于 WhisperX 说话人区分）
HF_TOKEN = os.getenv("HF_TOKEN")
# 注意：此处不抛出异常，允许无 Token 启动（虽然 Diarization 会失败），方便仅使用基础功能的场景


# ==================== AI 服务配置 (统一架构) ====================

# AI 提供商类型: 'openai' (兼容接口) 或 'gemini' (原生接口)
AI_PROVIDER_TYPE = os.getenv("AI_PROVIDER_TYPE", "openai").lower()

# AI 模型名称 (如 moonshot-v1-8k, gemini-2.0-flash, gpt-4)
AI_MODEL_NAME = os.getenv("AI_MODEL_NAME", "kimi-k2-0905-preview")

# AI API Key
AI_API_KEY = os.getenv("AI_API_KEY", "")

# AI Base URL (仅用于 OpenAI 兼容接口，如 Kimi/DeepSeek)
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.moonshot.cn/v1")

# AI 查询超时时间（秒）
AI_QUERY_TIMEOUT = 60

# AI Mock 模式（用于前端调试，不消耗 Token）
USE_AI_MOCK = os.getenv("USE_AI_MOCK", "false").lower() in ("true", "1")


# ==================== 音频与存储配置 ====================

# 分段时长（秒）
SEGMENT_DURATION = 180

# 默认语言
DEFAULT_LANGUAGE = "en-US"

# Whisper 模型
WHISPER_MODEL = "base"

# 音频存储路径 (使用绝对路径确保安全)
AUDIO_STORAGE_PATH = os.path.join(BASE_DIR, "data", "audios")

# 最大文件大小 (1GB)
MAX_FILE_SIZE = 1024 * 1024 * 1024