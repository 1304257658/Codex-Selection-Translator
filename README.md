# Codex Translation Plugin

一个轻量、独立、不调用大模型的 Codex 桌面端划词翻译插件。

> 当前处于实验阶段，仅支持 Windows。它不依赖 Codex++，也不是 Chrome 扩展。

## 功能

- 在 Codex 中选中文本后只显示“译”按钮；设置按钮仅显示在翻译弹窗中。
- 操作按钮位于选区末尾下方约两个行高，不遮挡正在阅读的后续文字。
- 默认复用 Codex 内嵌 Chromium 的 Translator API，在本机完成翻译，不调用 Codex 模型。
- 保留 Google Translate 和 Bing Translate 免 Key 网页接口。
- 本地翻译不可用时自动尝试 Bing，再尝试 Google。
- 支持自动检测源语言，并可配置目标语言。
- 首次使用某个语言组合时，Chromium 可能需要下载对应语言包。
- 注入可重复执行，同一页面只保留一个插件实例。

## 工作方式

```text
选择 Codex 中的文本
        ↓
renderer.js 显示翻译操作条
        ↓
Chromium 本地翻译（默认）
        ↓ 不可用时
Bing Web → Google Web
```

本项目通过仅监听 `127.0.0.1` 的 Chrome DevTools Protocol（CDP）向 Codex 渲染页面注入界面。本地翻译直接在 Codex 的 Chromium 渲染器中执行；Google/Bing 请求由本机 Node.js 进程发送。

## 环境要求

- Windows 10/11
- Node.js 22 或更高版本
- Codex 桌面程序能够使用 `--remote-debugging-port` 启动

本项目没有第三方 npm 运行时依赖，不需要执行 `npm install`。

## 快速开始

1. 完全退出 Codex，包括系统托盘中的后台进程。
2. 双击 `start-hook.cmd`。
3. 保持打开的控制台窗口运行。
4. 在 Codex 中选中文本，点击选区下方的“译”。

如果启动脚本无法自动定位 Codex，可手动指定程序路径：

```powershell
$env:CODEX_DESKTOP_EXE = 'C:\Program Files\WindowsApps\OpenAI.Codex_<版本>_x64__2p2nqsd0c76g0\app\ChatGPT.exe'
.\start-codex-with-hook.ps1
```

也可以自行使用以下参数启动 Codex，然后运行 `node hook.mjs`：

```text
--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

启动成功后，控制台会显示“已注入”。关闭控制台会停止翻译后端，但不会关闭 Codex。

## 翻译设置

选中文本并点击“译”打开翻译弹窗，然后点击弹窗右上角的齿轮按钮：

| 引擎 | 是否需要 Key | 说明 |
| --- | --- | --- |
| 本地翻译（推荐） | 否 | 使用 Codex 内嵌 Chromium 的 Translator API；首次使用会按需下载语言包 |
| Google Translate | 否 | 使用网页内部接口，可能返回 HTTP 429 |
| Bing Translate | 否 | 动态获取 Bing 网页的短期翻译凭证 |

设置文件位于：

```text
%APPDATA%\CodexSelectionTranslator\settings.json
```

该设置文件只保存引擎、源语言和目标语言，不保存 API Key。
从 0.3.x 升级时，旧 Key 字段会被忽略，并在下次保存设置时移除。

## 隐私与安全

- 本地引擎在 Chromium 中处理文本；选择 Google/Bing 或发生自动回退时，文本会发送给对应服务。请勿通过远程引擎翻译密码、API Key 或其他敏感信息。
- CDP 可以执行 Codex 渲染器中的 JavaScript 并读取当前页面内容。本项目将调试端口限制在 `127.0.0.1`，但本机其他进程仍可能访问它。
- 使用结束后，完全退出 Codex，再按正常方式启动即可关闭 CDP。
- 代码只请求固定的 Google 和 Bing 翻译域名，不提供任意代理能力。

## 为什么不使用 Codex 官方 Hooks？

Codex 官方 Hooks 面向会话与工具调用生命周期，例如 `PreToolUse`、`PostToolUse` 和 `SessionStart`；它们不能注册桌面端选区按钮。因此，本项目所说的 “hook” 是独立的 CDP 页面注入器，而不是官方 Hooks API。

参考资料：

- [OpenAI Codex Hooks](https://developers.openai.com/codex/hooks)
- [Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)

## 已知限制

- 某些 Microsoft Store Codex 版本可能阻止或忽略 `--remote-debugging-port`。此时独立注入器无法工作。
- Chromium Translator API 不是 OpenAI 公布的 Codex 插件接口；Codex 更新后，其可用性可能变化，因此代码会在运行时检测并回退。
- Google 和 Bing 网页接口都没有稳定性承诺，未来可能限流或改变请求格式。

## 开发

```powershell
npm run check
npm test
```

项目结构：

```text
hook.mjs                    # 本机翻译后端与 CDP 注入器
renderer.js                 # Codex 页面中的划词 UI 与设置面板
start-codex-with-hook.ps1   # Windows 启动器
start-hook.cmd              # 双击入口
tests/                      # Node.js 单元测试
```

## License

[MIT](LICENSE)
