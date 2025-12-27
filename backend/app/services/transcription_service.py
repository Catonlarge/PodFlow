"""
转录服务（虚拟分段 + 数据库集成）

实现虚拟分段创建逻辑和分段转录流程，支持中断恢复和重试机制。
"""
import logging
import os
import math
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from app.models import Episode, AudioSegment, TranscriptCue
from app.config import SEGMENT_DURATION, DEFAULT_LANGUAGE
from app.services.whisper_service import WhisperService

logger = logging.getLogger(__name__)


class TranscriptionService:
    """
    转录服务类
    
    负责：
    1. 为 Episode 创建虚拟分段
    2. 转录单个虚拟分段（支持中断恢复）
    3. 保存字幕到数据库（无 cue_index 方案）
    4. 完整转录流程管理
    """
    
    def __init__(self, db: Session, whisper_service: WhisperService):
        """
        初始化转录服务
        
        参数:
            db: 数据库会话
            whisper_service: WhisperService 单例实例
        """
        self.db = db
        self.whisper_service = whisper_service
    
    def create_virtual_segments(self, episode: Episode) -> List[AudioSegment]:
        """
        为 Episode 创建虚拟分段
        
        统一处理：短音频和长音频都创建 AudioSegment
        使用 config.SEGMENT_DURATION 作为分段时长
        
        参数:
            episode: Episode 对象
            
        返回:
            List[AudioSegment]: 创建的虚拟分段列表
        """
        # 检查是否已有分段（避免重复创建）
        # 注意：此查询充分利用了 idx_episode_segment 索引（episode_id, segment_index）
        # 过滤条件使用 episode_id（索引第一列），排序使用 segment_index（索引第二列）
        existing_segments = self.db.query(AudioSegment).filter(
            AudioSegment.episode_id == episode.id
        ).order_by(AudioSegment.segment_index).all()
        
        if existing_segments:
            logger.info(
                f"[TranscriptionService] Episode {episode.id} 已有 {len(existing_segments)} 个分段，跳过创建"
            )
            return existing_segments
        
        logger.info(
            f"[TranscriptionService] 为 Episode {episode.id} 创建虚拟分段 "
            f"(duration={episode.duration}s, segment_duration={SEGMENT_DURATION}s)"
        )
        
        segments = []
        total_segments = math.ceil(episode.duration / SEGMENT_DURATION)
        
        for i in range(total_segments):
            start_time = i * SEGMENT_DURATION
            end_time = min(start_time + SEGMENT_DURATION, episode.duration)
            
            segment_id = f"segment_{i:03d}"
            
            segment = AudioSegment(
                episode_id=episode.id,
                segment_index=i,
                segment_id=segment_id,
                segment_path=None,  # 初始状态：未提取音频
                start_time=start_time,
                end_time=end_time,
                status="pending",
                retry_count=0
            )
            
            segments.append(segment)
            self.db.add(segment)
        
        self.db.commit()
        
        logger.info(
            f"[TranscriptionService] 成功创建 {len(segments)} 个虚拟分段 "
            f"(Episode {episode.id})"
        )
        
        return segments
    
    def transcribe_virtual_segment(
        self,
        segment: AudioSegment,
        language: Optional[str] = None,
        enable_diarization: bool = True
    ) -> int:
        """
        转录单个虚拟分段（支持中断恢复）
        
        流程：
        1. 检查是否已有临时文件（重试场景）
        2. 如果没有，使用 FFmpeg 提取片段
        3. 调用 WhisperService 转录
        4. 保存 TranscriptCue 到数据库
        5. 更新 segment 状态
        6. 删除临时文件
        
        参数:
            segment: AudioSegment 对象
            language: 语言代码（默认从 Episode 获取）
            enable_diarization: 是否启用说话人区分
            
        返回:
            int: 保存的字幕数量
            
        异常:
            RuntimeError: 转录失败
        """
        if segment.status == "completed":
            logger.info(
                f"[TranscriptionService] Segment {segment.segment_id} 已完成，跳过转录"
            )
            # 返回已有的字幕数量
            # 注意：此查询充分利用了 idx_segment_id 索引（segment_id）
            existing_cues = self.db.query(TranscriptCue).filter(
                TranscriptCue.segment_id == segment.id
            ).count()
            return existing_cues
        
        # 获取 Episode 信息
        episode = self.db.query(Episode).filter(
            Episode.id == segment.episode_id
        ).first()
        
        if not episode:
            raise ValueError(f"Episode {segment.episode_id} 不存在")
        
        if not episode.audio_path or not os.path.exists(episode.audio_path):
            raise FileNotFoundError(f"音频文件不存在: {episode.audio_path}")
        
        # 确定语言
        if language is None:
            language = episode.language or DEFAULT_LANGUAGE
        
        # 提取语言代码（如 "en-US" -> "en"）
        language_code = language.split("-")[0] if "-" in language else language
        
        logger.info(
            f"[TranscriptionService] 开始转录 Segment {segment.segment_id} "
            f"(Episode {episode.id}, {segment.start_time:.2f}s - {segment.end_time:.2f}s)"
        )
        
        temp_path = None
        cues_count = 0
        
        try:
            # Step 1: 检查是否已有临时文件（重试场景）
            if segment.segment_path and os.path.exists(segment.segment_path):
                temp_path = segment.segment_path
                logger.info(
                    f"[TranscriptionService] 使用已有临时文件: {temp_path} "
                    f"(重试场景)"
                )
            else:
                # Step 2: 使用 FFmpeg 提取片段
                duration = segment.end_time - segment.start_time
                temp_path = self.whisper_service.extract_segment_to_temp(
                    audio_path=episode.audio_path,
                    start_time=segment.start_time,
                    duration=duration
                )
                
                # 更新 segment_path（用于中断恢复）
                segment.segment_path = temp_path
                segment.status = "processing"
                segment.transcription_started_at = datetime.utcnow()
                segment.error_message = None
                self.db.commit()
                
                logger.info(
                    f"[TranscriptionService] 音频片段已提取: {temp_path}"
                )
            
            # Step 3: 调用 WhisperService 转录
            cues = self.whisper_service.transcribe_segment(
                audio_path=temp_path,
                language=language_code,
                enable_diarization=enable_diarization
            )
            
            if not cues:
                logger.warning(
                    f"[TranscriptionService] Segment {segment.segment_id} 未生成任何字幕"
                )
                segment.status = "failed"
                segment.error_message = "转录结果为空"
                self.db.commit()
                
                # 同步更新 Episode 状态
                self.sync_episode_transcription_status(segment.episode_id)
                
                return 0
            
            # Step 4: 保存字幕到数据库
            cues_count = self.save_cues_to_db(cues, segment)
            
            # Step 5: 更新 segment 状态
            segment.status = "completed"
            segment.recognized_at = datetime.utcnow()
            segment.segment_path = None  # 清空路径（临时文件将删除）
            segment.error_message = None
            self.db.commit()
            
            logger.info(
                f"[TranscriptionService] Segment {segment.segment_id} 转录完成，"
                f"生成 {cues_count} 条字幕"
            )
            
            # Step 6: 同步更新 Episode 状态
            self.sync_episode_transcription_status(segment.episode_id)
            
            # Step 7: 删除临时文件
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                    logger.debug(
                        f"[TranscriptionService] 临时文件已删除: {temp_path}"
                    )
                except Exception as e:
                    logger.warning(
                        f"[TranscriptionService] 删除临时文件失败: {temp_path}, "
                        f"错误: {e}"
                    )
            
            return cues_count
            
        except Exception as e:
            logger.error(
                f"[TranscriptionService] Segment {segment.segment_id} 转录失败: {e}",
                exc_info=True
            )
            
            # 更新 segment 状态为失败
            segment.status = "failed"
            segment.error_message = str(e)
            segment.retry_count += 1
            # 保留 segment_path（用于重试）
            self.db.commit()
            
            # 同步更新 Episode 状态
            self.sync_episode_transcription_status(segment.episode_id)
            
            # 注意：失败时不删除临时文件，保留用于重试
            raise RuntimeError(f"转录失败: {e}") from e
    
    def save_cues_to_db(self, cues: List[Dict], segment: AudioSegment) -> int:
        """
        保存字幕到数据库（无 cue_index 方案，使用绝对时间）
        
        计算绝对时间: start_time = segment.start_time + cue['start']
        不存储 cue_index，使用 start_time 排序
        
        参数:
            cues: 字幕列表，格式: [{"start": float, "end": float, "speaker": str, "text": str}]
            segment: AudioSegment 对象
            
        返回:
            int: 保存的字幕数量
        """
        if not cues:
            return 0
        
        logger.debug(
            f"[TranscriptionService] 保存 {len(cues)} 条字幕到数据库 "
            f"(Segment {segment.segment_id})"
        )
        
        # 删除该 segment 的旧字幕（支持重试场景）
        # 注意：此查询充分利用了 idx_segment_id 索引（segment_id）
        deleted_count = self.db.query(TranscriptCue).filter(
            TranscriptCue.segment_id == segment.id
        ).delete(synchronize_session=False)
        
        if deleted_count > 0:
            logger.debug(
                f"[TranscriptionService] 删除 {deleted_count} 条旧字幕 "
                f"(Segment {segment.segment_id}, 重试场景)"
            )
        
        # 创建新的字幕记录
        transcript_cues = []
        for cue in cues:
            # 计算绝对时间（相对于原始音频）
            absolute_start = segment.start_time + cue["start"]
            absolute_end = segment.start_time + cue["end"]
            
            transcript_cue = TranscriptCue(
                episode_id=segment.episode_id,
                segment_id=segment.id,
                start_time=absolute_start,
                end_time=absolute_end,
                speaker=cue.get("speaker", "Unknown"),
                text=cue.get("text", "").strip()
            )
            
            transcript_cues.append(transcript_cue)
        
        # 批量插入
        self.db.add_all(transcript_cues)
        self.db.commit()
        
        logger.info(
            f"[TranscriptionService] 成功保存 {len(transcript_cues)} 条字幕 "
            f"(Segment {segment.segment_id})"
        )
        
        return len(transcript_cues)
    
    def sync_episode_transcription_status(self, episode_id: int) -> None:
        """
        同步更新 Episode 的转录状态（基于所有 Segment 的状态）
        
        此方法在单个 Segment 转录完成或失败后调用，确保 Episode 状态与实际 Segment 状态一致。
        
        状态判断逻辑：
        - 所有 Segment 都 completed → Episode.status = "completed"
        - 有 completed 也有 failed，没有 processing/pending → Episode.status = "partial_failed"
        - 所有 Segment 都 failed → Episode.status = "failed"
        - 有 processing 或 pending → Episode.status = "processing"（如果当前不是 processing）
        
        参数:
            episode_id: Episode ID
        """
        episode = self.db.query(Episode).filter(Episode.id == episode_id).first()
        if not episode:
            logger.warning(
                f"[TranscriptionService] Episode {episode_id} 不存在，无法同步状态"
            )
            return
        
        # 获取所有 Segment
        segments = self.db.query(AudioSegment).filter(
            AudioSegment.episode_id == episode_id
        ).all()
        
        if not segments:
            # 没有 Segment，保持当前状态或设为 pending
            if episode.transcription_status not in ["pending", "processing"]:
                episode.transcription_status = "pending"
                self.db.commit()
            return
        
        # 统计各状态的 Segment 数量
        completed_count = sum(1 for s in segments if s.status == "completed")
        failed_count = sum(1 for s in segments if s.status == "failed")
        processing_count = sum(1 for s in segments if s.status == "processing")
        pending_count = sum(1 for s in segments if s.status == "pending")
        total_count = len(segments)
        
        # 判断新的状态
        new_status = None
        
        if completed_count == total_count:
            # 所有 Segment 都完成
            new_status = "completed"
        elif failed_count == total_count:
            # 所有 Segment 都失败
            new_status = "failed"
        elif processing_count > 0 or pending_count > 0:
            # 还有进行中或等待中的 Segment
            new_status = "processing"
        elif completed_count > 0 and failed_count > 0:
            # 有完成也有失败，没有进行中的
            new_status = "partial_failed"
        else:
            # 其他情况（理论上不应该发生）
            logger.warning(
                f"[TranscriptionService] Episode {episode_id} 状态异常: "
                f"completed={completed_count}, failed={failed_count}, "
                f"processing={processing_count}, pending={pending_count}"
            )
            new_status = "processing"  # 默认设为 processing
        
        # 更新状态（如果发生变化）
        if new_status and episode.transcription_status != new_status:
            old_status = episode.transcription_status
            episode.transcription_status = new_status
            self.db.commit()
            
            logger.info(
                f"[TranscriptionService] Episode {episode_id} 状态已同步: "
                f"{old_status} → {new_status} "
                f"(completed={completed_count}, failed={failed_count}, "
                f"processing={processing_count}, pending={pending_count})"
            )
    
    def segment_and_transcribe(
        self,
        episode_id: int,
        language: Optional[str] = None,
        enable_diarization: bool = True
    ) -> None:
        """
        完整流程：创建分段 + 按顺序转录
        
        流程：
        1. 获取 Episode
        2. 创建虚拟分段（如果不存在）
        3. 更新 Episode.transcription_status 为 "processing"
        4. 按顺序转录所有分段
        5. 更新 Episode.transcription_status（completed/partial_failed/failed）
        
        参数:
            episode_id: Episode ID
            language: 语言代码（默认从 Episode 获取）
            enable_diarization: 是否启用说话人区分
            
        异常:
            ValueError: Episode 不存在
        """
        # 获取 Episode
        episode = self.db.query(Episode).filter(Episode.id == episode_id).first()
        
        if not episode:
            raise ValueError(f"Episode {episode_id} 不存在")
        
        logger.info(
            f"[TranscriptionService] 开始转录 Episode {episode_id} "
            f"({episode.title})"
        )
        
        # 创建虚拟分段（如果不存在）
        segments = self.create_virtual_segments(episode)
        
        if not segments:
            logger.warning(
                f"[TranscriptionService] Episode {episode_id} 没有需要转录的分段"
            )
            return
        
        # 更新 Episode 状态为 processing
        episode.transcription_status = "processing"
        self.db.commit()
        
        # 如果启用说话人区分，在 Episode 处理开始前加载 Diarization 模型
        if enable_diarization:
            try:
                self.whisper_service.load_diarization_model()
                logger.info(
                    f"[TranscriptionService] Diarization 模型已加载 "
                    f"(Episode {episode_id})"
                )
            except Exception as e:
                logger.warning(
                    f"[TranscriptionService] Diarization 模型加载失败，"
                    f"将使用转录模式: {e}"
                )
                enable_diarization = False
        
        # 按顺序转录所有分段
        completed_count = 0
        failed_count = 0
        
        for segment in segments:
            try:
                cues_count = self.transcribe_virtual_segment(
                    segment=segment,
                    language=language,
                    enable_diarization=enable_diarization
                )
                completed_count += 1
                logger.info(
                    f"[TranscriptionService] Segment {segment.segment_id} 完成 "
                    f"({completed_count}/{len(segments)})"
                )
            except Exception as e:
                failed_count += 1
                logger.error(
                    f"[TranscriptionService] Segment {segment.segment_id} 失败: {e}"
                )
                # 继续处理下一个分段（独立事务）
        
        # 释放 Diarization 模型（如果已加载）
        if enable_diarization:
            try:
                self.whisper_service.release_diarization_model()
                logger.info(
                    f"[TranscriptionService] Diarization 模型已释放 "
                    f"(Episode {episode_id})"
                )
            except Exception as e:
                logger.warning(
                    f"[TranscriptionService] Diarization 模型释放失败: {e}"
                )
        
        # 更新 Episode 状态
        if failed_count == 0:
            episode.transcription_status = "completed"
            logger.info(
                f"[TranscriptionService] Episode {episode_id} 转录完成 "
                f"({completed_count} 个分段)"
            )
        elif completed_count > 0:
            episode.transcription_status = "partial_failed"
            logger.warning(
                f"[TranscriptionService] Episode {episode_id} 部分转录失败 "
                f"({completed_count} 成功, {failed_count} 失败)"
            )
        else:
            episode.transcription_status = "failed"
            logger.error(
                f"[TranscriptionService] Episode {episode_id} 转录完全失败 "
                f"({failed_count} 个分段全部失败)"
            )
        
        self.db.commit()
        
        logger.info(
            f"[TranscriptionService] Episode {episode_id} 转录流程结束 "
            f"(状态: {episode.transcription_status})"
        )

