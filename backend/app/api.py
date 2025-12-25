"""
Episode 管理 API 路由

提供文件上传、查询、转录状态等接口。
"""
import os
import shutil
import tempfile
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import get_db, Episode, TranscriptCue, AudioSegment
from app.config import AUDIO_STORAGE_PATH, DEFAULT_LANGUAGE
from app.utils.file_utils import (
    calculate_md5_async,
    get_audio_duration,
    validate_audio_file,
    get_file_extension,
    is_valid_audio_header,
)
from app.tasks import run_transcription_task

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== 文件上传 ====================

@router.post("/episodes/upload")
async def upload_episode(
    file: UploadFile = File(...),
    title: str = Form(...),
    podcast_id: Optional[int] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """
    上传音频文件，创建 Episode，触发异步转录
    
    流程：
    1. 验证文件格式和大小
    2. 保存文件到临时路径
    3. 异步计算 MD5（不阻塞）
    4. 检查是否已存在（file_hash 去重）
    5. 如果不存在：保存到最终路径、获取音频时长、创建 Episode
    6. 触发异步转录
    
    参数:
        file: 音频文件（multipart/form-data）
        title: 单集标题
        podcast_id: 播客 ID（可选，本地音频时为 None）
        background_tasks: FastAPI 后台任务管理器
        
    返回:
        {
            "episode_id": 1,
            "status": "processing",
            "is_duplicate": false
        }
    """
    try:
        # Step 1: 验证文件格式、大小 + 内容真伪校验
        file_size = 0
        # 读取文件大小（需要先保存到临时文件才能获取准确大小）
        temp_file = None
        try:
            # 创建临时文件
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=get_file_extension(file.filename))
            shutil.copyfileobj(file.file, temp_file)
            temp_file.close()  # 必须先关闭才能读取或移动
            
            # 获取文件大小
            file_size = os.path.getsize(temp_file.name)
            
            # A. 基础验证（文件名扩展名和大小）
            is_valid, error_msg = validate_audio_file(file.filename, file_size)
            if not is_valid:
                os.unlink(temp_file.name)
                raise HTTPException(status_code=400, detail=error_msg)
            
            # B. 内容头部校验（防止 HTML/JSON/文本伪装成 MP3）
            if not is_valid_audio_header(temp_file.name):
                os.unlink(temp_file.name)
                raise HTTPException(
                    status_code=400, 
                    detail="文件内容异常：这看起来像是一个文本文件而不是音频文件。请确保上传的是真实的音频文件。"
                )
        except HTTPException:
            # 如果是校验抛出的异常，先删临时文件再抛出
            if temp_file and os.path.exists(temp_file.name):
                os.unlink(temp_file.name)
            raise
        except Exception as e:
            if temp_file and os.path.exists(temp_file.name):
                os.unlink(temp_file.name)
            logger.error(f"文件验证失败: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"文件处理失败: {str(e)}")
        
        # Step 2: 异步计算 MD5（不阻塞主线程）
        try:
            file_hash = await calculate_md5_async(temp_file.name)
        except Exception as e:
            os.unlink(temp_file.name)
            logger.error(f"MD5 计算失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"MD5 计算失败: {str(e)}")
        
        # Step 3: 检查是否已存在（文件去重）
        existing_episode = db.query(Episode).filter(Episode.file_hash == file_hash).first()
        if existing_episode:
            # 文件已存在，删除临时文件，返回已有 Episode
            os.unlink(temp_file.name)
            logger.info(f"文件已存在，返回已有 Episode: {existing_episode.id} (hash: {file_hash})")
            return {
                "episode_id": existing_episode.id,
                "status": existing_episode.transcription_status,
                "is_duplicate": True,
                "message": "文件已存在，返回已有 Episode"
            }
        
        # Step 4: 保存到最终路径
        # 确保存储目录存在
        storage_path = Path(AUDIO_STORAGE_PATH)
        storage_path.mkdir(parents=True, exist_ok=True)
        
        # 使用 file_hash 作为文件名（保持扩展名）
        file_ext = get_file_extension(file.filename)
        final_path = storage_path / f"{file_hash}{file_ext}"
        
        try:
            # 移动到最终路径
            shutil.move(temp_file.name, str(final_path))
            logger.info(f"文件已保存: {final_path}")
        except Exception as e:
            # 如果移动失败，尝试删除临时文件
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)
            logger.error(f"保存文件失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"保存文件失败: {str(e)}")
        
        # Step 5: 获取音频时长
        try:
            duration = get_audio_duration(str(final_path))
        except Exception as e:
            # 如果获取时长失败，删除已保存的文件
            if os.path.exists(final_path):
                os.unlink(final_path)
            logger.error(f"获取音频时长失败: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"无法解析音频文件: {str(e)}")
        
        # Step 6: 创建 Episode
        try:
            episode = Episode(
                podcast_id=podcast_id,
                title=title,
                original_filename=file.filename,
                audio_path=str(final_path),
                file_hash=file_hash,
                file_size=file_size,
                duration=duration,
                language=DEFAULT_LANGUAGE,
                transcription_status="pending"
            )
            db.add(episode)
            db.commit()
            db.refresh(episode)
            
            logger.info(f"Episode 已创建: {episode.id} (title: {title}, duration: {duration:.2f}s)")
        except Exception as e:
            # 如果创建失败，删除已保存的文件
            if os.path.exists(final_path):
                os.unlink(final_path)
            db.rollback()
            logger.error(f"创建 Episode 失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"创建 Episode 失败: {str(e)}")
        
        # Step 7: 触发异步转录
        try:
            background_tasks.add_task(run_transcription_task, episode.id)
            episode.transcription_status = "processing"
            db.commit()
            logger.info(f"已启动转录任务: Episode {episode.id}")
        except Exception as e:
            logger.error(f"启动转录任务失败: {e}", exc_info=True)
            # 注意：即使转录任务启动失败，Episode 已创建，不抛出异常
        
        return {
            "episode_id": episode.id,
            "status": "processing",
            "is_duplicate": False,
            "message": "文件上传成功，转录任务已启动"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传文件时发生未知错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


# ==================== Episode 查询 ====================

@router.get("/episodes")
def get_episodes(
    page: int = Query(1, ge=1, description="页码（从 1 开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量（1-100）"),
    podcast_id: Optional[int] = Query(None, description="播客 ID（过滤）"),
    status: Optional[str] = Query(None, description="转录状态（pending/processing/completed/failed）"),
    db: Session = Depends(get_db)
):
    """
    获取 Episode 列表（支持分页和过滤）
    
    参数:
        page: 页码（从 1 开始）
        limit: 每页数量（1-100）
        podcast_id: 播客 ID（可选，过滤）
        status: 转录状态（可选，过滤）
        
    返回:
        {
            "items": [...],
            "total": 50,
            "page": 1,
            "pages": 3
        }
    """
    # 构建查询
    query = db.query(Episode)
    
    # 应用过滤
    if podcast_id is not None:
        query = query.filter(Episode.podcast_id == podcast_id)
    
    if status is not None:
        query = query.filter(Episode.transcription_status == status)
    
    # 获取总数
    total = query.count()
    
    # 分页
    offset = (page - 1) * limit
    episodes = query.order_by(Episode.created_at.desc()).offset(offset).limit(limit).all()
    
    # 计算总页数
    pages = (total + limit - 1) // limit if total > 0 else 0
    
    # 序列化
    items = [
        {
            "id": ep.id,
            "title": ep.title,
            "duration": ep.duration,
            "file_size": ep.file_size,
            "transcription_status": ep.transcription_status,
            "transcription_progress": ep.transcription_progress,
            "created_at": ep.created_at.isoformat() if ep.created_at else None,
            "podcast_id": ep.podcast_id,
        }
        for ep in episodes
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit
    }


@router.get("/episodes/{episode_id}")
def get_episode_detail(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    获取单集详情（包含所有 TranscriptCue）
    
    参数:
        episode_id: Episode ID
        
    返回:
        {
            "id": 1,
            "title": "...",
            "duration": 1800,
            "transcription_status": "completed",
            "cues": [...]
        }
    """
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 获取所有字幕（按时间排序）
    cues = db.query(TranscriptCue).filter(
        TranscriptCue.episode_id == episode_id
    ).order_by(TranscriptCue.start_time.asc()).all()
    
    # 序列化
    cues_data = [
        {
            "id": cue.id,
            "start_time": cue.start_time,
            "end_time": cue.end_time,
            "speaker": cue.speaker,
            "text": cue.text
        }
        for cue in cues
    ]
    
    return {
        "id": episode.id,
        "title": episode.title,
        "duration": episode.duration,
        "file_size": episode.file_size,
        "transcription_status": episode.transcription_status,
        "transcription_progress": episode.transcription_progress,
        "transcription_status_display": episode.transcription_status_display,
        "created_at": episode.created_at.isoformat() if episode.created_at else None,
        "podcast_id": episode.podcast_id,
        "cues": cues_data,
        "cues_count": len(cues_data)
    }


@router.get("/episodes/{episode_id}/status")
def get_episode_status(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    查询转录状态（用于前端轮询）
    
    参数:
        episode_id: Episode ID
        
    返回:
        {
            "episode_id": 1,
            "transcription_status": "processing",
            "transcription_status_display": "正在转录中...",
            "transcription_progress": 45.5,
            "transcription_stats": {
                "total_segments": 11,
                "completed_segments": 5,
                "failed_segments": 0,
                "processing_segments": 2,
                "pending_segments": 4
            },
            "estimated_time_remaining": 90
        }
    """
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 获取分段统计
    stats = episode.transcription_stats
    
    return {
        "episode_id": episode.id,
        "transcription_status": episode.transcription_status,
        "transcription_status_display": episode.transcription_status_display,
        "transcription_progress": episode.transcription_progress,
        "transcription_stats": stats,
        "estimated_time_remaining": episode.estimated_time_remaining
    }


@router.get("/episodes/{episode_id}/segments")
def get_episode_segments(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    获取虚拟分段信息（用于调试）
    
    参数:
        episode_id: Episode ID
        
    返回:
        [
            {
                "segment_id": "segment_001",
                "status": "completed",
                "cue_count": 15,
                "start_time": 0.0,
                "end_time": 180.0
            },
            ...
        ]
    """
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 获取所有分段（按 segment_index 排序）
    segments = db.query(AudioSegment).filter(
        AudioSegment.episode_id == episode_id
    ).order_by(AudioSegment.segment_index.asc()).all()
    
    # 序列化
    segments_data = []
    for seg in segments:
        # 统计该分段的 cue 数量
        cue_count = db.query(func.count(TranscriptCue.id)).filter(
            TranscriptCue.segment_id == seg.id
        ).scalar() or 0
        
        segments_data.append({
            "segment_id": seg.segment_id,
            "segment_index": seg.segment_index,
            "status": seg.status,
            "cue_count": cue_count,
            "start_time": seg.start_time,
            "end_time": seg.end_time,
            "retry_count": seg.retry_count,
            "error_message": seg.error_message if seg.status == "failed" else None
        })
    
    return segments_data


# ==================== 转录任务管理 ====================

@router.post("/episodes/{episode_id}/transcribe")
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


