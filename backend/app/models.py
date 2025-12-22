"""
数据库模型定义
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

Base = declarative_base()


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

