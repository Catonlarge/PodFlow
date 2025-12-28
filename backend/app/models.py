"""
数据库模型定义
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, ForeignKey, Boolean, UniqueConstraint, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

Base = declarative_base()


def get_default_ai_provider():
    """
    获取默认 AI 提供商
    
    从 config.DEFAULT_AI_PROVIDER 获取，避免在 Column 定义时直接导入（可能产生循环依赖）。
    """
    from app.config import DEFAULT_AI_PROVIDER
    return DEFAULT_AI_PROVIDER


# ==================== 新数据库模型（Task 1.1）====================

class Podcast(Base):
    """
    播客模型
    
    存储播客基本信息，一个播客可以包含多个单集（Episode）
    本地音频可不关联 Podcast（podcast_id 可为空）
    
    Attributes:
        id (int): 主键
        title (str): 播客名称（如 "Lenny's Podcast"）
        source_url (str): 原始链接（用户提供），唯一索引，可选
        description (str): 播客描述，可选
        cover_image (str): 封面图片路径，可选
        created_at (datetime): 创建时间（自动设置）
    
    设计要点：
        - source_url 设置唯一约束，防止重复添加同一个播客源
        - 允许同名 Podcast（不同源可以有相同 title）
        - NULL 值不受唯一约束限制（多个手动创建的播客可以都为 NULL）
    """
    __tablename__ = "podcasts"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    source_url = Column(String, nullable=True, unique=True)  # 添加唯一约束
    description = Column(Text, nullable=True)
    cover_image = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 关系映射
    episodes = relationship("Episode", back_populates="podcast")
    
    def __repr__(self):
        """字符串表示"""
        return f"<Podcast(id={self.id}, title='{self.title}')>"


class Episode(Base):
    """
    单集/音频文件模型
    
    存储单集或本地音频的元数据、文件信息和转录状态
    
    Attributes:
        id (int): 主键
        podcast_id (int): 外键 → Podcast（可为空，本地音频无 podcast）
        title (str): 单集标题
        original_filename (str): 用户上传的原始文件名
        original_path (str): 用户选择的原始路径（仅供参考）
        audio_path (str): 项目内存储路径（实际使用）
        file_hash (str): MD5 hash（唯一索引，用于去重）
        file_size (int): 文件大小（字节）
        duration (float): 音频总时长（秒）
        language (str): 语言代码（默认 "en-US"）
        created_at (datetime): 创建时间
        updated_at (datetime): 更新时间（自动更新）
    
    Properties（动态计算属性）:
        show_name (str): 节目名称（从 Podcast 获取或返回 "本地音频"）
        segment_duration (int): 分段时长（从全局配置获取）
        needs_segmentation (bool): 是否需要分段（duration > segment_duration）
        total_segments (int): 总段数（ceil(duration / segment_duration)）
        transcription_progress (float): 转录进度百分比（0-100，用于前端展示）
        transcription_status_display (str): 友好的状态文本（用于前端展示）
        estimated_time_remaining (int): 预计剩余秒数（用于前端展示）
        transcription_stats (dict): 完整的段数统计（用于调试）
        failed_segments_detail (list): 失败段的详细信息（用于调试）
        transcription_started_at (datetime): 转录开始时间（从 AudioSegment 聚合计算）
        transcription_completed_at (datetime): 转录完成时间（从 AudioSegment 聚合计算）
    
    设计要点：
        - file_hash 唯一索引：相同文件只存储一次
        - audio_path：保存到项目目录，不依赖用户原始路径
        - 删除 show_name 字段：使用 @property 动态获取（消除数据冗余）
        - 删除分段相关字段：使用全局配置 + @property（便于实验调优）
        - transcription_status 物理字段：用于高效查询（避免全表扫描和 N+1 问题）
        - transcription_progress 等：保留为 @property（仅供前端展示，不用于查询）
        - 删除转录时间戳字段：使用 @property 从 AudioSegment 聚合计算（单一数据源，保证一致性）
    """
    __tablename__ = "episodes"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 关联 Podcast（可为空，本地音频无 podcast）
    podcast_id = Column(Integer, ForeignKey("podcasts.id", ondelete="SET NULL"), nullable=True)
    
    # 文件信息
    title = Column(String, nullable=False, index=True)
    original_filename = Column(String, nullable=True)
    original_path = Column(String, nullable=True)
    audio_path = Column(String, nullable=True)
    file_hash = Column(String, nullable=False, unique=True, index=True)
    file_size = Column(Integer, nullable=True)
    duration = Column(Float, nullable=False)
    
    # 转录状态（物理字段，用于高效查询）
    transcription_status = Column(String, default="pending", nullable=False, index=True)  # pending/processing/completed/failed
    
    # 元数据
    language = Column(String, default="en-US", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # 关系映射
    podcast = relationship("Podcast", back_populates="episodes")
    segments = relationship("AudioSegment", back_populates="episode", cascade="all, delete-orphan")
    transcript_cues = relationship("TranscriptCue", back_populates="episode", cascade="all, delete-orphan")
    highlights = relationship("Highlight", back_populates="episode", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="episode", cascade="all, delete-orphan")
    
    @property
    def show_name(self):
        """
        动态获取节目名称
        - 如果关联了 Podcast → 返回 Podcast.title
        - 如果是本地音频 → 返回 "本地音频"
        
        优化说明：
        - 使用 SQLAlchemy joinedload 避免 N+1 查询：
          episodes = db.query(Episode).options(joinedload(Episode.podcast)).all()
        """
        return self.podcast.title if self.podcast else "本地音频"
    
    @property
    def segment_duration(self):
        """
        返回全局配置的分段时长（秒）
        
        这是系统级参数，不是每个 Episode 独立配置的。
        修改 config.py 中的 SEGMENT_DURATION 后，所有 Episode 自动使用新值。
        """
        from app.config import SEGMENT_DURATION
        return SEGMENT_DURATION
    
    @property
    def needs_segmentation(self):
        """
        是否需要分段（基于全局配置动态判断）
        
        判断逻辑：duration > segment_duration
        大多数音频都需要分段，因此不单独存储此字段。
        """
        return self.duration > self.segment_duration
    
    @property
    def total_segments(self):
        """
        总段数（基于全局配置动态计算）
        
        计算逻辑：
        - 如果不需要分段 → 返回 1
        - 否则 → ceil(duration / segment_duration)
        """
        if not self.needs_segmentation:
            return 1
        import math
        return math.ceil(self.duration / self.segment_duration)
    
    @property
    def transcription_started_at(self):
        """
        转录开始时间（从 AudioSegment 动态聚合计算）
        
        计算逻辑：
        - 返回第一个开始转录的 Segment 的时间（min(segment.transcription_started_at)）
        - 如果没有任何 Segment 开始转录 → 返回 None
        
        数据一致性：
        - 单一数据源（AudioSegment 为准），无冗余存储
        - Segment 重试后时间戳改变，Episode 自动正确
        - 短音频（单 segment）和长音频（多 segments）逻辑统一
        
        性能优化：
        - 使用 joinedload 预加载：
          episode = db.query(Episode).options(joinedload(Episode.segments)).first()
        """
        if not self.segments:
            return None
        
        # 收集所有已开始转录的 Segment 的时间戳
        started_times = [
            seg.transcription_started_at 
            for seg in self.segments 
            if seg.transcription_started_at is not None
        ]
        
        # 返回最早的时间（第一个开始转录的 Segment）
        return min(started_times) if started_times else None
    
    @property
    def transcription_completed_at(self):
        """
        转录完成时间（从 AudioSegment 动态聚合计算）
        
        计算逻辑：
        - **只有所有 Segment 都完成** → 返回最后一个完成的时间（max(segment.recognized_at)）
        - **否则（转录未完成）** → 返回 None
        
        完成条件：
        - 所有 Segment 的 status == "completed"
        
        数据一致性：
        - 单一数据源（AudioSegment 为准），无冗余存储
        - 清晰语义：None = 未完成，有值 = 已完成
        - 短音频（单 segment）和长音频（多 segments）逻辑统一
        
        性能优化：
        - 使用 joinedload 预加载：
          episode = db.query(Episode).options(joinedload(Episode.segments)).first()
        """
        if not self.segments:
            return None
        
        # 检查是否所有 Segment 都已完成
        all_completed = all(seg.status == "completed" for seg in self.segments)
        if not all_completed:
            return None  # 转录未完成
        
        # 收集所有已完成 Segment 的完成时间
        completed_times = [
            seg.recognized_at 
            for seg in self.segments 
            if seg.recognized_at is not None
        ]
        
        # 返回最晚的时间（最后一个完成的 Segment）
        return max(completed_times) if completed_times else None
    
    @property
    def transcription_progress(self):
        """
        转录进度百分比（0-100，用于前端展示）
        
        计算逻辑：
        - 已完成段数 / 总段数 * 100
        - 如果没有 Segment → 返回 0.0
        
        注意：这是动态属性，不用于数据库查询（避免 N+1 问题）。
        查询时使用 transcription_status 物理字段。
        
        注意：前端不使用此进度值，而是自己模拟进度条（基于时间）。
        """
        if not self.segments:
            return 0.0
        completed = sum(1 for s in self.segments if s.status == "completed")
        return round((completed / len(self.segments)) * 100, 2)
    
    @property
    def transcription_status_display(self):
        """
        友好的状态文本（用于前端展示，隐藏技术细节）
        
        注意：这是动态属性，不用于数据库查询。
        查询时使用 transcription_status 物理字段。
        """
        status_map = {
            "pending": "等待转录",
            "processing": "正在转录中...",
            "completed": "转录完成",
            "partial_failed": "部分转录失败，可继续使用",
            "failed": "转录失败，请重试"
        }
        return status_map.get(self.transcription_status, "未知状态")
    
    @property
    def estimated_time_remaining(self):
        """
        预计剩余秒数（用于前端展示）
        
        计算逻辑：
        - 基于剩余段数和平均转录速度（每段 180 秒，转录速度 0.4x）
        
        注意：这是动态属性，不用于数据库查询。
        """
        if not self.segments:
            return 0
        pending = sum(1 for s in self.segments if s.status in ["pending", "processing"])
        return int(pending * 180 * 0.4)  # 每段180s，转录速度0.4x
    
    @property
    def transcription_stats(self):
        """
        完整的段数统计（用于调试）
        
        返回详细的段数统计信息，仅供日志、监控、调试使用。
        """
        if not self.segments:
            return {
                "total_segments": 0,
                "completed_segments": 0,
                "failed_segments": 0,
                "processing_segments": 0,
                "pending_segments": 0
            }
        return {
            "total_segments": len(self.segments),
            "completed_segments": sum(1 for s in self.segments if s.status == "completed"),
            "failed_segments": sum(1 for s in self.segments if s.status == "failed"),
            "processing_segments": sum(1 for s in self.segments if s.status == "processing"),
            "pending_segments": sum(1 for s in self.segments if s.status == "pending")
        }
    
    @property
    def failed_segments_detail(self):
        """
        失败段的详细信息（用于调试）
        
        返回所有失败段的详细信息，包括 segment_id 和 error_message。
        """
        return [
            {
                "segment_id": s.segment_id,
                "segment_index": s.segment_index,
                "error_message": s.error_message,
                "retry_count": s.retry_count
            }
            for s in self.segments if s.status == "failed"
        ]
    
    def __repr__(self):
        """字符串表示"""
        return f"<Episode(id={self.id}, title='{self.title}', show_name='{self.show_name}', duration={self.duration}s)>"


class AudioSegment(Base):
    """
    音频虚拟分段模型
    
    用于支持异步转录和重试机制。不存储物理文件，只记录时间范围。
    
    Attributes:
        id (int): 主键
        episode_id (int): 外键 → Episode
        segment_index (int): 段序号（从 0 开始，用于排序）
        segment_id (str): 分段 ID（如 "segment_001"）
        segment_path (str): 临时音频文件路径（生命周期管理）
            - 初始状态（pending）: NULL（未提取音频）
            - 转录前/转录中（processing）: 记录临时文件路径（如 backend/data/temp_segments/segment_001_abc123.wav）
            - 转录成功后（completed）: 清空为 NULL（临时文件已删除）
            - 转录失败时（failed）: 保留路径（用于重试，无需重新提取音频）
        start_time (float): 在原音频中的开始时间（秒）
        end_time (float): 在原音频中的结束时间（秒）
        status (str): 识别状态（pending/processing/completed/failed）
        error_message (str): 错误信息
        retry_count (int): 重试次数（默认 0）
        transcription_started_at (datetime): 开始转录时间（用于排序和监控）
        recognized_at (datetime): 识别完成时间
        created_at (datetime): 创建时间
    
    Properties（动态计算属性）:
        duration (float): 分段时长（end_time - start_time）
    
    设计要点：
        - 虚拟分段：只记录时间范围（start_time, end_time），不切割物理文件
        - duration 通过 @property 动态计算，避免数据不一致
        - 临时文件管理：
            * 转录开始时，FFmpeg 提取片段到持久临时文件，记录路径到 segment_path
            * 转录成功后，删除临时文件，清空 segment_path
            * 转录失败时，保留临时文件和路径，重试时可直接使用（节省提取时间）
            * 定期清理孤儿临时文件（超过 30 分钟的失败转录）
        - 支持异步识别：用户滚动时按需识别后续 segment
        - 顺序保证：segment_index 必须连续（0, 1, 2, 3...）
        - 重试机制：retry_count 记录失败重试次数，便于监控和限制最大重试
        - 中断恢复：服务器重启后，可根据 segment_path 继续转录（如果文件存在）
    """
    __tablename__ = "audio_segments"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 关联 Episode（必需）
    episode_id = Column(Integer, ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False)
    
    # 分段信息
    segment_index = Column(Integer, nullable=False)  # 段序号（从 0 开始）
    segment_id = Column(String, nullable=False)      # 分段 ID（如 "segment_001"）
    segment_path = Column(String, nullable=True)     # 物理文件路径（虚拟分段为 NULL）
    
    # 时间范围（核心）
    start_time = Column(Float, nullable=False)       # 在原音频中的开始时间（秒）
    end_time = Column(Float, nullable=False)         # 在原音频中的结束时间（秒）
    
    # 识别状态
    status = Column(String, default="pending", nullable=False)  # pending/processing/completed/failed
    error_message = Column(Text, nullable=True)      # 错误信息
    retry_count = Column(Integer, default=0, nullable=False)  # 重试次数
    transcription_started_at = Column(DateTime, nullable=True)  # 开始转录时间
    recognized_at = Column(DateTime, nullable=True)  # 识别完成时间
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 关系映射
    episode = relationship("Episode", back_populates="segments")
    transcript_cues = relationship("TranscriptCue", back_populates="segment", cascade="all, delete-orphan")
    
    # 表级约束和索引
    __table_args__ = (
        # 唯一约束：同一个 Episode 的 segment_index 不能重复
        UniqueConstraint('episode_id', 'segment_index', name='_episode_segment_uc'),
        # 索引优化
        Index('idx_episode_segment', 'episode_id', 'segment_index'),  # 按 episode 和 segment_index 排序
        Index('idx_segment_status', 'status'),  # 按状态查询（用于监控和重试）
        Index('idx_episode_status_segment', 'episode_id', 'status', 'segment_index'),  # 复合索引
    )
    
    @property
    def duration(self):
        """
        分段时长（动态计算，避免数据不一致）
        
        计算逻辑：end_time - start_time
        优点：
        - 符合数据库第三范式（3NF）
        - 消除数据冗余
        - 保证数据一致性（start_time 或 end_time 改变时，duration 自动正确）
        """
        return self.end_time - self.start_time
    
    def __repr__(self):
        """字符串表示"""
        return f"<AudioSegment(id={self.id}, episode_id={self.episode_id}, segment_index={self.segment_index}, status='{self.status}')>"


class TranscriptCue(Base):
    """
    字幕片段模型（对应 PRD 中的 cue 概念）
    
    存储单句字幕的时间范围、说话人和文本内容。
    
    Attributes:
        id (int): 主键
        episode_id (int): 外键 → Episode
        segment_id (int): 外键 → AudioSegment（可为空，支持手动导入字幕）
        start_time (float): 开始时间戳（秒，相对于原始音频的绝对时间）
        end_time (float): 结束时间戳（秒，相对于原始音频的绝对时间）
        speaker (str): 说话人标识（如 "Lenny", "SPEAKER_01", "Unknown"）
        text (str): 字幕文本内容
        created_at (datetime): 创建时间
    
    设计要点：
        - 移除 cue_index 字段：在异步/并发转录场景下，维护全局连续索引成本极高且易出错
            * 替代方案：只存储 start_time，查询时使用 ORDER BY start_time ASC 获得正确顺序
            * 前端需要序号时，在内存中动态生成（Index + 1）
        - start_time/end_time：相对于原始音频的绝对时间（排序依据）
        - Highlight 关联：使用 cue.id（主键），确保笔记与字幕的锚定永不漂移
            * cue.id 是自增主键，一旦分配永不改变
            * 完全解决异步转录的关联问题
        - segment_id 可为空：支持手动导入字幕等场景
        - segment_id 级联删除：改为 CASCADE（而非 SET NULL），防止重试转录后旧字幕残留
        - speaker 字段：支持说话人标识（PRD 必需），默认 "Unknown"
    """
    __tablename__ = "transcript_cues"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 关联字段
    episode_id = Column(Integer, ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False)
    segment_id = Column(Integer, ForeignKey("audio_segments.id", ondelete="CASCADE"), nullable=True)  # 改为 CASCADE，防止重试后旧字幕残留
    
    # 字幕信息
    start_time = Column(Float, nullable=False)   # 绝对时间（相对于原始音频，用于排序）
    end_time = Column(Float, nullable=False)     # 绝对时间（相对于原始音频）
    speaker = Column(String, default="Unknown", nullable=False)  # 说话人标识
    text = Column(Text, nullable=False)          # 字幕文本
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 关系映射
    episode = relationship("Episode", back_populates="transcript_cues")
    segment = relationship("AudioSegment", back_populates="transcript_cues")
    highlights = relationship("Highlight", back_populates="cue", cascade="all, delete-orphan")
    
    # 表级约束和索引
    __table_args__ = (
        # 时间范围索引（用于排序和范围查询，主要查询索引）
        Index('idx_episode_time', 'episode_id', 'start_time'),
        # Segment 关联索引（用于异步识别）
        Index('idx_segment_id', 'segment_id'),
    )
    
    def __repr__(self):
        """字符串表示"""
        return f"<TranscriptCue(id={self.id}, episode_id={self.episode_id}, start_time={self.start_time:.2f}s, speaker='{self.speaker}', text='{self.text[:30]}...')>"


class Highlight(Base):
    """
    用户划线模型（简化设计：单 cue 关联 + 分组管理）
    
    支持单 cue 划线和跨 cue 划线（通过分组管理实现）。
    
    Attributes:
        id (int): 主键
        episode_id (int): 外键 → Episode
        cue_id (int): 外键 → TranscriptCue（只关联一个 cue）
        start_offset (int): 在 cue 内的字符起始位置（从 0 开始）
        end_offset (int): 在 cue 内的字符结束位置
        highlighted_text (str): 被划线的文本内容（快照，用于快速渲染）
        highlight_group_id (str): 分组 ID（UUID），跨 cue 划线时共享（可为 NULL）
        color (str): 划线颜色（默认 #9C27B0，紫色）
        created_at (datetime): 创建时间
        updated_at (datetime): 更新时间（支持修改颜色等操作）
    
    设计要点：
        - 简化设计：不允许单个 Highlight 跨 cue，改为自动拆分 + 分组管理
        - 单 cue 划线（90% 场景）：highlight_group_id = NULL
        - 跨 cue 划线（10% 场景）：前端自动拆分成多个 Highlight，使用 highlight_group_id 关联
        - 使用 cue.id（主键）关联，确保笔记与字幕的锚定永不漂移
        - 删除逻辑：如果 highlight_group_id 不为空，需要按组删除
    """
    __tablename__ = "highlights"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 关联字段
    episode_id = Column(Integer, ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False)
    cue_id = Column(Integer, ForeignKey("transcript_cues.id", ondelete="CASCADE"), nullable=False)
    
    # 划线范围（在 cue 内的字符偏移量）
    start_offset = Column(Integer, nullable=False)  # 字符起始位置（从 0 开始）
    end_offset = Column(Integer, nullable=False)    # 字符结束位置
    
    # 划线内容（快照，用于快速渲染）
    highlighted_text = Column(Text, nullable=False)
    
    # 分组管理（跨 cue 划线支持）
    highlight_group_id = Column(String, nullable=True)  # UUID，同一次划线产生的多个 Highlight 共享
    
    # 样式
    color = Column(String, default="#9C27B0", nullable=False)  # 默认紫色
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # 关系映射
    episode = relationship("Episode", back_populates="highlights")
    cue = relationship("TranscriptCue", back_populates="highlights")
    notes = relationship("Note", back_populates="highlight", cascade="all, delete-orphan")
    ai_queries = relationship("AIQueryRecord", back_populates="highlight", cascade="all, delete-orphan")
    
    # 表级约束和索引
    __table_args__ = (
        # Episode 级别的划线查询
        Index('idx_episode_highlight', 'episode_id'),
        # Cue 级别的划线查询（高频）
        Index('idx_highlight_cue', 'cue_id'),
        # 分组查询（用于按组删除和渲染）
        Index('idx_highlight_group', 'highlight_group_id'),
        # 复合索引（提高查询性能）
        Index('idx_highlight_episode_cue', 'episode_id', 'cue_id'),
    )
    
    def __repr__(self):
        """字符串表示"""
        group_info = f", group='{self.highlight_group_id[:8]}...'" if self.highlight_group_id else ""
        return f"<Highlight(id={self.id}, cue_id={self.cue_id}, text='{self.highlighted_text[:20]}...'{group_info})>"


class Note(Base):
    """
    笔记模型（明确 AI 查询转化关系）
    
    存储用户的笔记，包括三种类型：纯划线、用户想法、AI 查询结果。
    
    Attributes:
        id (int): 主键
        episode_id (int): 外键 → Episode
        highlight_id (int): 外键 → Highlight（必需，所有笔记都源于划线）
        origin_ai_query_id (int): 外键 → AIQueryRecord（可选，标记来源于哪次 AI 查询）
        content (str): 笔记内容（underline 类型时为空）
        note_type (str): 笔记类型（underline/thought/ai_card）
        created_at (datetime): 创建时间
        updated_at (datetime): 更新时间
    
    设计要点：
        - note_type 三种类型：
            * underline：纯划线（只有下划线样式，不显示笔记卡片，content 为空）
            * thought：用户想法（显示笔记卡片，用户手动输入）
            * ai_card：保存的 AI 查询结果（显示笔记卡片，来自 AI）
        
        - AI 查询到笔记的转化逻辑：
            1. 用户划线 → 点击"AI 查询" → 创建 AIQueryRecord（临时）
            2. AI 返回结果 → 前端展示"AI查询卡片"（临时 UI）
            3. 用户点击"保存笔记" → 创建 Note（持久化）
            4. origin_ai_query_id 记录来源，但删除 AIQueryRecord 不影响 Note
        
        - 级联删除：
            * 删除 Episode → 删除所有 Note（CASCADE）
            * 删除 Highlight → 删除关联的 Note（CASCADE）
            * 删除 AIQueryRecord → Note 保留，origin_ai_query_id 设为 NULL（SET NULL）
        
        - content 可为空：underline 类型时 content 为空
        - note_type 必需：必须显式指定类型，无默认值
    """
    __tablename__ = "notes"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 关联字段
    episode_id = Column(Integer, ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False)
    highlight_id = Column(Integer, ForeignKey("highlights.id", ondelete="CASCADE"), nullable=False)
    origin_ai_query_id = Column(Integer, ForeignKey("ai_query_records.id", ondelete="SET NULL"), nullable=True)
    
    # 笔记内容
    content = Column(Text, nullable=True)  # underline 类型时为空
    note_type = Column(String, nullable=False)  # underline/thought/ai_card（必须显式指定）
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # 关系映射
    episode = relationship("Episode", back_populates="notes")
    highlight = relationship("Highlight", back_populates="notes")
    # 反向关联 AIQueryRecord（不拥有，只是引用）
    # ai_query 通过 origin_ai_query_id 关联，但不使用 relationship（避免循环依赖）
    
    # 表级约束和索引
    __table_args__ = (
        # Episode 级别的笔记查询
        Index('idx_episode_note', 'episode_id'),
        # Highlight 级别的笔记查询（高频）
        Index('idx_highlight_note', 'highlight_id'),
        # 按类型查询
        Index('idx_note_type', 'note_type'),
        # AI 查询来源索引
        Index('idx_origin_ai_query', 'origin_ai_query_id'),
        # 复合索引（提高查询性能）
        Index('idx_note_episode_type', 'episode_id', 'note_type'),
        Index('idx_note_episode_highlight', 'episode_id', 'highlight_id'),
    )
    
    def __repr__(self):
        """字符串表示"""
        content_preview = f"content='{self.content[:20]}...'" if self.content else "content=None"
        return f"<Note(id={self.id}, type='{self.note_type}', {content_preview})>"


class AIQueryRecord(Base):
    """
    AI 查询记录模型（作为缓存/日志）
    
    记录用户的所有 AI 查询，包括查询内容、上下文、AI 响应等。
    
    Attributes:
        id (int): 主键
        highlight_id (int): 外键 → Highlight（必需）
        query_text (str): 用户查询的文本（划线内容）
        context_text (str): 上下文（相邻 2-3 个 cue 的文本，用于专有名词识别）
        response_text (str): AI 返回的结果（JSON 字符串，Gemini 返回的完整 JSON 格式）
        detected_type (str): AI 检测到的类型（word/phrase/sentence，从 response_text 解析得到）
        provider (str): AI 提供商（如 "gemini-2.5-flash"，默认从 config.DEFAULT_AI_PROVIDER 获取）
        status (str): 查询状态（processing/completed/failed）
        error_message (str): 错误信息（失败时记录原因）
        created_at (datetime): 创建时间
    
    设计要点：
        - AIQueryRecord 的定位：
            * 缓存：避免重复查询同样的内容（节省 Token 成本）
            * 日志：记录所有 AI 查询历史，用于数据分析
            * 临时存储：用户可能查询了但没有保存为笔记
        
        - 独立存在，不强依赖 Note：
            * 用户划线 → 点"AI 查询" → 立即创建 AIQueryRecord
            * 用户可能不保存为笔记（只是临时查看）
            * 如果保存为笔记，Note 通过 origin_ai_query_id 反向关联
        
        - 查询缓存逻辑（⭐ 优化：移除 query_type 依赖）：
            * 查询前先检查是否已有缓存（基于 highlight_id）
            * 如果有且状态为 completed，解析 response_text（JSON 字符串）并返回结构化数据
            * 避免重复调用 AI API，节省成本
        
        - 类型判断由 AI 返回决定：
            * 不再需要用户指定查询类型（word_translation/phrase_explanation/concept）
            * Gemini 自动判断划线内容是 word/phrase/sentence
            * detected_type 字段存储 AI 返回的 type 值，用于索引和查询
        
        - provider 全局配置管理：
            * 默认值从 config.DEFAULT_AI_PROVIDER 获取
            * 支持灵活切换不同 AI 提供商（实验和对比）
            * 便于数据分析：统计不同模型的效果和成本
        
        - 级联删除：
            * 删除 Highlight → 删除所有 AIQueryRecord（CASCADE）
            * 删除 AIQueryRecord → 不影响 Note（Note 已保存 content）
    """
    __tablename__ = "ai_query_records"
    
    # 主键
    id = Column(Integer, primary_key=True, index=True)
    
    # 关联字段
    highlight_id = Column(Integer, ForeignKey("highlights.id", ondelete="CASCADE"), nullable=False)
    
    # 查询内容
    query_text = Column(Text, nullable=False)  # 用户查询的文本（必需）
    context_text = Column(Text, nullable=True)  # 上下文（可选）
    response_text = Column(Text, nullable=True)  # AI 返回结果（JSON 字符串，Gemini 返回的完整 JSON 格式，处理中或失败时为空）
    
    # 查询类型和提供商
    detected_type = Column(String, nullable=True)  # AI 检测到的类型（word/phrase/sentence，从 response_text 解析得到）
    provider = Column(String, nullable=False, default=get_default_ai_provider)  # AI 提供商（从 config.DEFAULT_AI_PROVIDER 获取默认值）
    
    # 状态和错误信息
    status = Column(String, default="processing", nullable=False)  # processing/completed/failed
    error_message = Column(Text, nullable=True)  # 失败时记录错误原因
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 关系映射
    highlight = relationship("Highlight", back_populates="ai_queries")
    # notes = relationship("Note", foreign_keys="Note.origin_ai_query_id")  # 反向关联，不拥有 Note
    
    # 表级约束和索引
    __table_args__ = (
        # Highlight 级别的查询索引（高频：缓存查询）
        Index('idx_highlight_query', 'highlight_id'),
        # 按状态查询（监控失败查询）
        Index('idx_query_status', 'status'),
        # 按提供商查询（数据分析）
        Index('idx_query_provider', 'provider'),
        # 按检测到的类型查询（数据分析）⭐ 新增
        Index('idx_query_detected_type', 'detected_type'),
        # 复合索引（缓存查询优化）
        Index('idx_query_highlight_status', 'highlight_id', 'status'),
        Index('idx_query_highlight_type', 'highlight_id', 'detected_type'),  # ⭐ 修改：使用 detected_type 替代 query_type
    )
    
    def __repr__(self):
        """字符串表示"""
        query_preview = f"query='{self.query_text[:20]}...'" if len(self.query_text) > 20 else f"query='{self.query_text}'"
        detected_type_str = f"detected_type='{self.detected_type}'" if self.detected_type else "detected_type=None"
        return f"<AIQueryRecord(id={self.id}, {detected_type_str}, status='{self.status}', {query_preview})>"


# ==================== 旧数据库模型（待迁移）====================



# 数据库配置（使用 SQLite）
DATABASE_URL = "sqlite:///./data/podflow.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite 需要
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    初始化数据库表
    
    创建所有表（如果不存在）。
    
    注意：
    - SQLAlchemy 的 create_all() 只会创建不存在的表，不会修改已存在的表
    - 如果需要更新表结构（添加/删除列），建议删除数据库文件后重新创建
    - 测试使用独立的内存数据库，不会影响生产数据库
    """
    Base.metadata.create_all(bind=engine)

