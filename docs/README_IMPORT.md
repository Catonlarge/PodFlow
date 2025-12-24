# 快速导入音频和字幕数据

本文档说明如何使用手动导入脚本快速验证数据库模型，无需实现 Whisper 转录服务。

---

## 📋 准备工作

### 1. 安装依赖

```bash
# 进入 backend 目录
cd backend

# 激活虚拟环境（如果还没激活）
.\venv\Scripts\Activate.ps1

# 安装 mutagen（用于读取音频元数据）
pip install mutagen
```

### 2. 准备文件

你需要准备两个文件：

#### 音频文件
- 支持格式：MP3, WAV, M4A, OGG 等常见格式
- 路径示例：`D:\path\to\your\audio.mp3`

#### 字幕 JSON 文件
- 格式必须符合 PRD 要求（见下方示例）
- 路径示例：`D:\path\to\your\transcript.json`

---

## 📝 字幕 JSON 格式

字幕文件必须是 JSON 格式，包含一个 `cues` 数组：

```json
{
  "cues": [
    {
      "start": 0.28,
      "end": 2.22,
      "speaker": "Lenny",
      "text": "Thank you so much for joining us today."
    },
    {
      "start": 2.5,
      "end": 5.8,
      "speaker": "Guest",
      "text": "I'm really excited to be here."
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `start` | Number | ✅ | 开始时间（秒） |
| `end` | Number | ✅ | 结束时间（秒） |
| `text` | String | ✅ | 字幕文本 |
| `speaker` | String | ❌ | 说话人名称（可选，默认 "Unknown"） |

### 示例文件

项目提供了一个示例文件：`backend/data/sample_transcript.json`

---

## 🚀 使用方法

### 基础用法（本地音频）

```bash
# 从 backend 目录运行
cd backend
python -m app.services.import_test_data \
  --audio "D:\path\to\audio.mp3" \
  --transcript "D:\path\to\transcript.json"
```

### 关联播客

```bash
python -m app.services.import_test_data \
  --audio "D:\path\to\audio.mp3" \
  --transcript "D:\path\to\transcript.json" \
  --podcast "Lenny's Podcast"
```

### 自定义单集标题

```bash
python -m app.services.import_test_data \
  --audio "D:\path\to\audio.mp3" \
  --transcript "D:\path\to\transcript.json" \
  --podcast "Lenny's Podcast" \
  --title "EP001: How to Build a Great Product"
```

### 不创建 AudioSegment（仅导入字幕）

```bash
python -m app.services.import_test_data \
  --audio "D:\path\to\audio.mp3" \
  --transcript "D:\path\to\transcript.json" \
  --no-segment
```

---

## ✅ 验证导入结果

### 方法 1：运行测试

```bash
# 运行导入功能的测试
pytest tests/test_import_data.py -v

# 验证所有数据模型（包括导入的数据）
pytest tests/test_models_new.py -v
```

### 方法 2：使用 SQLite 客户端

推荐使用 [DB Browser for SQLite](https://sqlitebrowser.org/)：

1. 打开 `backend/data/podflow.db`
2. 查看各表数据：
   - `episodes` - 音频文件信息
   - `transcript_cues` - 字幕数据
   - `audio_segments` - 虚拟分段（如果创建了）

### 方法 3：Python 脚本查询

```python
from app.database import SessionLocal
from app.models import Episode, TranscriptCue

db = SessionLocal()

# 查询所有 Episode
episodes = db.query(Episode).all()
for ep in episodes:
    print(f"Episode {ep.id}: {ep.title}")
    print(f"  - 时长: {ep.duration:.1f} 秒")
    print(f"  - 字幕数: {len(ep.transcript_cues)}")
    print(f"  - 需要分段: {ep.needs_segmentation}")
    print(f"  - 总段数: {ep.total_segments}")

# 查询某个 Episode 的字幕
episode_id = 1
cues = db.query(TranscriptCue).filter(
    TranscriptCue.episode_id == episode_id
).order_by(TranscriptCue.cue_index).all()

for cue in cues[:5]:  # 只显示前 5 条
    print(f"[{cue.cue_index}] {cue.speaker}: {cue.text}")

db.close()
```

---

## 🔍 常见问题

### Q: 音频时长显示为 0.0 秒？
A: `mutagen` 库无法读取该音频格式的元数据。脚本会使用字幕的最后一个 cue 的 `end` 时间作为音频时长。

### Q: 重复导入相同音频会怎样？
A: 脚本会检测 `file_hash`（MD5），如果已存在，会拒绝导入并提示已有的 Episode ID。

### Q: 为什么要创建 AudioSegment？
A: AudioSegment 是虚拟分段设计的核心，用于：
- 测试短音频（单段）和长音频（多段）的处理逻辑
- 验证 TranscriptCue 与 AudioSegment 的关联
- 为后续实现 Whisper 转录服务做准备

### Q: 字幕 JSON 的 speaker 字段必须提供吗？
A: 不必须。如果省略，会自动设置为 "Unknown"。

### Q: 导入失败，数据库会回滚吗？
A: 会。脚本使用数据库事务，如果任何步骤失败，所有更改都会回滚，不会留下不完整的数据。

---

## 🎯 下一步

导入成功后，你可以：

1. **继续开发 Task 1.2**（Whisper 转录服务）
   - 实现真实的音频转录功能
   - 替换手动导入脚本

2. **开始前端开发**（Task 2.1-2.3）
   - 使用导入的真实数据开发播放器和字幕组件
   - 验证 UI 交互

3. **测试划线和笔记功能**
   - 在导入的字幕上创建 Highlight
   - 测试 Note 的创建和关联

---

## 📚 参考文档

- [开发计划](../../docs/开发计划.md)
- [PRD 文档](../../docs/prd.md)
- [数据库设计](../../docs/开发计划.md#一数据库设计方案)

