"""
PodFlow 全局配置参数

包含系统级配置，如音频分段阈值、转录参数等。
"""
import os
from dotenv import load_dotenv

# 加载环境变量（从 .env 文件或系统环境变量）
load_dotenv()

# ==================== API Keys 配置 ====================

# HuggingFace Token（必需）
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError(
        "HF_TOKEN environment variable is required. "
        "Please set it in .env file or system environment variables."
    )

# OpenAI API Key（可选）
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Gemini API Key（可选）
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ==================== 音频分段配置 ====================

# 分段时长（秒）
# - 这个值需要通过实验找到最优值
# - 平衡转录速度和用户体验
SEGMENT_DURATION = 180  # 默认 180 秒（3 分钟）

# 说明：
# - 太小（如 60s）：分段过多，转录慢，网络请求多
# - 太大（如 600s）：单段转录时间长，用户等待久，内存占用高
# - 建议范围：120-300 秒
# - 修改后重启服务即可生效，无需更新数据库


# ==================== 转录配置 ====================

# 默认语言
DEFAULT_LANGUAGE = "en-US"

# Whisper 模型
WHISPER_MODEL = "base"  # tiny, base, small, medium, large


# ==================== 文件存储配置 ====================

# 音频文件存储路径（相对于 backend 目录）
AUDIO_STORAGE_PATH = "./data/audios/"

# 最大文件大小（字节）
MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1GB


# ==================== AI 查询配置 ====================

# 默认 AI 提供商
DEFAULT_AI_PROVIDER = "gemini-2.5-flash"

# 可选提供商列表
AVAILABLE_PROVIDERS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gpt-3.5-turbo",
    "gpt-4",
    "gpt-4-turbo",
    "claude-3-sonnet",
    "claude-3-opus"
]
