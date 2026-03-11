# 麟雫雫的本地桌面工具箱 (Local Desktop Toolbox)

一个基于 Python FastAPI 和 Web 前端技术构建的轻量级、便携式桌面工具箱。本项目集成了日常实用工具与本地语音转文字能力，采用内置 Python 环境设计，开箱即用，无需繁琐的环境配置。

*注意！本项目几乎全部由Google Gemini 3.1 Pro进行Coding，可能存在大量屎山代码*

## 核心功能 (Features)

* **应用启动器 (App Launcher)**：集中管理并快速启动常用桌面应用程序
* **待办事项 (To-Do List)**：可折叠和移动
* **本地语音转文字 (Voice-to-Text)**：集成了 **FasterWhisper** 模型，支持cpu和cuda推理
* **动态壁纸 (Live2D Wallpaper)**：支持自定义mp4或moc2和moc3格式的Live2D动态桌面壁纸，可在静态、动态、live2d壁纸间切换
* **本地文件快捷 (Local Search)**：搜索调用本地everything进行搜索，需要everything处于运行状态

## 💻 技术栈 (Tech Stack)

* **后端 (Backend)**: Python, FastAPI
* **前端 (Frontend)**: HTML5, CSS3, JavaScript
* **AI 引擎**: FasterWhisper (本地语音识别)

## 安装与运行 (Getting Started)

得益于便携式的设计，本项目无需你在电脑上全局安装 Python 或各种依赖库。

1. **克隆仓库 / 下载源码**:
```bash
git clone [https://github.com/linnana-raiza/linnana-toolbox.git)
```
2. **运行**
双击`start.bat`即可运行

## 其他建议
live2d可前往[Live2d-model](https://github.com/Eikanya/Live2d-model)下载
