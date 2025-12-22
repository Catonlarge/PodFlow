"""
pytest 测试配置文件
包含测试夹具 (Fixtures)
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
    """创建 FastAPI 测试客户端"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    # 覆盖 get_db 依赖（如果 main.py 中使用了它）
    # 注意：当前 main.py 还没有使用 get_db，所以这里先保留结构
    if hasattr(app, 'dependency_overrides'):
        app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # 清理覆盖
    if hasattr(app, 'dependency_overrides'):
        app.dependency_overrides.clear()

