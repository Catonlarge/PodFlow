"""
Episode 管理 API 路由

提供文件上传、查询、转录状态等接口。
"""
import os
import shutil
import tempfile
import logging
import re
from pathlib import Path
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import get_db, Episode, TranscriptCue, AudioSegment, Highlight, Note, AIQueryRecord
from app.config import AUDIO_STORAGE_PATH, DEFAULT_LANGUAGE, DEFAULT_AI_PROVIDER
from app.utils.file_utils import (
    calculate_md5_async,
    get_audio_duration,
    validate_audio_file,
    get_file_extension,
    is_valid_audio_header,
)
from app.tasks import run_transcription_task
from app.services.ai_service import AIService

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

# 注意：check-subtitle 路由必须在 {episode_id} 路由之前，否则会被匹配为 episode_id
@router.get("/episodes/check-subtitle")
def check_subtitle_by_hash(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    根据文件 MD5 hash 检查是否存在历史字幕
    
    参数:
        file_hash: 音频文件 MD5 hash（32位十六进制字符串，通过查询参数传递）
    
    返回:
        {
            "exists": true,
            "episode_id": 1,
            "transcript_path": "backend/data/transcripts/abc123.json"
        }
        或
        {
            "exists": false
        }
    """
    # 直接从查询参数获取 file_hash
    file_hash = request.query_params.get("file_hash")
    
    # 调试日志：记录接收到的参数
    logger.info(f"[check-subtitle] 接收到 file_hash: {repr(file_hash)}, 类型: {type(file_hash)}, 长度: {len(file_hash) if file_hash else 0}")
    logger.info(f"[check-subtitle] 所有查询参数: {dict(request.query_params)}")
    
    # 临时：先不验证，直接返回 exists: false，用于调试
    # TODO: 恢复验证逻辑
    if not file_hash:
        logger.warning(f"[check-subtitle] file_hash 为空，返回 exists: false")
        return {"exists": False}
    
    # 转换为小写
    file_hash_lower = file_hash.lower()
    logger.info(f"[check-subtitle] 转换为小写后: {repr(file_hash_lower)}, 长度: {len(file_hash_lower)}")
    
    # 基本验证：只检查长度，不检查格式
    if len(file_hash_lower) != 32:
        logger.warning(f"[check-subtitle] file_hash 长度不正确: {len(file_hash_lower)}, 期望: 32，返回 exists: false")
        return {"exists": False}
    
    # 使用小写版本进行查询（数据库中的 hash 通常是小写）
    file_hash = file_hash_lower
    episode = db.query(Episode).filter(Episode.file_hash == file_hash).first()
    if episode and episode.transcription_status == "completed":
        # 检查是否有字幕数据
        cues_count = db.query(func.count(TranscriptCue.id)).filter(
            TranscriptCue.episode_id == episode.id
        ).scalar() or 0
        
        if cues_count > 0:
            # 构建字幕文件路径（从 audio_path 推导）
            transcript_path = None
            if episode.audio_path:
                # 将 audio_path 中的 "audios" 替换为 "transcripts"，扩展名改为 .json
                transcript_path = episode.audio_path.replace("audios", "transcripts").replace(".mp3", ".json").replace(".wav", ".json")
            
            return {
                "exists": True,
                "episode_id": episode.id,
                "transcript_path": transcript_path
            }
    
    return {"exists": False}


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
        "audio_path": episode.audio_path,  # 添加音频路径
        "transcription_status": episode.transcription_status,
        "transcription_progress": episode.transcription_progress,
        "transcription_status_display": episode.transcription_status_display,
        "created_at": episode.created_at.isoformat() if episode.created_at else None,
        "podcast_id": episode.podcast_id,
        "show_name": episode.show_name,  # 添加节目名称（动态属性）
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
    获取 Episode 的所有 segment 状态信息
    
    用于前端滚动触发异步加载时检查下一个segment的状态
    
    参数:
        episode_id: Episode ID
        
    返回:
        {
            "segments": [
                {
                    "segment_index": 0,
                    "segment_id": "segment_001",
                    "status": "completed",
                    "start_time": 0.0,
                    "end_time": 180.0,
                    "duration": 180.0,
                    "retry_count": 0,
                    "error_message": null
                },
                {
                    "segment_index": 1,
                    "segment_id": "segment_002",
                    "status": "processing",
                    "start_time": 180.0,
                    "end_time": 360.0,
                    "duration": 180.0,
                    "retry_count": 0,
                    "error_message": null
                }
            ]
        }
    """
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 获取所有segments，按segment_index排序
    segments = db.query(AudioSegment).filter(
        AudioSegment.episode_id == episode_id
    ).order_by(AudioSegment.segment_index).all()
    
    segments_data = []
    for seg in segments:
        segments_data.append({
            "segment_index": seg.segment_index,
            "segment_id": seg.segment_id,
            "status": seg.status,
            "start_time": seg.start_time,
            "end_time": seg.end_time,
            "duration": seg.duration,
            "retry_count": seg.retry_count,
            "error_message": seg.error_message
        })
    
    return {
        "segments": segments_data
    }


@router.post("/episodes/{episode_id}/segments/{segment_index}/transcribe")
async def trigger_segment_transcription(
    episode_id: int,
    segment_index: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    手动触发指定 segment 的识别任务
    
    用于恢复失败或未开始的 segment，或用户滚动时触发异步识别
    
    参数:
        episode_id: Episode ID
        segment_index: Segment 索引（从 0 开始）
        
    返回:
        {
            "message": "Segment 识别任务已启动",
            "episode_id": 1,
            "segment_index": 1,
            "segment_id": "segment_002"
        }
    """
    # 验证 Episode 是否存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 查找指定的 segment
    segment = db.query(AudioSegment).filter(
        AudioSegment.episode_id == episode_id,
        AudioSegment.segment_index == segment_index
    ).first()
    
    if not segment:
        raise HTTPException(
            status_code=404,
            detail=f"Episode {episode_id} 的 Segment {segment_index} 不存在"
        )
    
    # 检查 segment 状态
    if segment.status == "completed":
        return {
            "message": "Segment 已完成识别",
            "episode_id": episode_id,
            "segment_index": segment_index,
            "segment_id": segment.segment_id,
            "status": "completed"
        }
    
    if segment.status == "processing":
        return {
            "message": "Segment 正在识别中",
            "episode_id": episode_id,
            "segment_index": segment_index,
            "segment_id": segment.segment_id,
            "status": "processing"
        }
    
    # 检查重试次数
    if segment.status == "failed" and segment.retry_count >= 3:
        raise HTTPException(
            status_code=400,
            detail=f"Segment {segment.segment_id} 已达到最大重试次数（3次），无法继续识别"
        )
    
    # 检查音频文件是否存在
    if not episode.audio_path:
        raise HTTPException(
            status_code=400,
            detail=f"Episode {episode_id} 没有音频文件路径"
        )
    
    # 启动后台识别任务
    from app.tasks import run_segment_transcription_task
    background_tasks.add_task(
        run_segment_transcription_task,
        episode_id,
        segment_index
    )
    
    # 更新 segment 状态为 processing
    segment.status = "processing"
    if segment.transcription_started_at is None:
        from datetime import datetime
        segment.transcription_started_at = datetime.utcnow()
    db.commit()
    
    logger.info(
        f"[API] 已启动 Segment {segment.segment_id} 的识别任务 "
        f"(Episode {episode_id}, segment_index={segment_index})"
    )
    
    return {
        "message": "Segment 识别任务已启动",
        "episode_id": episode_id,
        "segment_index": segment_index,
        "segment_id": segment.segment_id
    }


@router.post("/episodes/{episode_id}/segments/recover")
async def recover_incomplete_segments(
    episode_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    检查并启动未完成的 segment 识别任务
    
    用于页面加载时恢复失败或未开始的 segment
    
    参数:
        episode_id: Episode ID
        
    返回:
        {
            "message": "已启动 X 个未完成 segment 的识别任务",
            "episode_id": 1,
            "recovered_segments": [
                {"segment_index": 1, "segment_id": "segment_002", "status": "pending"},
                {"segment_index": 2, "segment_id": "segment_003", "status": "failed", "retry_count": 1}
            ]
        }
    """
    # 验证 Episode 是否存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 查找未完成的 segments
    incomplete_segments = db.query(AudioSegment).filter(
        AudioSegment.episode_id == episode_id
    ).filter(
        (AudioSegment.status == "pending") |
        ((AudioSegment.status == "failed") & (AudioSegment.retry_count < 3))
    ).order_by(AudioSegment.segment_index).all()
    
    if not incomplete_segments:
        return {
            "message": "没有需要恢复的 segment",
            "episode_id": episode_id,
            "recovered_segments": []
        }
    
    # 启动后台识别任务
    from app.tasks import run_segment_transcription_task
    recovered_segments = []
    
    for segment in incomplete_segments:
        # 启动识别任务
        background_tasks.add_task(
            run_segment_transcription_task,
            episode_id,
            segment.segment_index
        )
        
        # 更新 segment 状态为 processing
        segment.status = "processing"
        if segment.transcription_started_at is None:
            from datetime import datetime
            segment.transcription_started_at = datetime.utcnow()
        
        recovered_segments.append({
            "segment_index": segment.segment_index,
            "segment_id": segment.segment_id,
            "status": segment.status,
            "retry_count": segment.retry_count
        })
    
    db.commit()
    
    logger.info(
        f"[API] 已启动 {len(recovered_segments)} 个未完成 segment 的识别任务 "
        f"(Episode {episode_id})"
    )
    
    return {
        "message": f"已启动 {len(recovered_segments)} 个未完成 segment 的识别任务",
        "episode_id": episode_id,
        "recovered_segments": recovered_segments
    }


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


@router.post("/episodes/{episode_id}/transcribe/cancel")
async def cancel_transcription(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    取消转录任务
    
    根据PRD c.i：点击暂停按钮，字幕识别被取消（注意这是取消，意味着通知后端删除任务）
    
    参数:
        episode_id: Episode ID
        
    返回:
        dict: 取消状态信息
        
    注意：
        - 此接口将转录状态设置为 'pending'，停止正在进行的转录
        - 由于 BackgroundTasks 无法直接取消，这里通过设置状态来标记取消
        - 后续的转录任务会检查状态，如果为 'pending' 则不会继续
    """
    # 验证 Episode 是否存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 如果正在转录，将状态设置为 pending（标记为取消）
    if episode.transcription_status == "processing":
        episode.transcription_status = "pending"
        db.commit()
        logger.info(f"[API] 已取消 Episode {episode_id} 的转录任务")
        
        return {
            "status": "cancelled",
            "message": f"Episode {episode_id} 转录任务已取消",
            "episode_id": episode_id
        }
    
    # 如果不在转录中，返回当前状态
    return {
        "status": episode.transcription_status,
        "message": f"Episode {episode_id} 当前状态为 {episode.transcription_status}",
        "episode_id": episode_id
    }


@router.post("/episodes/{episode_id}/transcribe/test-fail")
async def test_transcription_fail(
    episode_id: int,
    error_type: Optional[str] = Query("model", description="错误类型: network, model, file, memory"),
    db: Session = Depends(get_db)
):
    """
    测试端点：模拟转录失败场景
    
    用于测试转录失败时的错误提示和重试按钮功能
    
    参数:
        episode_id: Episode ID
        error_type: 错误类型
            - "network": 网络错误
            - "model": 模型错误（默认）
            - "file": 文件错误
            - "memory": 内存错误
    
    返回:
        dict: 测试结果信息
    """
    # 验证 Episode 是否存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 根据错误类型生成错误信息
    error_messages = {
        "network": "Connection timeout: Failed to connect to transcription service after 30 seconds. Network error occurred.",
        "model": "Model initialization failed: Whisper model could not be loaded. RuntimeError: Model file corrupted or missing.",
        "file": "FFmpeg error: Unable to extract audio segment. File format not supported or corrupted audio file.",
        "memory": "Out of memory: Insufficient memory to process audio transcription. System requires at least 8GB RAM."
    }
    
    error_message = error_messages.get(error_type, error_messages["model"])
    
    # 设置 Episode 状态为 failed
    episode.transcription_status = "failed"
    
    # 检查是否存在 segments，如果不存在则创建一个失败的 segment
    segments = db.query(AudioSegment).filter(
        AudioSegment.episode_id == episode_id
    ).all()
    
    if not segments:
        # 如果没有 segments，创建一个失败的 segment
        from datetime import datetime
        segment = AudioSegment(
            episode_id=episode_id,
            segment_index=0,
            segment_id=f"segment_{episode_id}_001",
            start_time=0.0,
            end_time=min(episode.duration, 180.0) if episode.duration else 180.0,
            status="failed",
            error_message=error_message,
            retry_count=0,
            transcription_started_at=datetime.utcnow()
        )
        db.add(segment)
    else:
        # 如果已有 segments，将第一个 segment 设置为失败
        first_segment = min(segments, key=lambda s: s.segment_index)
        first_segment.status = "failed"
        first_segment.error_message = error_message
        first_segment.retry_count = 0
        if first_segment.transcription_started_at is None:
            from datetime import datetime
            first_segment.transcription_started_at = datetime.utcnow()
    
    db.commit()
    
    logger.info(f"[TEST] 已设置 Episode {episode_id} 为失败状态（错误类型: {error_type}）")
    
    return {
        "status": "failed",
        "message": f"Episode {episode_id} 已设置为失败状态（测试模式）",
        "episode_id": episode_id,
        "error_type": error_type,
        "error_message": error_message
    }


# ==================== Episode 删除 ====================

@router.delete("/episodes/{episode_id}")
def delete_episode(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    删除 Episode 及其关联数据
    
    删除内容：
    1. Episode 记录
    2. 关联的 AudioSegment（级联删除）
    3. 关联的 TranscriptCue（级联删除）
    4. 关联的 Highlight 和 Note（级联删除）
    5. 音频文件（如果存在且没有其他 Episode 使用相同的 file_hash）
    
    参数:
        episode_id: Episode ID
        
    返回:
        {
            "message": "Episode 已删除",
            "episode_id": 1
        }
    """
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 保存音频文件路径和 file_hash，用于后续判断是否删除文件
    audio_path = episode.audio_path
    file_hash = episode.file_hash
    
    # 删除 Episode（级联删除会自动处理关联的 AudioSegment、TranscriptCue 等）
    db.delete(episode)
    db.commit()
    
    # 检查是否有其他 Episode 使用相同的 file_hash
    # 如果没有，删除音频文件
    if audio_path and file_hash:
        other_episode = db.query(Episode).filter(
            Episode.file_hash == file_hash,
            Episode.id != episode_id
        ).first()
        
        if not other_episode and os.path.exists(audio_path):
            try:
                os.unlink(audio_path)
                logger.info(f"已删除音频文件: {audio_path}")
            except Exception as e:
                logger.warning(f"删除音频文件失败: {audio_path}, 错误: {e}")
    
    logger.info(f"Episode {episode_id} 已删除")
    
    return {
        "message": f"Episode {episode_id} 已删除",
        "episode_id": episode_id
    }


# ==================== 历史字幕检查 ====================
# 注意：check-subtitle 路由已移到 /episodes 路由之前，避免被 {episode_id} 路由匹配


# ==================== Highlight 管理 ====================

class HighlightCreateItem(BaseModel):
    """单个划线创建项"""
    cue_id: int
    start_offset: int = Field(ge=0, description="在 cue 内的字符起始位置（从 0 开始）")
    end_offset: int = Field(gt=0, description="在 cue 内的字符结束位置")
    highlighted_text: str = Field(min_length=1, description="被划线的文本内容")
    color: str = Field(default="#9C27B0", description="划线颜色（默认紫色）")
    
    @validator('end_offset')
    def validate_offsets(cls, v, values):
        """验证 end_offset 必须大于 start_offset"""
        if 'start_offset' in values and v <= values['start_offset']:
            raise ValueError('end_offset must be greater than start_offset')
        return v


class HighlightsCreateRequest(BaseModel):
    """创建划线请求"""
    episode_id: int
    highlights: List[HighlightCreateItem]
    highlight_group_id: Optional[str] = Field(None, description="分组 ID（跨 cue 划线时使用）")


@router.post("/highlights")
async def create_highlights(
    request: HighlightsCreateRequest,
    db: Session = Depends(get_db)
):
    """
    创建划线（前端已拆分，后端接收数组）
    
    支持单 cue 划线和跨 cue 划线（通过分组管理实现）。
    
    参数:
        request: 创建划线请求（包含 episode_id、highlights 数组、可选的 highlight_group_id）
    
    返回:
        {
            "success": true,
            "highlight_ids": [1, 2],
            "highlight_group_id": "uuid-12345",
            "created_at": "2025-01-01T00:00:00Z"
        }
    """
    # 验证 episode_id 存在
    episode = db.query(Episode).filter(Episode.id == request.episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {request.episode_id} 不存在")
    
    # 验证所有 cue_id 都属于同一个 episode_id
    cue_ids = [h.cue_id for h in request.highlights]
    cues = db.query(TranscriptCue).filter(
        TranscriptCue.id.in_(cue_ids)
    ).all()
    
    if len(cues) != len(cue_ids):
        raise HTTPException(status_code=400, detail="部分 cue_id 不存在")
    
    for cue in cues:
        if cue.episode_id != request.episode_id:
            raise HTTPException(
                status_code=400,
                detail=f"Cue {cue.id} 不属于 Episode {request.episode_id}"
            )
    
    # 验证 highlight_group_id（如果提供）
    if request.highlight_group_id:
        # 如果提供 highlight_group_id，所有 Highlight 必须使用相同的 group_id
        pass  # 前端已保证，这里只是验证一致性
    
    # 创建所有 Highlight 记录
    created_highlights = []
    for highlight_data in request.highlights:
        highlight = Highlight(
            episode_id=request.episode_id,
            cue_id=highlight_data.cue_id,
            start_offset=highlight_data.start_offset,
            end_offset=highlight_data.end_offset,
            highlighted_text=highlight_data.highlighted_text,
            color=highlight_data.color,
            highlight_group_id=request.highlight_group_id
        )
        db.add(highlight)
        created_highlights.append(highlight)
    
    db.commit()
    
    # 刷新以获取 ID
    for highlight in created_highlights:
        db.refresh(highlight)
    
    highlight_ids = [h.id for h in created_highlights]
    
    logger.info(
        f"创建了 {len(highlight_ids)} 个 Highlight "
        f"(episode_id={request.episode_id}, group_id={request.highlight_group_id})"
    )
    
    return {
        "success": True,
        "highlight_ids": highlight_ids,
        "highlight_group_id": request.highlight_group_id,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }


@router.get("/episodes/{episode_id}/highlights")
def get_highlights(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    获取某个 Episode 的所有划线
    
    参数:
        episode_id: Episode ID
    
    返回:
        [
            {
                "id": 1,
                "cue_id": 10,
                "highlighted_text": "taxonomy",
                "start_offset": 5,
                "end_offset": 13,
                "color": "#9C27B0",
                "highlight_group_id": null,
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z"
            },
            ...
        ]
    """
    # 验证 Episode 存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 查询所有 Highlight（使用索引优化）
    highlights = db.query(Highlight).filter(
        Highlight.episode_id == episode_id
    ).order_by(Highlight.created_at.asc()).all()
    
    # 序列化返回
    return [
        {
            "id": h.id,
            "cue_id": h.cue_id,
            "highlighted_text": h.highlighted_text,
            "start_offset": h.start_offset,
            "end_offset": h.end_offset,
            "color": h.color,
            "highlight_group_id": h.highlight_group_id,
            "created_at": h.created_at.isoformat() + "Z" if h.created_at else None,
            "updated_at": h.updated_at.isoformat() + "Z" if h.updated_at else None
        }
        for h in highlights
    ]


@router.delete("/highlights/{highlight_id}")
def delete_highlight(
    highlight_id: int,
    db: Session = Depends(get_db)
):
    """
    删除划线（按组删除）
    
    删除逻辑:
    - 如果 Highlight 有 highlight_group_id，删除整组（所有共享该 highlight_group_id 的 Highlight）
    - 如果 Highlight 没有 highlight_group_id（单 cue 划线），只删除当前 Highlight
    - 级联删除关联的 Note 和 AIQueryRecord（由 SQLAlchemy 关系自动处理）
    
    参数:
        highlight_id: Highlight ID
    
    返回:
        {
            "success": true,
            "deleted_highlights_count": 3,
            "deleted_notes_count": 2,
            "deleted_ai_queries_count": 1
        }
    """
    # 查找要删除的 Highlight
    highlight = db.query(Highlight).filter(Highlight.id == highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail=f"Highlight {highlight_id} 不存在")
    
    # 判断是否有 highlight_group_id，决定删除策略
    if highlight.highlight_group_id:
        # 按组删除：查找所有同组的 Highlight
        highlights_to_delete = db.query(Highlight).filter(
            Highlight.highlight_group_id == highlight.highlight_group_id
        ).all()
    else:
        # 单个删除
        highlights_to_delete = [highlight]
    
    # 统计关联的 Note 和 AIQueryRecord（在删除前统计）
    notes_count = sum(len(h.notes) for h in highlights_to_delete)
    ai_queries_count = sum(len(h.ai_queries) for h in highlights_to_delete)
    
    # 删除（级联删除由 SQLAlchemy 自动处理）
    for h in highlights_to_delete:
        db.delete(h)
    
    db.commit()
    
    logger.info(
        f"删除了 {len(highlights_to_delete)} 个 Highlight "
        f"(highlight_id={highlight_id}, group_id={highlight.highlight_group_id}, "
        f"notes={notes_count}, ai_queries={ai_queries_count})"
    )
    
    return {
        "success": True,
        "deleted_highlights_count": len(highlights_to_delete),
        "deleted_notes_count": notes_count,
        "deleted_ai_queries_count": ai_queries_count
    }


# ==================== Note API ====================

class NoteCreateRequest(BaseModel):
    """创建笔记请求"""
    episode_id: int
    highlight_id: int
    content: Optional[str] = Field(None, description="笔记内容（underline 类型时为空）")
    note_type: str = Field(..., description="笔记类型（underline/thought/ai_card）")
    origin_ai_query_id: Optional[int] = Field(None, description="AI 查询记录 ID（可选，AI 查询转笔记时提供）")


class NoteUpdateRequest(BaseModel):
    """更新笔记请求"""
    content: str = Field(..., description="新的笔记内容")


@router.post("/notes")
async def create_note(
    note_data: NoteCreateRequest,
    db: Session = Depends(get_db)
):
    """
    创建笔记
    
    支持三种笔记类型：
    - underline：纯划线（只有下划线样式，不显示笔记卡片，content 为空）
    - thought：用户想法（显示笔记卡片，用户手动输入）
    - ai_card：保存的 AI 查询结果（显示笔记卡片，来自 AI）
    
    参数:
        note_data: 创建笔记请求
    
    返回:
        {
            "id": 1,
            "created_at": "2025-01-01T00:00:00Z"
        }
    """
    # 验证 note_type 有效
    valid_note_types = ["underline", "thought", "ai_card"]
    if note_data.note_type not in valid_note_types:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 note_type: {note_data.note_type}，必须是 {valid_note_types} 之一"
        )
    
    # 验证 highlight_id 存在且属于该 episode_id
    highlight = db.query(Highlight).filter(Highlight.id == note_data.highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail=f"Highlight {note_data.highlight_id} 不存在")
    
    if highlight.episode_id != note_data.episode_id:
        raise HTTPException(
            status_code=400,
            detail=f"Highlight {note_data.highlight_id} 不属于 Episode {note_data.episode_id}"
        )
    
    # 验证 episode_id 存在
    episode = db.query(Episode).filter(Episode.id == note_data.episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {note_data.episode_id} 不存在")
    
    # 验证 underline 类型时 content 必须为空
    if note_data.note_type == "underline" and note_data.content:
        raise HTTPException(
            status_code=400,
            detail="underline 类型的笔记 content 必须为空"
        )
    
    # 如果 origin_ai_query_id 提供，验证其存在
    if note_data.origin_ai_query_id is not None:
        ai_query = db.query(AIQueryRecord).filter(AIQueryRecord.id == note_data.origin_ai_query_id).first()
        if not ai_query:
            raise HTTPException(
                status_code=404,
                detail=f"AIQueryRecord {note_data.origin_ai_query_id} 不存在"
            )
        # 验证 AIQueryRecord 属于同一个 highlight
        if ai_query.highlight_id != note_data.highlight_id:
            raise HTTPException(
                status_code=400,
                detail=f"AIQueryRecord {note_data.origin_ai_query_id} 不属于 Highlight {note_data.highlight_id}"
            )
    
    # 创建 Note 记录
    note = Note(
        episode_id=note_data.episode_id,
        highlight_id=note_data.highlight_id,
        content=note_data.content,
        note_type=note_data.note_type,
        origin_ai_query_id=note_data.origin_ai_query_id
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    
    logger.info(
        f"创建了 Note (id={note.id}, type={note.note_type}, "
        f"episode_id={note.episode_id}, highlight_id={note.highlight_id})"
    )
    
    return JSONResponse(
        status_code=201,
        content={
            "id": note.id,
            "created_at": note.created_at.isoformat() + "Z" if note.created_at else None
        }
    )


@router.put("/notes/{note_id}")
async def update_note(
    note_id: int,
    note_data: NoteUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    更新笔记内容
    
    参数:
        note_id: Note ID
        note_data: 更新笔记请求
    
    返回:
        {
            "success": true
        }
    """
    # 查找 Note
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail=f"Note {note_id} 不存在")
    
    # 更新 content（updated_at 由数据库自动更新）
    note.content = note_data.content
    db.commit()
    db.refresh(note)
    
    logger.info(f"更新了 Note (id={note_id})")
    
    return {
        "success": True
    }


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: int,
    db: Session = Depends(get_db)
):
    """
    删除笔记
    
    说明:
    - 删除 Note 不会删除 AIQueryRecord（反向关联）
    - 删除 Highlight 会级联删除关联的 Note（级联删除由数据库处理）
    
    参数:
        note_id: Note ID
    
    返回:
        {
            "success": true
        }
    """
    # 查找 Note
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail=f"Note {note_id} 不存在")
    
    # 保存 highlight_id，用于后续检查是否需要删除 highlight
    highlight_id = note.highlight_id
    
    # 删除 Note（级联删除由数据库处理）
    db.delete(note)
    db.commit()
    
    # 检查这个 highlight 是否还有其他关联的 notes
    # 如果没有其他 notes 了，删除对应的 highlight
    remaining_notes_count = db.query(Note).filter(Note.highlight_id == highlight_id).count()
    
    if remaining_notes_count == 0:
        # 没有其他 notes 了，删除对应的 highlight
        highlight = db.query(Highlight).filter(Highlight.id == highlight_id).first()
        if highlight:
            # 注意：这里只删除单个 highlight，不考虑 highlight_group_id
            # 因为同组的其他 highlight 可能有自己的 notes，不应该被删除
            db.delete(highlight)
            db.commit()
            logger.info(f"删除了 Note (id={note_id}) 和关联的 Highlight (id={highlight_id})，因为没有其他 notes")
        else:
            logger.warning(f"删除了 Note (id={note_id})，但找不到对应的 Highlight (id={highlight_id})")
    else:
        logger.info(f"删除了 Note (id={note_id})，Highlight (id={highlight_id}) 仍有 {remaining_notes_count} 个关联的 notes")
    
    return {
        "success": True
    }


@router.get("/episodes/{episode_id}/notes")
async def get_notes_by_episode(
    episode_id: int,
    db: Session = Depends(get_db)
):
    """
    获取某个 Episode 的所有笔记
    
    说明:
    - 包含所有类型的笔记（underline/thought/ai_card）
    - 前端负责过滤 underline 类型（不显示笔记卡片）
    
    参数:
        episode_id: Episode ID
    
    返回:
        [
            {
                "id": 1,
                "highlight_id": 5,
                "content": "...",
                "note_type": "thought",
                "origin_ai_query_id": null,
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z"
            },
            ...
        ]
    """
    # 验证 episode_id 存在
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} 不存在")
    
    # 查询所有 Note（按 created_at 排序）
    notes = db.query(Note).filter(
        Note.episode_id == episode_id
    ).order_by(Note.created_at.asc()).all()
    
    # 序列化返回
    return [
        {
            "id": n.id,
            "highlight_id": n.highlight_id,
            "content": n.content,
            "note_type": n.note_type,
            "origin_ai_query_id": n.origin_ai_query_id,
            "created_at": n.created_at.isoformat() + "Z" if n.created_at else None,
            "updated_at": n.updated_at.isoformat() + "Z" if n.updated_at else None
        }
        for n in notes
    ]


# ==================== AI 查询 ====================

class AIQueryRequest(BaseModel):
    """AI 查询请求模型"""
    highlight_id: int = Field(..., description="划线 ID")
    provider: Optional[str] = Field(None, description="AI 提供商（可选，默认从 config 获取）")


def build_context_text(highlight: Highlight, db: Session) -> Optional[str]:
    """
    构建相邻 2-3 个 TranscriptCue 的文本作为上下文
    
    Args:
        highlight: Highlight 对象
        db: 数据库会话
    
    Returns:
        str: 上下文文本（相邻 cue 的文本拼接），如果没有上下文则返回 None
    """
    # 获取当前 cue
    current_cue = db.query(TranscriptCue).filter(TranscriptCue.id == highlight.cue_id).first()
    if not current_cue:
        return None
    
    # 获取同一 episode 的所有 cues，按 start_time 排序
    all_cues = db.query(TranscriptCue).filter(
        TranscriptCue.episode_id == highlight.episode_id
    ).order_by(TranscriptCue.start_time.asc()).all()
    
    # 找到当前 cue 的索引
    current_index = None
    for i, cue in enumerate(all_cues):
        if cue.id == current_cue.id:
            current_index = i
            break
    
    if current_index is None:
        return None
    
    # 获取前后各 1-2 个 cue（优先取 2 个，如果不够则取可用的）
    context_cues = []
    
    # 向前取 2 个（如果不够则取可用的）
    for i in range(max(0, current_index - 2), current_index):
        context_cues.append(all_cues[i])
    
    # 当前 cue
    context_cues.append(current_cue)
    
    # 向后取 2 个（如果不够则取可用的）
    for i in range(current_index + 1, min(len(all_cues), current_index + 3)):
        context_cues.append(all_cues[i])
    
    # 拼接文本
    if len(context_cues) <= 1:
        return None  # 只有一个 cue，不需要上下文
    
    context_texts = [cue.text for cue in context_cues]
    return " ".join(context_texts)


@router.post("/ai/query")
async def query_ai(
    request: AIQueryRequest,
    db: Session = Depends(get_db)
):
    """
    AI 查询接口
    
    功能：
    1. 检查缓存（基于 highlight_id）
    2. 如果无缓存，创建 AIQueryRecord（status="processing"）
    3. 调用 AI 服务查询
    4. 保存结果到 AIQueryRecord（status="completed" 或 "failed"）
    5. 返回结构化 JSON 对象
    
    参数:
        request: AIQueryRequest（包含 highlight_id 和可选的 provider）
        db: 数据库会话
        
    返回:
        {
            "query_id": 1,
            "status": "completed",  // processing/completed/failed
            "response": {  // 结构化 JSON 对象（不是字符串）
                "type": "word",  // word/phrase/sentence（由 AI 判断）
                "content": {
                    "phonetic": "/ˌserənˈdɪpəti/",
                    "definition": "意外发现珍宝的运气；机缘凑巧",
                    "explanation": "..."
                }
            }
        }
    """
    import json
    
    # Step 1: 验证 highlight_id 存在
    highlight = db.query(Highlight).filter(Highlight.id == request.highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail=f"Highlight {request.highlight_id} not found")
    
    # Step 2: 检查缓存（基于 highlight_id）
    existing = db.query(AIQueryRecord).filter(
        AIQueryRecord.highlight_id == request.highlight_id,
        AIQueryRecord.status == "completed"
    ).first()
    
    if existing:
        # 解析 JSON 并返回结构化数据
        try:
            response_json = json.loads(existing.response_text)
            logger.info(f"返回缓存查询结果: query_id={existing.id}, highlight_id={request.highlight_id}")
            return {
                "query_id": existing.id,
                "status": "completed",
                "response": response_json
            }
        except json.JSONDecodeError as e:
            logger.error(f"缓存 JSON 解析失败: {e}, query_id={existing.id}")
            # 如果缓存 JSON 损坏，继续执行新查询
    
    # Step 3: 创建 AIQueryRecord（status="processing"）
    provider = request.provider or DEFAULT_AI_PROVIDER
    
    # 构建上下文
    context_text = build_context_text(highlight, db)
    
    ai_record = AIQueryRecord(
        highlight_id=highlight.id,
        query_text=highlight.highlighted_text,
        context_text=context_text,
        status="processing",
        provider=provider
    )
    db.add(ai_record)
    db.commit()
    db.refresh(ai_record)
    
    logger.info(f"创建 AI 查询记录: query_id={ai_record.id}, highlight_id={highlight.id}, text={highlight.highlighted_text[:50]}...")
    
    # Step 4: 调用 AI 服务
    try:
        try:
            ai_service = AIService()
        except ValueError as e:
            # AI 服务初始化失败（通常是 API Key 未配置）
            logger.error(f"AI 服务初始化失败: {e}")
            ai_record.status = "failed"
            ai_record.error_message = str(e)
            db.commit()
            raise HTTPException(
                status_code=500,
                detail=f"AI 服务配置错误：{str(e)}。请检查 GEMINI_API_KEY 环境变量是否已设置。"
            )
        
        response_json = ai_service.query(
            text=highlight.highlighted_text,
            context=context_text,
            provider=provider
        )
        
        # Step 5: 保存结果
        ai_record.response_text = json.dumps(response_json, ensure_ascii=False)
        ai_record.detected_type = response_json.get("type")
        ai_record.status = "completed"
        db.commit()
        
        logger.info(f"AI 查询成功: query_id={ai_record.id}, type={response_json.get('type')}")
        
        return {
            "query_id": ai_record.id,
            "status": "completed",
            "response": response_json
        }
        
    except ValueError as e:
        # JSON 解析失败或格式不符合规范
        ai_record.status = "failed"
        ai_record.error_message = str(e)
        db.commit()
        logger.error(f"AI 查询失败（格式错误）: query_id={ai_record.id}, error={str(e)}")
        raise HTTPException(status_code=500, detail=f"AI 查询失败：{str(e)}")
        
    except Exception as e:
        # API 调用失败、网络错误等
        ai_record.status = "failed"
        ai_record.error_message = str(e)
        db.commit()
        logger.error(f"AI 查询失败（API 错误）: query_id={ai_record.id}, error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI 查询失败：{str(e)}")


