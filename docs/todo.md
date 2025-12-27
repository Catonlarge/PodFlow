#性能问题
- 字幕是异步识别的，一个音频的字幕分段被识别完了，也异步加载，先加载前3个segment的字幕，如果后面还有segment，等到用户的滚动屏幕到底部，再加载下一个字幕，不要一次性全部加载到当前页面；

#UI/UX问题
- [ ] **笔记边栏展开/收缩时字幕容器抖动问题** - 优先级 P1
  - 问题描述：当笔记边栏展开/收缩时，字幕单句容器会出现抖动：
    1. 字幕容器先超出分界线（过长）
    2. 然后收缩速度较慢
    3. 在收缩过程中有闪烁：先收缩回来，再变长，然后再收缩回去
  - 已尝试的修复：
    - 优化了左侧字幕区域和右侧笔记区域的过渡动画（0.2s）
    - 给 SubtitleRow 添加了 `overflow: 'hidden'` 和 `willChange`
    - 给字幕文本容器添加了 `minWidth: 0`（防止 flex 子元素超出容器）
    - 给英文字幕文本添加了 `wordWrap: 'break-word'` 和 `overflowWrap: 'break-word'`
  - 问题依然存在，需要进一步调查：
    - 可能是 flex 布局计算时机问题
    - 可能是浏览器重排/重绘时机问题
    - 可能需要使用 `transform` 而不是 `width` 来实现动画
    - 或者需要延迟笔记区域的显示，等字幕区域完全收缩后再显示

#功能待完善
- [x] **Task 3.7：笔记卡片组件（NoteCard）** - 优先级 P0，预计工时 6 小时 ✅ 已完成
  - 已完成内容：
    - ✅ Modal组件实现（使用Portal，支持遮罩层、ESC关闭、弹窗抖动效果）
    - ✅ 笔记卡片展示态（标题栏 + 内容区）
    - ✅ 笔记卡片编辑态（点击 edit 图标进入编辑态，点击外部提交修改）
    - ✅ 删除功能（点击垃圾桶图标弹出确认弹窗，使用通用 Modal 组件）
    - ✅ 点击笔记卡片触发双向链接（onClick回调）
    - ✅ 笔记内容排版支持（enter 换行、**语法加粗、防止 JS 注入）
    - ✅ 三状态样式（Normal/Hover/Active）
    - ✅ 测试用例完整（遵循TDD原则）
  - 完成时间：2025-12-27
  - ⚠️ **待清理**：NoteSidebar 中添加了 mock 数据用于开发调试展示效果，后续需要删除
    - 文件：`frontend/src/components/notes/NoteSidebar.jsx`
    - Mock数据位置：组件外部定义的 `mockNotes` 和 `mockHighlights` 常量
    - Mock数据使用逻辑：当没有episodeId、加载失败或数据为空时自动fallback到mock数据
    - 删除时机：Task 3.9（Note API后端）完成后，确保真实数据可以正常加载时删除

- [ ] **Task 3.8：笔记双向链接（前端集成）** - 优先级 P0，预计工时 4 小时
  - 当前状态：Task 3.6 已完成，MainLayout 中已实现回调函数占位
  - 需要实现：
    - "始终跟随划线源"逻辑（笔记卡片位置动态计算，跟随字幕滚动）
    - 双向链接逻辑（点击笔记 → 左侧字幕滚动到对应划线；点击划线 → 右侧笔记滚动到对应位置）
    - 笔记卡片闪烁效果（CSS animation）
  - 完成后：笔记与字幕的双向导航功能完整可用

- [ ] **Task 3.9：Note API（后端）** - 优先级 P0，预计工时 4 小时
  - 当前状态：前端纯划线功能（Task 3.5）已实现，但后端 Note API 还未实现
  - 临时方案：前端已适配，Note 创建失败时不影响下划线显示（Highlight 创建成功即可显示下划线）
  - 需要实现：
    - POST /api/notes - 创建笔记（支持 underline/thought/ai_card 三种类型）
    - PUT /api/notes/{id} - 更新笔记内容
    - DELETE /api/notes/{id} - 删除笔记
    - GET /api/episodes/{id}/notes - 获取某个 Episode 的所有笔记
  - 完成后：前端纯划线功能将完全正常工作，可以创建 underline 类型的 Note，NoteSidebar 可以正常加载和显示笔记数据