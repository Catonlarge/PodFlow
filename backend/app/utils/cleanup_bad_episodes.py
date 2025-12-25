"""
清理坏文件和数据库脏数据脚本

用于清理那些伪装成音频文件的文本文件（如 HTML、JSON、纯文本）及其数据库记录。

使用方法:
    python -m app.utils.cleanup_bad_episodes
    或
    python backend/app/utils/cleanup_bad_episodes.py

功能:
    1. 检查指定的坏文件哈希
    2. 从数据库中删除对应的 Episode 记录（级联删除关联数据）
    3. 删除坏文件
    4. 输出详细的清理日志
"""

import os
import sys
from pathlib import Path
from typing import Tuple

# 添加 backend 目录到 Python 路径
# 从 utils 目录往上两层到 backend 目录
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session
from app.models import get_db, Episode
from app.config import AUDIO_STORAGE_PATH


def check_file_content(file_path: str) -> Tuple[bool, str]:
    """
    检查文件内容，判断是否为坏文件（文本文件伪装成音频）
    
    参数:
        file_path: 文件路径
        
    返回:
        tuple[bool, str]: (是否为坏文件, 文件内容预览)
    """
    try:
        with open(file_path, 'rb') as f:
            header = f.read(100)
        
        # 尝试解码为文本
        try:
            text_preview = header.decode('utf-8', errors='ignore').strip()[:50]
            # 检查是否为明显的文本内容
            if any(text_preview.startswith(prefix) for prefix in ['fake audio', '<!DO', '<htm', '{', '[', 'Traceback']):
                return True, text_preview
        except:
            pass
        
        # 检查文件大小（通常文本文件较小）
        file_size = os.path.getsize(file_path)
        if file_size < 100 * 1024:  # 小于 100KB 可能是测试/假文件
            return True, f"文件过小 ({file_size} bytes)，可能是测试文件"
        
        return False, ""
    except Exception as e:
        return True, f"读取文件失败: {e}"


def cleanup_bad_episode_by_hash(db: Session, file_hash: str, dry_run: bool = False) -> dict:
    """
    根据 file_hash 清理坏 Episode 及其文件
    
    参数:
        db: 数据库会话
        file_hash: 文件的 MD5 哈希值
        dry_run: 是否为干运行（只检查不删除）
        
    返回:
        dict: 清理结果统计
    """
    result = {
        "file_hash": file_hash,
        "episode_found": False,
        "episode_id": None,
        "file_found": False,
        "file_path": None,
        "file_is_bad": False,
        "deleted": False,
        "errors": []
    }
    
    # 1. 查找 Episode
    episode = db.query(Episode).filter(Episode.file_hash == file_hash).first()
    if episode:
        result["episode_found"] = True
        result["episode_id"] = episode.id
        result["file_path"] = episode.audio_path
        
        # 2. 检查文件是否存在
        if episode.audio_path and os.path.exists(episode.audio_path):
            result["file_found"] = True
            
            # 3. 检查文件内容是否为坏文件
            is_bad, preview = check_file_content(episode.audio_path)
            result["file_is_bad"] = is_bad
            result["file_content_preview"] = preview
            
            if not dry_run:
                # 4. 删除文件
                try:
                    os.unlink(episode.audio_path)
                    result["file_deleted"] = True
                except Exception as e:
                    result["errors"].append(f"删除文件失败: {e}")
                
                # 5. 删除数据库记录（级联删除关联数据）
                try:
                    db.delete(episode)
                    db.commit()
                    result["episode_deleted"] = True
                    result["deleted"] = True
                except Exception as e:
                    db.rollback()
                    result["errors"].append(f"删除数据库记录失败: {e}")
        else:
            # 文件不存在，只删除数据库记录
            if not dry_run:
                try:
                    db.delete(episode)
                    db.commit()
                    result["episode_deleted"] = True
                    result["deleted"] = True
                except Exception as e:
                    db.rollback()
                    result["errors"].append(f"删除数据库记录失败: {e}")
    else:
        # Episode 不存在，但可能文件还存在
        # 尝试根据哈希值构造文件名查找
        storage_path = Path(AUDIO_STORAGE_PATH)
        possible_files = list(storage_path.glob(f"{file_hash}.*"))
        if possible_files:
            result["file_found"] = True
            result["file_path"] = str(possible_files[0])
            
            is_bad, preview = check_file_content(result["file_path"])
            result["file_is_bad"] = is_bad
            result["file_content_preview"] = preview
            
            if not dry_run:
                try:
                    os.unlink(result["file_path"])
                    result["file_deleted"] = True
                    result["deleted"] = True
                except Exception as e:
                    result["errors"].append(f"删除文件失败: {e}")
    
    return result


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="清理坏文件和数据库脏数据")
    parser.add_argument(
        "--hash",
        type=str,
        default="1d19be0e36c5d1247bfb4fe41277aa75",
        help="要清理的文件哈希值（默认: 1d19be0e36c5d1247bfb4fe41277aa75）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="干运行模式（只检查不删除）"
    )
    parser.add_argument(
        "--all-bad",
        action="store_true",
        help="扫描并清理所有坏文件（基于文件内容检测）"
    )
    
    args = parser.parse_args()
    
    print("=" * 80)
    print("PodFlow - 坏文件清理脚本")
    print("=" * 80)
    print()
    
    if args.dry_run:
        print("⚠️  干运行模式：只检查不删除")
        print()
    
    # 获取数据库会话
    db_gen = get_db()
    db = next(db_gen)
    
    try:
        if args.all_bad:
            # 扫描所有文件
            print("📂 扫描所有音频文件...")
            storage_path = Path(AUDIO_STORAGE_PATH)
            all_files = list(storage_path.glob("*.*"))
            print(f"   找到 {len(all_files)} 个文件")
            print()
            
            bad_files = []
            for file_path in all_files:
                is_bad, preview = check_file_content(str(file_path))
                if is_bad:
                    # 获取文件哈希（从文件名）
                    file_hash = file_path.stem
                    bad_files.append((file_hash, str(file_path), preview))
            
            if not bad_files:
                print("✅ 未发现坏文件")
                return
            
            print(f"⚠️  发现 {len(bad_files)} 个可能的坏文件:")
            for file_hash, file_path, preview in bad_files:
                print(f"   - {file_hash}: {preview}")
            print()
            
            if not args.dry_run:
                confirm = input("确认删除以上文件？(yes/no): ")
                if confirm.lower() != "yes":
                    print("❌ 已取消")
                    return
            
            # 清理所有坏文件
            for file_hash, file_path, preview in bad_files:
                result = cleanup_bad_episode_by_hash(db, file_hash, dry_run=args.dry_run)
                print_result(result)
        else:
            # 清理指定哈希的文件
            print(f"🔍 查找文件哈希: {args.hash}")
            print()
            
            result = cleanup_bad_episode_by_hash(db, args.hash, dry_run=args.dry_run)
            print_result(result)
    
    finally:
        db.close()
    
    print()
    print("=" * 80)
    print("清理完成")
    print("=" * 80)


def print_result(result: dict):
    """打印清理结果"""
    print(f"📋 清理结果 (hash: {result['file_hash']}):")
    print(f"   - Episode 是否存在: {'是' if result['episode_found'] else '否'}")
    if result['episode_id']:
        print(f"   - Episode ID: {result['episode_id']}")
    print(f"   - 文件是否存在: {'是' if result['file_found'] else '否'}")
    if result['file_path']:
        print(f"   - 文件路径: {result['file_path']}")
    if result.get('file_is_bad'):
        print(f"   - 文件内容预览: {result.get('file_content_preview', 'N/A')}")
    
    if result['deleted']:
        print("   ✅ 已删除")
    elif result['episode_found'] or result['file_found']:
        print("   ⚠️  未删除（可能是干运行模式或删除失败）")
    else:
        print("   ℹ️  未找到相关记录或文件")
    
    if result['errors']:
        print("   ❌ 错误:")
        for error in result['errors']:
            print(f"      - {error}")
    print()


if __name__ == "__main__":
    main()

