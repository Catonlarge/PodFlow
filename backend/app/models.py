"""
数据库模型定义
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

Base = declarative_base()


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
    source_url = Column(String, nullable=True, unique=True)  # ⭐ 添加唯一约束
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
        transcription_started_at (datetime): 开始转录时间
        transcription_completed_at (datetime): 完成转录时间
        language (str): 语言代码（默认 "en-US"）
        created_at (datetime): 创建时间
        updated_at (datetime): 更新时间（自动更新）
    
    Properties（动态计算属性）:
        show_name (str): 节目名称（从 Podcast 获取或返回 "本地音频"）
        segment_duration (int): 分段时长（从全局配置获取）
        needs_segmentation (bool): 是否需要分段（duration > segment_duration）
        total_segments (int): 总段数（ceil(duration / segment_duration)）
    
    设计要点：
        - file_hash 唯一索引：相同文件只存储一次
        - audio_path：保存到项目目录，不依赖用户原始路径
        - 删除 show_name 字段：使用 @property 动态获取（消除数据冗余）
        - 删除分段相关字段：使用全局配置 + @property（便于实验调优）
        - 删除转录状态字段：使用 @property 从 AudioSegment 聚合计算（双层设计）
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
    
    # 转录状态（时间戳，具体状态由 AudioSegment 聚合计算）
    transcription_started_at = Column(DateTime, nullable=True)
    transcription_completed_at = Column(DateTime, nullable=True)
    
    # 元数据
    language = Column(String, default="en-US", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # 关系映射
    podcast = relationship("Podcast", back_populates="episodes")
    # segments = relationship("AudioSegment", back_populates="episode", cascade="all, delete-orphan")  # 待实现
    
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
    
    def __repr__(self):
        """字符串表示"""
        return f"<Episode(id={self.id}, title='{self.title}', show_name='{self.show_name}', duration={self.duration}s)>"


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
    """初始化数据库表"""
    Base.metadata.create_all(bind=engine)

