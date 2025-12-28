"""
数据库迁移脚本：为 ai_query_records 表添加 detected_type 列

执行方式：
1. 激活虚拟环境：backend\venv\Scripts\Activate.ps1
2. 运行脚本：python backend/migrations/add_detected_type_column.py
"""
import sqlite3
import os
from pathlib import Path

# 获取数据库文件路径（相对于 backend 目录）
backend_dir = Path(__file__).parent.parent
db_path = backend_dir / "data" / "podflow.db"

def migrate():
    """添加 detected_type 列到 ai_query_records 表"""
    if not db_path.exists():
        print(f"数据库文件不存在: {db_path}")
        print("数据库将在首次启动时自动创建，无需手动迁移。")
        return
    
    print(f"正在连接数据库: {db_path}")
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    try:
        # 检查列是否已存在
        cursor.execute("PRAGMA table_info(ai_query_records)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'detected_type' in columns:
            print("✓ detected_type 列已存在，无需迁移")
            return
        
        # 添加 detected_type 列
        print("正在添加 detected_type 列...")
        cursor.execute("""
            ALTER TABLE ai_query_records 
            ADD COLUMN detected_type VARCHAR
        """)
        
        conn.commit()
        print("✓ 迁移成功：detected_type 列已添加")
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"✗ 迁移失败: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

