"""
PodFlow FastAPI 应用入口

使用 lifespan 管理模型生命周期，支持后台任务异步转录。
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
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

# 允许前端跨域访问
# 注意：CORS 中间件必须在路由注册之前添加，才能正确处理 OPTIONS 预检请求
# 当 allow_origins=["*"] 时，不能同时设置 allow_credentials=True
# 因此明确指定开发环境的前端地址
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite 开发服务器
        "http://127.0.0.1:5173",  # Vite 开发服务器（IP 形式）
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局异常处理器：确保所有错误响应都包含 CORS 头
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    全局异常处理器
    
    确保所有异常响应都包含 CORS 头，避免浏览器 CORS 错误
    """
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse
    
    # 如果是 HTTPException，使用其状态码和详情
    if isinstance(exc, HTTPException):
        status_code = exc.status_code
        detail = exc.detail
    else:
        # 其他异常统一返回 500
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        detail = str(exc) if logger.level <= logging.DEBUG else "Internal server error"
        logger.error(f"未处理的异常: {exc}", exc_info=True)
    
    # 创建响应，CORS 中间件会自动添加 CORS 头
    response = JSONResponse(
        status_code=status_code,
        content={"detail": detail}
    )
    
    # 手动添加 CORS 头（确保即使中间件失效也能工作）
    origin = request.headers.get("origin")
    if origin and origin in ["http://localhost:5173", "http://127.0.0.1:5173"]:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

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