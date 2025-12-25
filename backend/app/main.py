"""
PodFlow FastAPI 应用入口

使用 lifespan 管理模型生命周期，支持后台任务异步转录。
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import uvicorn

from app.utils.hardware_patch import apply_rtx5070_patches
from app.services.whisper_service import WhisperService
from app.services.transcription_service import TranscriptionService
from app.models import SessionLocal, get_db, Episode

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
        # 1. 应用硬件兼容性补丁（必须在导入 whisperx 之前）
        logger.info("[System] 应用硬件兼容性补丁...")
        apply_rtx5070_patches()
        
        # 2. 加载 Whisper ASR 模型（单例模式，常驻显存）
        logger.info("[System] 加载 Whisper ASR 模型...")
        WhisperService.load_models()
        
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

# 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发模式允许所有
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def run_transcription_task(episode_id: int):
    """
    后台转录任务函数
    
    注意：此函数在后台任务中运行，必须创建新的数据库 Session。
    不能使用请求的 Session（Request-Scoped），因为请求结束后 Session 会被关闭。
    
    参数:
        episode_id: Episode ID
    """
    # 手动创建新的数据库会话（后台任务专用）
    db = SessionLocal()
    try:
        # 获取 WhisperService 单例
        whisper_service = WhisperService.get_instance()
        
        # 创建 TranscriptionService
        transcription_service = TranscriptionService(db, whisper_service)
        
        # 执行转录
        transcription_service.segment_and_transcribe(episode_id)
        
        logger.info(f"[BackgroundTask] Episode {episode_id} 转录任务完成")
    except Exception as e:
        logger.error(
            f"[BackgroundTask] Episode {episode_id} 转录任务失败: {e}",
            exc_info=True
        )
        # 更新 Episode 状态为 failed
        try:
            episode = db.query(Episode).filter(Episode.id == episode_id).first()
            if episode:
                episode.transcription_status = "failed"
                db.commit()
        except Exception as commit_error:
            logger.error(
                f"[BackgroundTask] 更新 Episode {episode_id} 状态失败: {commit_error}",
                exc_info=True
            )
    finally:
        # 确保关闭数据库会话
        db.close()


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


@app.post("/api/episodes/{episode_id}/transcribe")
async def start_transcription(
    episode_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    启动转录任务（异步）
    
    参数:
        episode_id: Episode ID
        
    返回:
        dict: 任务状态信息
        
    注意：
        - 此接口立即返回，转录在后台执行
        - 使用 BackgroundTasks 处理异步转录
        - 后台任务会创建新的数据库 Session
    """
    # 验证 Episode 是否存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 检查是否已有转录任务在进行
    if episode.transcription_status == "processing":
        return {
            "status": "already_processing",
            "message": f"Episode {episode_id} 正在转录中",
            "episode_id": episode_id
        }
    
    # 检查音频文件是否存在
    if not episode.audio_path:
        raise HTTPException(
            status_code=400,
            detail=f"Episode {episode_id} 没有音频文件路径"
        )
    
    # 添加后台任务（传递 ID 而不是对象，让后台任务自己去查库）
    background_tasks.add_task(run_transcription_task, episode_id)
    
    logger.info(f"[API] 已启动 Episode {episode_id} 的转录任务")
    
    return {
        "status": "processing",
        "message": f"Episode {episode_id} 转录任务已启动",
        "episode_id": episode_id
    }


@app.get("/api/episodes/{episode_id}/transcription-status")
def get_transcription_status(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    获取转录状态
    
    参数:
        episode_id: Episode ID
        
    返回:
        dict: 转录状态和进度信息
    """
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    return {
        "episode_id": episode_id,
        "transcription_status": episode.transcription_status,
        "transcription_status_display": episode.transcription_status_display,
        "transcription_progress": episode.transcription_progress,
        "transcription_stats": episode.transcription_stats,
        "estimated_time_remaining": episode.estimated_time_remaining
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)