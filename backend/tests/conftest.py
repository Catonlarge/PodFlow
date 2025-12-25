"""
pytest 测试配置文件
包含测试夹具 (Fixtures)
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, get_db


# 创建测试数据库（内存数据库）
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
    
    # Mock lifespan 以避免实际加载模型
    # 注意：TestClient 会自动处理 lifespan，但我们可以通过 patch 跳过实际加载
    with patch('app.main.apply_rtx5070_patches'), \
         patch('app.main.WhisperService.load_models'):
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
    
    文件路径：D:\programming_enviroment\learning-EnglishPod3\backend\data\audio\Figma-CEO-Why-AI-makes-design.mp3
    """
    from pathlib import Path
    audio_path = Path(r"D:\programming_enviroment\learning-EnglishPod3\backend\data\audio\Figma-CEO-Why-AI-makes-design.mp3")
    
    if not audio_path.exists():
        pytest.skip(f"真实音频文件不存在: {audio_path}")
    
    return str(audio_path)
