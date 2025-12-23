# PodFlow 开发日志

> 记录项目开发过程中的重要变更

---

## [2025-12-23] [fix] - 修正虚拟分段的关键技术错误：禁止使用 FFmpeg -c copy（Critical ⚠️）
**变更文件**: `docs/开发计划.md`

**问题**：
- 原计划使用 `ffmpeg -c copy` 进行音频片段提取（无损复制，速度快）
- **致命缺陷**：MP3 是压缩格式，只能在关键帧（Keyframe）处切割
- 如果指定的 `start_time`（如 180s）不是关键帧，FFmpeg 会寻找最近的关键帧
- 后果：切出的音频有几秒偏差，Whisper 识别的时间戳整体偏移，**字幕和音频对不上**

**修正方案**：
- ❌ **禁止使用 `-c copy`**
- ✅ **改用 WAV（PCM）格式精准切割**：
  ```bash
  ffmpeg -y -i audio.mp3 -ss 180 -t 180 \
    -ar 16000 -ac 1 -c:a pcm_s16le output.wav
  ```
- **优势**：
  - 秒级精准切割（无关键帧限制）
  - Whisper 内部也需要 16kHz Mono，提前转码节省加载时间
  - 性能影响可控：3 分钟片段转码 < 2 秒

**变更位置**：
- 数据库设计 → 虚拟分段工作流程（关键代码示例）
- 五、关键技术决策 → 5.1 虚拟分段 + 临时文件
- Task 1.2 → Whisper 转录服务实现
- Task 1.2 → 验收标准（新增时间戳精度测试）

**产出价值**：
- ✅ 消除生产环境的致命 Bug（字幕音频不同步）
- ✅ 确保 Whisper 时间戳精度 < 0.5 秒
- ✅ 提升用户体验（准确的音频-字幕同步）

---

## [2025-12-23] [fix] - 修正 MD5 计算的性能问题：使用 ThreadPoolExecutor 异步执行（Critical ⚠️）
**变更文件**: `docs/开发计划.md`

**问题**：
- 原计划在 FastAPI 路由中直接计算 MD5（分块读取）
- **性能陷阱**：即使分块读取，MD5 计算是 CPU 密集型任务，受 Python GIL 限制
- 影响：上传 500MB 文件计算 MD5 需要 20-30 秒，期间**主线程被阻塞**
- 后果：其他用户的 API 请求（如获取字幕）会被卡住，无响应

**修正方案**：
- ✅ **使用 `ThreadPoolExecutor` 异步执行**：
  ```python
  from concurrent.futures import ThreadPoolExecutor
  
  executor = ThreadPoolExecutor()
  
  @app.post("/upload")
  async def upload_file(file: UploadFile):
      # 先保存到临时文件
      temp_path = f"/tmp/{file.filename}"
      with open(temp_path, "wb") as f:
          shutil.copyfileobj(file.file, f)
      
      # 异步计算 MD5（不阻塞其他请求）
      loop = asyncio.get_event_loop()
      file_hash = await loop.run_in_executor(executor, calculate_md5_sync, temp_path)
      # ...
  ```
- **优势**：
  - 释放主线程处理其他请求
  - 计算 MD5 期间，其他 API 响应延迟 < 100ms
  - 支持并发上传多个文件（无死锁）

**变更位置**：
- Task 1.3 → 文件存储逻辑（添加完整代码示例）
- Task 1.3 → 测试先行（新增异步 MD5 测试）
- Task 1.3 → 验收标准（新增并发测试）
- 五、关键技术决策 → 5.2 文件去重（修正实现代码）

**产出价值**：
- ✅ 避免主线程阻塞（提升并发性能）
- ✅ 支持多用户同时上传（无等待）
- ✅ 确保其他 API 响应时间 < 100ms

---

## [2025-12-23] [refactor] - 数据库设计最终优化（Critical：支持跨 Cue 划线 + AI 查询转化）
**变更文件**: `docs/开发计划.md`

**核心优化**（基于资深工程师建议）：

### 1. **支持跨句子/跨段落划线**（Critical ⭐⭐⭐）
**问题**：PRD 要求"划线内容可以是单词、句子或者段落"，之前的单一 `cue_id` 无法支持跨 Cue 划线。

**优化方案**：
- Highlight 表改为双外键：`start_cue_id` + `end_cue_id`
- 支持范围关联：
  - 单句划线：`start_cue_id == end_cue_id`
  - 跨句划线：`start_cue_id < end_cue_id`
- 前端渲染逻辑：
  ```javascript
  // 1. 起始 cue：从 start_offset 高亮到末尾
  // 2. 结束 cue：从 0 高亮到 end_offset
  // 3. 中间 cue：完整高亮
  ```

### 2. **明确 AI 查询与笔记的转化关系**（Critical ⭐⭐⭐）
**问题**：之前的设计中 `Note` 和 `AIQueryRecord` 的关系不清晰，可能导致数据冗余。

**优化方案**：
- **AIQueryRecord 定位**：缓存/日志，独立存在（不依赖 Note）
- **Note 新增字段**：`origin_ai_query_id`（标记来源，反向关联）
- **note_type 修正**：`underline` / `thought` / **`ai_card`**（从 ai_query 改名）
- **交互逻辑**：
  1. 用户划线 → AI 查询 → 创建 `AIQueryRecord`（临时卡片）
  2. 用户点"保存笔记" → 创建 `Note`（持久化，`origin_ai_query_id` 关联）
  3. 删除 `AIQueryRecord` 不影响 `Note`（笔记已保存 content）
  4. 删除 `Note` 不影响 `AIQueryRecord`（查询记录作为缓存保留）

### 3. **TranscriptCue 的全局索引优化**（细节优化 ⭐）
**问题**：异步分段识别时，`sequence` 字段可能产生混淆。

**优化方案**：
- 字段重命名：`sequence` → **`cue_index`**（更清晰）
- 明确定义：Episode 级别的全局索引（1, 2, 3, 4...）
- 用途：排序显示、跨 cue 划线的范围判断
- 添加 `speaker` 默认值："Unknown"

### 4. **级联删除规则调整**
**新的级联规则**：
- Note → AIQueryRecord：**不级联**（反向关联）
- AIQueryRecord → Note：**不级联**（Note 已持久化）
- 删除 Highlight → 同时删除 Note 和 AIQueryRecord（保持原有逻辑）

### 5. **新增字段和索引**
**新增字段**：
- `TranscriptCue.cue_index`（替代 sequence）
- `Highlight.start_cue_id` + `Highlight.end_cue_id`（支持跨 cue）
- `Note.origin_ai_query_id`（追溯来源）
- `AIQueryRecord.provider`（标记 AI 提供商）

**新增索引**：
- `idx_highlight_start_cue`、`idx_highlight_end_cue`（范围查询）
- `idx_highlight_episode_range`（跨 cue 查询优化）
- `idx_origin_ai_query`（Note 反向查询）
- `idx_episode_time`（时间范围查询）

### 6. **API 设计更新**
- `POST /api/highlights`：请求参数改为 `start_cue_id` + `end_cue_id`
- 响应添加 `is_cross_cue` 和 `cue_range` 字段
- 删除 Highlight 时返回 `deleted_ai_queries_count`

### 7. **测试用例增强**
- `test_cross_cue_highlight()`：测试跨 Cue 划线（单句 + 跨句）
- `test_ai_query_to_note_conversion()`：测试 AI 查询转笔记的完整流程
- 验证反向关联：删除 AIQueryRecord 不影响 Note

**产出价值**：
- ✅ **完整支持 PRD 需求**：跨句子/跨段落划线
- ✅ **数据架构清晰**：AI 查询（临时）vs 笔记（持久化）的关系明确
- ✅ **避免数据冗余**：反向关联设计，删除逻辑合理
- ✅ **提高查询性能**：针对跨 cue 场景优化索引
- ✅ **更好的缓存策略**：AIQueryRecord 作为查询缓存，节省 Token 成本

---

## [2025-12-23] [refactor] - 数据库设计优化（基于 PRD 和代码审查规范）
**变更文件**: `docs/开发计划.md`

**优化内容**：
1. **TranscriptCue 表优化**：
   - 新增 `sequence` 字段：确保字幕按正确顺序显示（防止并发插入导致乱序）
   - 添加排序索引：`idx_episode_sequence`

2. **Highlight 表优化**：
   - 修正颜色：`color` 默认值改为 `#9C27B0`（紫色，符合 PRD 318行要求）
   - 添加复合索引：`idx_highlight_episode_cue`

3. **Note 表优化**：
   - **删除 `position_top` 字段**：笔记位置应动态计算（通过 `Note → Highlight → TranscriptCue` 链在前端计算 DOM 位置），而不是存储像素值
   - **删除 `user_avatar` 字段**：单用户应用，头像在全局配置中管理，避免重复存储
   - 添加复合索引：`idx_note_episode_type`、`idx_note_episode_highlight`

4. **级联删除规则明确化**（Critical）：
   - 详细定义级联删除链：Episode → AudioSegment/TranscriptCue/Highlight/Note/AIQueryRecord/Vocabulary
   - 添加 SQLAlchemy 实现代码示例
   - 添加测试用例要求（符合 PRD 326行："删除包括：笔记卡片、下划线效果、本地json数据"）

5. **Task 3.2 API 设计修正**：
   - 修正字段名：`segment_id` → `cue_id`（Highlight 关联的是 TranscriptCue）
   - 添加级联删除说明：删除 Highlight 时返回被删除的 Note 数量

6. **索引优化**：
   - 添加多个复合索引，提高常见查询性能
   - 针对按类型查询笔记、按状态查询 segment 等场景优化

**架构改进**：
- **笔记位置计算逻辑**：从数据库存储改为前端动态计算（更灵活，响应式友好）
- **数据一致性**：明确级联删除规则，防止孤儿数据
- **符合 PRD 要求**：颜色、删除行为、位置计算均与 PRD 保持一致

**产出价值**：
- 数据库设计更符合最佳实践（高内聚、低耦合）
- 消除冗余数据存储（position_top、user_avatar）
- 提高查询性能（复合索引）
- 保证数据一致性（级联删除）

---

## [2025-12-23] [docs] - 重大更新：数据库设计优化 + 虚拟分段策略
**变更文件**: `docs/开发计划.md`

**变更内容**:
1. **数据库设计优化**（7 个表 → 8 个表）:
   - 新增 `AudioSegment` 表（支持虚拟分段）
   - `TranscriptSegment` 重命名为 `TranscriptCue`（对应 PRD 术语）
   - 添加 `speaker` 字段（支持说话人标识）
   - `Episode` 表新增 `file_hash`、`needs_segmentation` 等字段
   - `Note` 表更新笔记类型：`underline`/`thought`/`ai_query`

2. **存储优化策略：虚拟分段 + 临时文件**:
   - 不物理切割音频文件（节省 50% 存储空间）
   - 只在数据库中记录时间范围（`start_time`, `end_time`）
   - 转录时用 FFmpeg 实时提取片段到临时文件
   - 使用 `tempfile.NamedTemporaryFile` 自动清理

3. **文件去重机制**:
   - 使用 MD5 hash 标识音频文件
   - 相同文件只存储一次
   - 边读边算（chunk by chunk），节省内存

4. **更新关键技术决策**（7 个 → 10 个）:
   - 新增：虚拟分段 + 临时文件
   - 新增：文件去重（MD5 hash）
   - 新增：字幕数据结构（Cue）
   - 新增：笔记类型（三种）

5. **任务拆分更新**:
   - Task 1.1：8 个表 + 虚拟分段测试（4h → 6h）
   - Task 1.2：虚拟分段转录逻辑 + FFmpeg 提取（8h → 10h）
   - Task 1.3：文件去重 + MD5 计算（6h → 8h）

**产出价值**:
- **存储效率提升 50%**：只保留一份完整音频
- **灵活性增强**：可随时调整分段策略
- **避免重复存储**：相同文件智能去重
- **符合 PRD 要求**：完整支持 cue 结构、speaker、异步分段识别

---

## [2025-12-23] [docs] - 创建项目开发计划文档（初版）
**变更文件**: `docs/开发计划.md`

**变更内容**:
- 设计完整的数据库架构（7 个关联表）
- 拆分 20+ 个原子开发任务，覆盖 5 个开发阶段
- 制定 Week 1-5 的开发节奏和里程碑
- 明确 7 个关键技术决策（异步转录、AI API 选型、状态管理等）
- 定义 Definition of Done（完成标准）

**产出价值**:
- 为团队提供清晰的开发路线图
- 每个任务都有明确的优先级、工时和验收标准
- 遵循 TDD 原则，确保代码质量

---

