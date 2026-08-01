# 架构方向

DeskCat 分成两个边界清晰的部分：

- **桌宠运行时**：Electron + TypeScript，负责透明窗口、输入、状态机、逐帧播放和本地宠物包管理。运行时离线、轻量，不依赖生成模型。
- **宠物工坊**：独立 React 窗口与主进程任务服务。`IdentityAnalyzer` 和 `ImageGenerator` 可分别选择 OpenAI、Gemini、通义或本地分析器；ComfyUI 是可选高级后端。所有输出必须走同一 Python 后处理与 PetManifest v2 校验协议。

这种划分允许开源用户替换生成后端，同时避免密钥进入 renderer 或导出包。AI 负责语义创作，本地代码负责帧数、透明度、脚点、尺寸和打包，生成失败不会伪装为成功。
