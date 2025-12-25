"""
后台任务模块

提供异步后台任务函数，用于处理耗时操作（如音频转录）。
避免在 API 路由中直接定义任务函数，解决循环导入问题。
"""
import logging
from app.services.whisper_service import WhisperService
from app.services.transcription_service import TranscriptionService
from app.models import SessionLocal, Episode

logger = logging.getLogger(__name__)


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

