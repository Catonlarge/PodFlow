"""
上传音频文件并触发转录的辅助脚本

用于在后端直接上传音频文件并启动转录任务。

使用方法:
    python -m app.utils.upload_audio [音频文件路径] [标题]
    或
    python backend/app/utils/upload_audio.py [音频文件路径] [标题]

示例:
    python -m app.utils.upload_audio "data/sample_audio/003.mp3" "003"
    python -m app.utils.upload_audio "D:/path/to/audio.mp3" "我的音频"

功能:
    1. 上传音频文件到后端 API
    2. 自动触发转录任务
    3. 返回 Episode ID 和访问链接
"""
import os
import sys
import requests
from pathlib import Path

# 添加 backend 目录到 Python 路径
# 从 utils 目录往上两层到 backend 目录
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

# 后端 API 地址
API_BASE_URL = "http://127.0.0.1:8000/api"


def upload_audio_file(audio_path: str, title: str = None):
    """
    上传音频文件并触发转录
    
    参数:
        audio_path: 音频文件路径（可以是绝对路径或相对于 backend 目录的相对路径）
        title: 单集标题（如果不提供，使用文件名）
    """
    # 检查文件是否存在
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")
    
    # 如果未提供标题，使用文件名（不含扩展名）
    if title is None:
        title = Path(audio_path).stem
    
    # 准备上传
    url = f"{API_BASE_URL}/episodes/upload"
    
    # 读取文件
    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
        data = {
            "title": title,
            "podcast_id": None  # 本地音频，不关联播客
        }
        
        print(f"正在上传音频文件: {audio_path}")
        print(f"标题: {title}")
        
        try:
            # 发送请求
            response = requests.post(url, files=files, data=data)
            response.raise_for_status()
            
            result = response.json()
            
            print(f"\n上传成功！")
            print(f"Episode ID: {result.get('episode_id')}")
            print(f"状态: {result.get('status')}")
            print(f"是否重复: {result.get('is_duplicate', False)}")
            
            if result.get('is_duplicate'):
                print(f"\n注意: 文件已存在，返回已有 Episode")
            else:
                print(f"\n转录任务已启动，请在 episode 页面查看进度")
            
            episode_id = result.get('episode_id')
            if episode_id:
                print(f"\n访问地址: http://localhost:5173/episodes/{episode_id}")
            
            return result
            
        except requests.exceptions.ConnectionError:
            print("\n错误: 无法连接到后端服务")
            print("请确保后端服务正在运行 (http://127.0.0.1:8000)")
            print("\n启动后端服务:")
            print("  cd backend")
            print("  .\\venv\\Scripts\\Activate.ps1")
            print("  python -m app.main")
            sys.exit(1)
        except requests.exceptions.HTTPError as e:
            print(f"\n上传失败: HTTP {e.response.status_code}")
            try:
                error_detail = e.response.json()
                print(f"错误详情: {error_detail}")
            except:
                print(f"错误详情: {e.response.text}")
            sys.exit(1)
        except Exception as e:
            print(f"\n上传失败: {e}")
            sys.exit(1)


if __name__ == "__main__":
    # 默认音频文件路径（相对于 backend 目录）
    default_audio_path = "data/sample_audio/003.mp3"
    
    # 检查命令行参数
    if len(sys.argv) > 1:
        audio_path = sys.argv[1]
        title = sys.argv[2] if len(sys.argv) > 2 else None
    else:
        # 使用默认路径
        audio_path = default_audio_path
        title = "003"
    
    # 将相对路径转换为绝对路径
    if not os.path.isabs(audio_path):
        # 相对路径：相对于 backend 目录
        audio_path = os.path.join(backend_dir, audio_path)
    
    # 执行上传
    upload_audio_file(audio_path, title)

