"""
测试 FastAPI 主应用
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    """测试根路由"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "status" in data
    assert data["status"] == "ok"


def test_health():
    """测试健康检查端点"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

