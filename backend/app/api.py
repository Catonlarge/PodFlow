"""
API 路由定义
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/test")
async def test():
    """测试路由"""
    return {"message": "API router is working"}

