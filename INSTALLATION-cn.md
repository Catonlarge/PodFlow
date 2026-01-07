<div id="top"></div>

# 🚀 PodFlow 安装与环境配置指南

欢迎使用 **PodFlow**！

这是一款**本地优先**的 AI 播客学习工具。它利用您电脑的显卡（GPU）进行免费的语音转文字，并使用 AI 帮助您从复杂的英文播客中提取知识。

为了让 PodFlow 在您的 Windows 电脑上顺利运行，我们需要先安装一些基础软件。请按照以下步骤逐一操作。

---

## 📋 目录 (Table of Contents)

1. [硬件要求 (关键)](#hardware)
2. [第一步：安装基础软件](#operationSys)
3. [第二步：获取项目代码](#getCode)
4. [第三步：安装依赖](#getRequirement)
5. [第四步：配置 AI 服务 (可选)](#getAIkey)
6. [第五步：一键启动](#getStart)

---

<div id="hardware"></div>

## 1. 硬件要求 (关键)

请仔细核对以下配置，这将决定软件运行的流畅度。

### 💻 1.1 显卡与显存 (GPU & VRAM)

**这是最重要的部分。** PodFlow 默认使用效果最好的 `large-v2` 模型，它对显卡有一定要求。

* **推荐显卡**：**NVIDIA RTX 3060 / 4060 / 3070 / 4070 / 5070 或更高型号**。
* **显存 (VRAM) 要求**：**建议 8GB 或以上** (最低 6GB)。
    * *说明*：如果您使用的是 **RTX 50 系列 (如 RTX 5070)**，本软件已内置专用的兼容性补丁，安装时请留意选择对应选项。


* *为什么需要这么多空间？*
    * **文字识别模型 (`large-v2`)**：加载后约占用 **4GB** 显存。
    * **说话人区分功能**：用于区分是谁在说话，额外占用约 **2GB** 显存。
    * **系统余量**：Windows 桌面显示也需要少量显存。


* *注意：如果您的显存不足 6GB，程序可能无法运行默认的高精度模型。*

### 🧠 1.2 系统内存 (System RAM)

* **建议**：**16GB 或以上**。
* *说明*：这是指电脑的“内存条”，不是显存。
    * Windows 系统本身占用约 4GB。
    * PodFlow 运行数据处理时需要约 2-3GB。
    * 为了保证您在转录时还能流畅使用浏览器、微信等软件，建议 16GB 起步。



### 💾 1.3 硬盘空间 (Disk Space)

* **建议**：预留 **10GB** 以上可用空间。
* *为什么需要这么多空间？*
    * **Python 环境与依赖库**：约 3GB。
    * **AI 模型文件**：约 3.5GB (首次运行时自动下载，含文字识别与说话人模型)。
    * **工具软件 (FFmpeg等)**：约 0.5GB。
    * **缓存预留**：建议预留 3GB 用于处理临时音频文件。



<div id="operationSys"></div>

### 🪟 1.4 操作系统

* **Windows 10** 或 **Windows 11**

---

## 2. 第一步：安装基础软件 (一次性工作)

这些软件是 PodFlow 运行的基石。如果您已经安装过某些软件，可以跳过对应步骤。

### 2.1 安装 Node.js (前端环境)

PodFlow 的界面基于现代 Web 技术构建。

1. 访问 [Node.js 官网下载页](https://nodejs.org/zh-cn/download/prebuilt-installer)。
2. 下载左侧的 **LTS (长期支持版)**。
3. 运行安装包，一路点击 "Next" 即可。
4. ⚠️ **重要避坑**：安装过程中如果出现 "Tools for Native Modules" 界面，**请不要勾选**（不要自动安装 Chocolatey 等工具），直接点击 Next。

### 2.2 安装 Python (后端环境)

PodFlow 的核心逻辑和 AI 引擎基于 Python。

1. 访问 [Python 官网](https://www.python.org/downloads/)。
2. 下载最新的 **Python 3.13** (或者 3.10 - 3.13 之间的版本)。
3. ⚠️ **非常重要**：在安装界面的第一页，**务必勾选底部的 "Add Python to PATH" (添加到环境变量)**。
4. 点击 "Install Now" 完成安装。

### 2.3 安装 Git (代码工具)

用于下载和更新 PodFlow。

1. 访问 [Git for Windows](https://git-scm.com/download/win)。
2. 下载并安装，一路点击 "Next" 使用默认设置即可。

<div id="getFFmpeg"></div>
### 2.4 安装 FFmpeg (多媒体处理工具)

这是最关键的一步，AI 需要它来处理音频文件。

1. **下载**：访问 [gyan.dev](https://www.gyan.dev/ffmpeg/builds/)，点击下载 **"ffmpeg-git-full.7z"**。
2. **解压**：解压下载的压缩包。将解压后的文件夹重命名为 `ffmpeg`，并将其移动到 C 盘根目录（例如 `C:\ffmpeg`）。
3. **配置系统变量**：
* 按键盘 `Win` 键，搜索并打开 **"编辑系统环境变量"**。
* 点击右下角的 **"环境变量"** 按钮。
* 在下方的 **"系统变量"** 列表中找到 **Path**，双击它。
* 点击右侧 **"新建"**，输入：`C:\ffmpeg\bin`
* 连续点击 **"确定"** 保存所有窗口。



---

<div id="getCode"></div>

## 3. 第二步：获取项目代码

1. 在您的电脑上找一个位置（例如 D 盘），新建一个文件夹 `PodFlow`。
2. 进入该文件夹，右键点击空白处，选择 "Open Git Bash Here" (或在地址栏输入 `cmd` 回车)。
3. 输入以下命令并回车（如果您是下载的压缩包，请直接解压到当前目录）：

```bash
git clone https://github.com/your-repo/PodFlow.git .

```

---

<div id="getRequirement"></div>

## 4. 第三步：一键安装依赖 (智能模式)

我们提供了一个全自动的智能脚本，能够自动识别硬件并一次性配置好后端（Python）和前端（Node）环境。

1. 在 `PodFlow` 根目录下，找到并双击运行 **`install-all.bat`**。
2. **选择您的硬件类型**：
脚本运行后会出现选择菜单：
* **输入 [1]**：如果您使用的是标准显卡（RTX 3060, 4060, 4070 等）。
* **输入 [2]**：如果您使用的是 **RTX 50 系列 (如 5070, 5080, 5090)** 最新显卡。



> **ℹ️ 安装过程说明 (Swap Strategy)**：
> 脚本会自动执行“先安装，后替换”的策略以确保所有依赖完整。
> 您可能会在命令行中看到它先下载了一次 PyTorch，然后卸载，再重新下载一次。
> **这是正常现象！** 请耐心等待安装完成，直到看到 "Setup Completed!" 提示。

---

<div id="configKeys"></div>

## 5. 第四步：配置 Token 与 Key (关键)

这一步至关重要。我们需要配置两个东西：

1. **Hugging Face Token** (必填)：用于激活说话人区分功能。
2. **AI API Key** (选填)：用于激活 AI 笔记与解释功能。

### 5.1 获取 Hugging Face Token (必填)

WhisperX 的“说话人区分”功能使用了 Pyannote 模型，由于开源协议要求，**您必须手动同意协议并获取 Token**，否则程序会报错。

1. **注册账号**：访问 [Hugging Face 官网](https://huggingface.co/join) 注册一个账号。
2. **签署协议 (必须完成两步)**：
* **第一步**：访问 [pyannote/segmentation](https://huggingface.co/pyannote/segmentation-3.0)，在页面上方勾选同意协议并点击 "Submit"。
* **第二步**：访问 [pyannote/speaker-diarization](https://huggingface.co/pyannote/speaker-diarization-3.1)，同样勾选并点击 "Submit"。
* *(注意：如果页面要求填写公司信息，填 "Personal" 即可)*。


3. **创建 Token**：
* 进入 [Access Tokens 设置页](https://huggingface.co/settings/tokens)。
* 点击 **"Create new token"**。
* **Type** 选择 **"Read"**，**Name** 随便填（如 `PodFlow`），点击创建。
* 复制生成的 Token（以 `hf_` 开头）。



### 5.2 填入配置文件

1. 进入 `backend` 文件夹。
2. 找到 `.env.example` 文件。
3. **复制**一份该文件，并将其**重命名**为 `.env`。
4. 用记事本打开 `.env` 文件，填入刚才获取的 Token 和您的 AI Key。

> 🛑 **【安全特别警示】请务必阅读**
>
> **您的 API Key 和 Hugging Face Token 等同于您的“银行卡密码”，请绝对保密！**
>
> 1.  **切勿公开分享**：请不要将 `.env` 文件发送给任何人，也不要将包含 Key 的界面**截图**发到任何微信群、论坛或 GitHub Issue 中。
> 2.  **严禁上传代码库**：如果您打算将项目修改后上传到 GitHub/Gitee 等平台，请务必确保 `.env` 文件**不会**被提交（项目默认的 `.gitignore` 已包含此规则，请勿修改）。
> 3.  **后果**：Key 一旦泄露，可能会被恶意脚本扫描并盗用，导致您的 AI 账户**免费额度被瞬间耗尽**，甚至**产生高额的信用卡扣费**或**账号被封禁**。

**配置示例：**

```ini
# [必填] Hugging Face Token (用于说话人区分)
# 将下方 your_huggingface_token_here 替换为您刚才复制的 hf_ 开头的字符串
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# [选填] AI 服务配置 (用于解释单词、笔记)
# 默认使用 Google Gemini (免费且好用)
DEFAULT_AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxx

# [选填] 如果您想使用 OpenAI (需要付费)
# DEFAULT_AI_PROVIDER=openai
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

```

---

<div id="getStart"></div>

## 6. 第五步：一键启动 (Start)

恭喜！所有配置已完成。

以后每次使用 PodFlow，您只需要：

👉 **双击根目录下的 `doubleClick-user.bat` 脚本。**

脚本会自动执行以下操作：

1. 启动后端 AI 服务（出现 `Uvicorn running on...` 表示成功）。
2. 启动前端界面。
3. 自动打开浏览器访问 PodFlow。

> **RTX 5070 用户请注意**：
> 启动时，程序会自动检测并应用内置的 `patch_core.py` 硬件兼容补丁。您无需手动创建文件或修改代码，直接启动即可享受加速。

---

### ❓ 常见问题 (FAQ)

**Q: 启动时报错 "Unauthorized" 或 "Model not found"？**
A: 这通常是因为 Hugging Face 配置有问题。

* 检查 `.env` 文件里的 `HF_TOKEN` 是否填对。
* **最常见原因**：您没有在 Hugging Face 网页上对 `segmentation` 和 `speaker-diarization` 这两个模型点击 **"Agree" (同意协议)**。请回到 **[5.1 节](#configKeys)** 重新操作。

**Q: 启动时提示 "ffmpeg 不是内部或外部命令"？**
A: 这是因为 FFmpeg 的环境变量没配好。请重新检查 [2.4 安装 FFmpeg](#getFFmpeg) 这一步，确保路径 `C:\ffmpeg\bin` 正确添加到了系统变量 Path 中，并且重启了电脑或终端。

**Q: 我使用的是 RTX 5070 显卡，需要特殊设置吗？**
A: 您只需要在**第三步安装依赖**时，在 `install-all.bat` 的菜单中选择 **选项 [2]** 即可。系统会自动为您配置 **RTX 50 专用适配版 (Torch 2.9.1 + CUDA 13.0)** 环境，并在运行时自动应用补丁。