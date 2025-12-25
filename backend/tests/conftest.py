"""
pytest 测试配置文件
包含测试夹具 (Fixtures)

测试数据库隔离策略：
- 使用独立的内存数据库（:memory:），完全隔离于生产数据库
- 每个测试函数都会重新创建和清理数据库（scope="function"）
- 通过依赖覆盖（dependency_overrides）确保 FastAPI 路由使用测试数据库
- 通过 Mock 避免启动时状态清洗在生产数据库上执行

重要：所有测试必须使用 db_session fixture，不要直接使用生产数据库的 SessionLocal
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, get_db


# 创建测试数据库（内存数据库，完全独立于生产数据库）
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# 启用 SQLite 外键约束（Critical for CASCADE and SET NULL）
@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """为每个新连接启用外键约束"""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine
)


@pytest.fixture(scope="function")
def db_session():
    """创建测试数据库会话"""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """
    创建 FastAPI 测试客户端
    
    注意：
    - Mock lifespan 以避免在测试时实际加载模型（耗时且需要 GPU）
    - 覆盖 get_db 依赖以使用测试数据库
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    # Mock lifespan 以避免实际加载模型和启动时状态清洗
    # 注意：TestClient 会自动处理 lifespan，但我们可以通过 patch 跳过实际加载
    # 同时 mock 启动时状态清洗逻辑，避免在测试数据库上执行（测试数据库可能没有正确的表结构）
    with patch('app.main.apply_rtx5070_patches'), \
         patch('app.main.WhisperService.load_models'), \
         patch('app.main.SessionLocal') as mock_session_local:
        # Mock SessionLocal 以避免启动时状态清洗在测试数据库上执行
        # 测试数据库的表结构可能不完整，会导致错误
        mock_session_local.return_value = db_session
        
        # 覆盖 get_db 依赖
        app.dependency_overrides[get_db] = override_get_db
        
        with TestClient(app) as test_client:
            yield test_client
        
        # 清理覆盖
        app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def real_audio_file():
    """
    提供真实音频文件路径（用于集成测试）
    
    文件路径：D:\programming_enviroment\learning-EnglishPod3\backend\data\sample_audio\Figma-CEO-Why-AI-makes-design.mp3
    注意：sample_audio 目录用于存放测试示例音频，与实际上传文件的 audios 目录区分
    """
    from pathlib import Path
    audio_path = Path(r"D:\programming_enviroment\learning-EnglishPod3\backend\data\sample_audio\Figma-CEO-Why-AI-makes-design.mp3")
    
    if not audio_path.exists():
        pytest.skip(f"真实音频文件不存在: {audio_path}")
    
    return str(audio_path)