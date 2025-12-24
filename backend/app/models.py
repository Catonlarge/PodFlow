"""
数据库模型定义
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, ForeignKey
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
    
    # 关系映射（后续添加 Episode 模型后启用）
    # episodes = relationship("Episode", back_populates="podcast")
    
    def __repr__(self):
        """字符串表示"""
        return f"<Podcast(id={self.id}, title='{self.title}')>"


# ==================== 旧数据库模型（待迁移）====================


class Lesson(Base):
    """课程模型"""
    __tablename__ = "lessons"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    audio_path = Column(String)
    transcript = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Note(Base):
    """笔记模型"""
    __tablename__ = "notes"
    
    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, index=True)
    content = Column(Text)
    timestamp = Column(Float)  # 音频时间戳
    created_at = Column(DateTime, default=datetime.utcnow)


class Vocabulary(Base):
    """生词模型"""
    __tablename__ = "vocabulary"
    
    id = Column(Integer, primary_key=True, index=True)
    word = Column(String, index=True)
    definition = Column(Text)
    lesson_id = Column(Integer, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


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

