"""
PodFlow FastAPI 应用入口

使用 lifespan 管理模型生命周期，支持后台任务异步转录。
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.utils.hardware_patch import apply_rtx5070_patches
from app.services.whisper_service import WhisperService
from app.api import router as api_router
from app.config import AUDIO_STORAGE_PATH
from app.models import SessionLocal, Episode, init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    
    启动时：
    1. 应用硬件兼容性补丁（必须在导入 whisperx 之前）
    2. 加载 Whisper ASR 模型到显存（单例模式，常驻显存）
    
    关闭时：
    1. 清理资源（可选）
    """
    # 启动前：应用补丁 + 加载模型
    logger.info("[System] 应用启动，正在初始化...")
    
    try:
        # 1. 初始化数据库（确保表结构是最新的）
        logger.info("[System] 初始化数据库...")
        init_db()
        logger.info("[System] 数据库初始化完成")
        
        # 2. 创建必要的目录
        audio_storage = Path(AUDIO_STORAGE_PATH)
        audio_storage.mkdir(parents=True, exist_ok=True)
        logger.info(f"[System] 音频存储目录已创建: {audio_storage.absolute()}")
        
        # 3. 应用硬件兼容性补丁（必须在导入 whisperx 之前）
        logger.info("[System] 应用硬件兼容性补丁...")
        apply_rtx5070_patches()
        
        # 4. 加载 Whisper ASR 模型（单例模式，常驻显存）
        logger.info("[System] 加载 Whisper ASR 模型...")
        WhisperService.load_models()
        
        # 5. 启动时状态清洗：重置僵尸状态
        # 如果服务在转录过程中崩溃，数据库中的 processing 状态会变成"僵尸状态"
        # 重启后没有后台任务在跑，但前端依然显示"转录中"，用户会觉得卡死了
        logger.info("[System] 执行启动时状态清洗...")
        db = SessionLocal()
        try:
            # 查找所有 processing 状态的 Episode
            stuck_episodes = db.query(Episode).filter(
                Episode.transcription_status == "processing"
            ).all()
            
            if stuck_episodes:
                logger.warning(
                    f"[System] 发现 {len(stuck_episodes)} 个僵尸状态的 Episode，正在重置为 failed"
                )
                for episode in stuck_episodes:
                    episode.transcription_status = "failed"
                    logger.info(
                        f"[System] Episode {episode.id} ({episode.title}) 状态已重置为 failed"
                    )
                db.commit()
                logger.info(f"[System] 已重置 {len(stuck_episodes)} 个 Episode 的状态")
            else:
                logger.info("[System] 未发现僵尸状态的 Episode")
        except Exception as e:
            error_msg = str(e)
            if "no such column" in error_msg.lower() or "transcription_status" in error_msg:
                logger.error(
                    "[System] 数据库结构不匹配！请删除 backend/data/podflow.db 文件后重新启动服务，"
                    "系统会自动创建新的数据库结构。"
                )
                logger.error(f"[System] 错误详情: {error_msg}")
            else:
                logger.error(f"[System] 启动时状态清洗失败: {e}", exc_info=True)
            db.rollback()
            # 注意：状态清洗失败不应该阻止服务启动，只记录错误
        finally:
            db.close()
        
        logger.info("[System] 初始化完成，服务就绪")
    except Exception as e:
        logger.error(f"[System] 初始化失败: {e}", exc_info=True)
        raise RuntimeError(f"应用启动失败: {e}") from e
    
    yield
    
    # 关闭后：清理资源（可选）
    logger.info("[System] 服务关闭，清理资源...")
    # 注意：WhisperService 是单例，模型常驻显存，这里可以选择不释放
    # 如果需要释放，可以调用 WhisperService.release_models()（如果实现了）


app = FastAPI(
    title="PodFlow API",
    description="Local-First, AI-powered podcast learning tool",
    version="1.0.0",
    lifespan=lifespan
)

# 注册 API 路由
app.include_router(api_router, prefix="/api")

# 添加静态文件服务（用于前端访问音频文件）
# 将音频文件目录挂载到 /static/audio 路径
# 注意：路径需要相对于 backend 目录解析（因为 AUDIO_STORAGE_PATH 是相对路径）
backend_dir = Path(__file__).parent.parent  # backend/app/main.py -> backend/
audio_storage_relative = AUDIO_STORAGE_PATH.lstrip('./')  # "./data/audios/" -> "data/audios"
audio_storage_path = (backend_dir / audio_storage_relative).resolve()
audio_storage_path.mkdir(parents=True, exist_ok=True)
logger.info(f"[System] 静态文件服务路径: {audio_storage_path}")
app.mount("/static/audio", StaticFiles(directory=str(audio_storage_path)), name="audio")

# 添加示例音频目录的静态文件服务
sample_audio_path = (backend_dir / "data" / "sample_audio").resolve()
sample_audio_path.mkdir(parents=True, exist_ok=True)
logger.info(f"[System] 示例音频静态文件服务路径: {sample_audio_path}")
app.mount("/static/sample_audio", StaticFiles(directory=str(sample_audio_path)), name="sample_audio")

# 允许前端跨域访问
# 注意：对于本地工具（Local-First）来说，允许所有来源是安全的
# 如果部署到公网，建议收紧此权限，指定具体的允许来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发模式允许所有
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """根路径，健康检查"""
    return {
        "message": "PodFlow 后端连接成功！Whisper 引擎就绪。",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """
    健康检查接口
    
    返回服务状态和模型加载信息。
    """
    try:
        device_info = WhisperService.get_device_info()
        return {
            "status": "healthy",
            "whisper_service": {
                "asr_model_loaded": device_info.get("asr_model_loaded", False),
                "device": device_info.get("device", "unknown"),
                "cuda_available": device_info.get("cuda_available", False),
                "vram_info": {
                    "allocated": device_info.get("vram_allocated", "N/A"),
                    "total": device_info.get("vram_total", "N/A"),
                    "free": device_info.get("vram_free", "N/A"),
                    "percent": device_info.get("vram_percent", "N/A")
                }
            }
        }
    except Exception as e:
        logger.error(f"[HealthCheck] 健康检查失败: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "error": str(e)
        }


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)