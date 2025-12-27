#性能问题
- 字幕是异步识别的，一个音频的字幕分段被识别完了，也异步加载，先加载前3个segment的字幕，如果后面还有segment，等到用户的滚动屏幕到底部，再加载下一个字幕，不要一次性全部加载到当前页面；

#功能待完善
- [ ] **Task 3.9：Note API（后端）** - 优先级 P0，预计工时 4 小时
  - 当前状态：前端纯划线功能（Task 3.5）已实现，但后端 Note API 还未实现
  - 临时方案：前端已适配，Note 创建失败时不影响下划线显示（Highlight 创建成功即可显示下划线）
  - 需要实现：
    - POST /api/notes - 创建笔记（支持 underline/thought/ai_card 三种类型）
    - PUT /api/notes/{id} - 更新笔记内容
    - DELETE /api/notes/{id} - 删除笔记
    - GET /api/episodes/{id}/notes - 获取某个 Episode 的所有笔记
  - 完成后：前端纯划线功能将完全正常工作，可以创建 underline 类型的 Note