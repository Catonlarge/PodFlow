# Bug 修复日志

> 记录项目中修复的 bug 和问题

---

## [2025-01-27] [fix] - AudioPlayer 组件空格键控制和布局稳定性问题修复

**组件**: `frontend/src/components/AudioPlayer.jsx`

### 问题 1: 切换倍速后空格键失效

**问题描述**：
- 用户切换音频播放倍速后，按空格键无法控制播放/暂停
- 倍速按钮获得焦点后，空格键事件被按钮拦截

**修复方案**：
1. 使用 `ref` 存储 `handlePlayPause` 函数，确保空格键事件监听器始终使用最新版本
2. 空格键监听器在捕获阶段处理事件，优先于其他元素
3. 倍速按钮点击后自动移除焦点，避免空格键被拦截
4. 在倍速按钮上添加 `onKeyDown` 处理器，阻止空格键的默认行为

**相关代码**：
- `frontend/src/components/AudioPlayer.jsx` (第239-269行: 空格键监听器)
- `frontend/src/components/AudioPlayer.jsx` (第297-315行: 倍速切换处理)

---

### 问题 2: 音量控制和进度条拖动后空格键失效

**问题描述**：
- 用户拖动音量滑块或点击音量按钮后，按空格键无法控制播放/暂停
- 用户拖动音频进度条后，按空格键无法控制播放/暂停
- 这些交互元素获得焦点后，空格键事件被拦截

**修复方案**：
1. 在音量滑块变化处理函数中添加焦点移除逻辑
2. 在音量滑块上添加 `onMouseUp` 处理器，鼠标释放后移除焦点
3. 在音量滑块上添加 `onKeyDown` 处理器，阻止空格键的默认行为
4. 在音量按钮点击处理函数中添加焦点移除逻辑
5. 在进度条变化处理函数中添加焦点移除逻辑
6. 在进度条上添加 `onMouseUp` 和 `onKeyDown` 处理器

**相关代码**：
- `frontend/src/components/AudioPlayer.jsx` (第328-355行: 音量滑块变化处理)
- `frontend/src/components/AudioPlayer.jsx` (第357-382行: 音量按钮处理)
- `frontend/src/components/AudioPlayer.jsx` (第325-340行: 进度条变化处理)
- `frontend/src/components/AudioPlayer.jsx` (第600-631行: 音量滑块 JSX)
- `frontend/src/components/AudioPlayer.jsx` (第476-495行: 进度条 JSX)

---

### 问题 3: 倍速按钮宽度不一致导致布局漂移

**问题描述**：
- 不同倍速档位（1X、1.25X、1.5X、0.75X）的文本宽度不同
- 切换倍速时，倍速按钮宽度变化，导致前进/后退按钮、播放按钮和进度条位置左右漂移

**修复方案**：
- 设置倍速按钮的固定宽度：`width: 60px`、`minWidth: 60px`、`maxWidth: 60px`
- 确保所有倍速档位显示时宽度一致，避免布局漂移

**相关代码**：
- `frontend/src/components/AudioPlayer.jsx` (第570-587行: 倍速按钮 JSX)

---

### 问题 4: 倍速调节影响音量状态

**问题描述**：
- 每次切换倍速时，都会重置音量为初始值
- 倍速和音量逻辑耦合，导致音量状态被意外修改

**修复方案**：
1. 将 `playbackRate` 从主 `useEffect` 的依赖数组中移除
2. 创建独立的 `useEffect` 专门处理播放速度变化
3. 分离播放速度和音量逻辑，确保倍速调节不影响音量状态

**相关代码**：
- `frontend/src/components/AudioPlayer.jsx` (第95-181行: 主 useEffect，移除 playbackRate 依赖)
- `frontend/src/components/AudioPlayer.jsx` (第184-189行: 独立的 playbackRate useEffect)

---

### 问题 5: 前进和后退按钮逻辑与图标位置不匹配

**问题描述**：
- 前进按钮（在播放按钮前面）执行的是后退逻辑
- 后退按钮（在播放按钮后面）执行的是前进逻辑
- 图标位置正确，但关联的逻辑相反

**修复方案**：
- 交换前进和后退按钮的 `onClick` 处理函数
- 前进按钮现在使用 `handleRewind`（后退15秒）
- 后退按钮现在使用 `handleForward`（前进30秒）
- 保持图标位置不变

**相关代码**：
- `frontend/src/components/AudioPlayer.jsx` (第497-511行: 前进按钮 JSX)
- `frontend/src/components/AudioPlayer.jsx` (第531-545行: 后退按钮 JSX)

---

### 测试用例补充

**组件**: `frontend/src/components/__tests__/AudioPlayer.test.jsx`

**新增测试用例**：
1. 初始状态下按空格键应该可以播放
2. 切换倍速后空格键应该仍然正常工作（暂停状态）
3. 切换倍速后空格键应该仍然正常工作（播放状态）
4. 多次切换倍速后空格键应该仍然正常工作
5. 切换倍速后播放/暂停按钮应该仍然正常工作
6. 前进按钮应该在后退按钮之前（位置正确）
7. 静音时音量控制面板宽度应该保持不变
8. 更新了前进和后退按钮的测试用例以匹配新的逻辑

**相关代码**：
- `frontend/src/components/__tests__/AudioPlayer.test.jsx` (第93-133行: 初始状态空格键测试)
- `frontend/src/components/__tests__/AudioPlayer.test.jsx` (第1030-1140行: 倍速相关空格键测试)
- `frontend/src/components/__tests__/AudioPlayer.test.jsx` (第837-861行: 按钮位置测试)
- `frontend/src/components/__tests__/AudioPlayer.test.jsx` (第460-490行: 音量控制面板宽度测试)

---

**测试结果**：
- ✅ 44 个测试通过
- ⏭️ 5 个测试跳过（收缩功能相关，更适合集成测试）
- ✅ 无 lint 错误

**提交信息**：
```
fix: fix spacebar control and layout stability issues in audio player
Commit: 4945024
```

