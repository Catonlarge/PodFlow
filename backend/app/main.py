"""
FastAPI 应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="PodFlow API",
    description="英语学习 PodFlow 后端 API",
    version="0.1.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 默认端口
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """健康检查端点"""
    return {"message": "PodFlow API is running", "status": "ok"}


@app.get("/health")
async def health():
    """健康检查端点"""
    return {"status": "healthy"}

