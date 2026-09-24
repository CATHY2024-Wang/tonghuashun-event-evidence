# 演示视频

主交付：`event_evidence_demo.mp4`，**139.48 秒**，1440×900，H.264 视频与 AAC 中文讲解音频；`event_evidence_demo.webm` 是原始页面录屏。2026-09-24 12:20–12:23（北京时间）录制与转码。

视频访问公开 URL `https://event-evidence-cathy-2026.jscsjeremy.chatgpt.site`，由 Playwright 驱动本机 Chrome 在全新无 Cookie BrowserContext 中实际点击。未向产品注入业务数据；只清除该隔离上下文的 localStorage，使演示从初始状态开始。页面中的中文讲解字幕由录制脚本叠加，MP4 的讲解配音由 Windows 内置 Huihui Desktop 语音合成；二者仅用于解释录屏，不代表产品功能。

本次录制在服务器已配置 DeepSeek Secret 的公开站点上进行，页面实际显示 **DeepSeek 在线抽取、5 条主张**，并建议归入华鲲振宇事件；用户在画面中核对并点击该归属。整个操作展示另一件倍特期货事件、4 月 18 日历史回放、GS-05 四种时间、导入 GS-06、状态变化、站内通知、NEWS-03 转引与逐条主张。资料包截止 2024-04-19，不表示已核验今天的最新事实。

视频展示的是核心事件核查链路。后来加入的巨潮深市公告候选检索未出现在这段录屏中；评委可在当前公开产品点击「发现候选公告」实际操作，按 README 的检索边界核对结果。

## 复现录制

1. 在项目根目录运行 `npm install --prefix demo playwright`。
2. 设置 `PLAYWRIGHT_BROWSERS_PATH` 为 `demo/ms-playwright`，运行 `demo/node_modules/.bin/playwright install ffmpeg`。Windows PowerShell 示例：`$env:PLAYWRIGHT_BROWSERS_PATH='C:\E-user\tonghuashun03\demo\ms-playwright'; demo\node_modules\.bin\playwright.cmd install ffmpeg`。
3. 运行 `node demo/record_demo.mjs`。脚本会根据真实抽取结果显示“DeepSeek 在线抽取”或降级说明，保存 WebM。`FAST=1` 只供交互检查，短片不可提交。
4. 运行 `demo/make_narration.ps1` 生成系统语音。安装 `imageio-ffmpeg` 到 `demo/pydeps` 后运行 `demo/mux_video.ps1`，生成带音频的 MP4。本次配音文案依据上述实际在线抽取结果编写；重录若模型结果变化，应先调整配音。
