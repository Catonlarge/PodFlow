<div id="top"></div>

# 🎧 PodFlow

**Breaking the Information Gap: A Local-First AI Workbench for Intensive Podcast Learning.**  
**打破信息差：一款本地优先、零边际成本的 AI 播客精听与知识管理工具。**

[English](#english) | [中文](#chinese)

---

<div id="chinese"></div>

## 🇨🇳 中文介绍

### 💡 为什么开发 PodFlow？(The "Why")

在 AI 时代，海外有着大量高质量的科技与商业播客（Podcast），它们是获取前沿认知的重要渠道。然而，对于非英语母语的学习者来说，吸收这些内容存在巨大的**信息摩擦**：

1. **听不懂/跟不上**：专业词汇密集，语速过快，直接听非常吃力。
2. **记不住/无法结构化**：听播客通常是线性的，听完即忘，很难像阅读书籍那样进行“划线”或“做笔记”。
3. **转录成本高昂**：现有的云端转录服务通常**按分钟计费**。

**PodFlow 旨在解决上述痛点。** 它是一个**英文播客精听工作台**。它遵循 **本地优先 (Local-First)** 原则，利用你本地硬件，将英文长音频转录为可本地储存的字幕，还可以划线、AI查询、写想法，生成跟随音频的笔记卡片。

### ✨ 核心特性

* **💰 离线转录，零边际成本**
* **重资产本地化**：最为昂贵、耗时的“语音转文字”环节，集成 **WhisperX** 模型，支持调用本地显卡 (GPU) 运行，实现50X-70X转录速度。

* **🧠 AI 上下文查询**
* **轻量级云端智能**：遇到不懂的术语，选中即可查询。利用**商业大模型 API**（如 DeepSeek, OpenAI 等）的强大推理能力，根据播客上下文提供精准释义。
* *注：此功能需填入您自己的 API Key（Bring Your Own Key）。因查询 token 消耗极低，且按需调用，成本可控。配置方法详见安装文档。*

* **📝 沉浸式“双屏”学习体验**
* **视听同步**：左侧展示精准的时间戳逐字稿，点击任意句子即可跳转音频。
* **笔记联动**：右侧为笔记区域。支持对字幕进行划线、AI查询并生成笔记卡片，笔记卡片会自动挂载到对应的时间点上，形成“音频-字幕-笔记”的双向链接。


* **🚧 工程标准与开发状态**
* **架构设计**：后端基于 FastAPI，前端基于 React + Vite。
* **开发状态**：本项目目前处于 **Alpha 开发阶段**，Bug 在所难免，功能也尚在完善中。

### 📚 快速上手

由于本项目涉及 PyTorch、CUDA（GPU 加速）环境配置，以及 API Key 的设置，为了保证您的部署体验，我们将详细指南独立整理。

👉 **请阅读：[TODO安装与环境配置指南 (Installation Guide)**](https://www.google.com/search?q=docs/INSTALL.md)
*(包含针对 RTX 5070 等新硬件的兼容性说明，以及 AI API 的配置教程)*

---

<div id="english"></div>

[⬆️ back to top](#top)

## English Introduction

### 💡 The Problem & The Solution

High-quality podcasts are a goldmine of knowledge, but for non-native English speakers or deep learners, consuming them is often inefficient:

1. **The Comprehension Gap:** Complex vocabulary and fast pacing make "casual listening" insufficient for learning.
2. **The Retention Gap:** Audio is linear and fleeting. It's hard to highlight, annotate, or structure thoughts while listening.
3. **The Cost Barrier:** Cloud-based transcription services charge **by the minute**. For avid listeners who consume hours of content weekly, these recurring fees discourage deep engagement.

**PodFlow** is designed to bridge these gaps. It is a **Local-First Workbench for Intensive Learning**. By leveraging on-device AI, it transforms audio into a structured, navigable, and interactive knowledge base.

### ✨ Key Features

* **💰 Offline Transcription, Zero Marginal Cost**
* **Local Heavy Lifting:** The expensive and computation-heavy task of "Speech-to-Text" is handled locally by **WhisperX** using your own GPU.
* Process unlimited hours of audio without paying per minute.


* **🧠 AI Context Lookup **
* **Cloud-Powered Intelligence:** Highlight any text to trigger explanations. We use lightweight calls to **Commercial APIs** (e.g., DeepSeek, OpenAI) to provide context-aware definitions.
* *Note: This feature requires your own API Key (Bring Your Own Key). Usage is on-demand and extremely low-cost. Configuration steps are in the Installation Guide.*


* **📝 Dual-Pane Interactive UI**
* **Synchronized Experience:** Transcript on the left, notes on the right. Click any sentence to jump to that exact moment in the audio.
* **Deep Linking:** Highlights and notes are anchored to specific timestamps, creating a permanent link between your insights and the source audio.


* **🚧 Engineering & Status**
* **Architecture**: Built with Python (FastAPI) and React.
* **Development Status**: This project is currently in **Alpha**. While we use **Test-Driven Development (TDD)** principles to maintain code quality, please **expect bugs and rough edges**. It is an experimental tool for developers and early adopters, not yet a polished commercial product.


[⬆️ back to top](#top)

### 📚 Getting Started

Because PodFlow leverages local hardware acceleration (PyTorch/CUDA) and requires API configuration, the setup process is detailed separately.

👉 **Please read: [TODO Installation & Configuration Guide**](https://www.google.com/search?q=docs/INSTALL.md)
*(Includes specific compatibility notes for newer hardware like RTX 5070 and API Key setup instructions)*

---

### 📄 License

This project is licensed under the MIT License.