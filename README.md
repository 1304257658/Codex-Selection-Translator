# Codex Selection Translator

一个轻量、独立、不调用大模型的 Codex 桌面端划词翻译工具。

> 非 OpenAI 官方项目，当前处于实验阶段且仅支持 Windows。它不依赖 Codex++，也不是 Codex 官方插件或 Chrome 扩展。

## 功能

- 在 Codex 中选中文本后只显示“译”按钮；设置按钮仅显示在翻译弹窗中。
- 操作按钮位于选区末尾下方约两个行高，不遮挡正在阅读的后续文字。
- 默认复用 Codex 内嵌 Chromium 的 Translator API，在本机完成翻译，不调用 Codex 模型。
- 保留 Google Translate 和 Bing Translate 免 Key 网页接口。
- 本地翻译不可用时自动尝试 Bing，再尝试 Google。
- 支持自动检测源语言，并可配置目标语言。
- 源语言和目标语言常驻翻译弹窗，并支持一键交换语言与译文方向；齿轮设置提供翻译引擎和本地语言包管理。
- 保存设置后自动返回翻译结果；设置页也提供独立的“返回”按钮。
- 本地语言包由设置页显式下载；快速翻译栏只显示已由本工具确认安装的语言对。
- 注入可重复执行，同一页面只保留一个翻译工具实例。
- 翻译弹窗使用视口固定定位，页面滚动时保持悬浮，直到主动关闭或点击弹窗外部。
- 本地翻译和后端桥接均有超时保护，不会永久停留在“正在翻译”。
- Codex 退出后，翻译后端会在短暂重连宽限期后自动结束，不会阻塞下次快捷启动。
- 翻译代码标识符前自动拆分驼峰命名，并将连字符、下划线转换为空格，例如 `CodexSelectionTranslator` → `Codex Selection Translator`。

## 工作方式

```text
选择 Codex 中的文本
        ↓
src/renderer.js 显示翻译操作条
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

### 网络与代理

远程翻译默认直连。如果本机 `127.0.0.1:10808` 正在监听，启动器会自动让 Codex 和 Node 翻译后端使用该代理。也可以通过环境变量显式配置：

```powershell
$env:CODEX_TRANSLATOR_PROXY_URL = 'http://127.0.0.1:7890'
$env:CODEX_TRANSLATOR_CA_BUNDLE = 'C:\path\to\proxy-ca.pem'
```

项目内置公开的 `GTS Root R4` 证书，安装时会写入 `codex-ca-bundle.pem`，供 Codex 与 Node 翻译后端验证代理链路中的正常 GTS 证书。根目录中可选的 `codex-ca-bundle.pem` 仍被 Git 忽略；如果存在，安装器会用它覆盖内置证书，以支持需要私有 CA 的本机代理或 TLS 检查环境。

## 快速开始

在 PowerShell 中执行一次安装：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

安装器会把轻量启动器复制到 `%LOCALAPPDATA%\CodexSelectionTranslator`，优先复制 Codex 自带的 `resources\chatgpt-tray-light.ico`（找不到时再从 `ChatGPT.exe` 提取图标），并在桌面创建 `Codex Selection Translator` 快捷方式。之后：

1. 完全退出 Codex，包括系统托盘中的后台进程。
2. 双击桌面的 `Codex Selection Translator`。
3. 在 Codex 中选中文本，点击选区下方的“译”。

启动器在后台静默运行，不会保留控制台窗口。每次启动都会重新查询最新的 `OpenAI.Codex` 安装包及其应用清单，因此 Microsoft Store 更新 Codex 后不需要重新安装本工具。

如果静默启动失败，可查看：

```text
%LOCALAPPDATA%\CodexSelectionTranslator\launcher.log
```

### 卸载

从项目目录或安装目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall.ps1
```

卸载器会停止本工具的 Node.js 后端，并删除桌面快捷方式、启动器和翻译设置；不会卸载或关闭 Codex。

### 开发模式

开发时仍可双击 `start-hook.cmd`，以便在控制台中查看实时日志。

如果启动脚本无法自动定位 Codex，可手动指定程序路径：

```powershell
$env:CODEX_DESKTOP_EXE = 'C:\Program Files\WindowsApps\OpenAI.Codex_<版本>_x64__2p2nqsd0c76g0\app\ChatGPT.exe'
.\scripts\start-codex-with-hook.ps1
```

也可以自行使用以下参数启动 Codex，然后运行 `node .\src\hook.mjs`：

```text
--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

开发模式启动成功后，控制台会显示“已注入”。关闭控制台会停止翻译后端，但不会关闭 Codex。

## 翻译设置

选中文本并点击“译”打开翻译弹窗，然后点击弹窗右上角的齿轮按钮：

| 引擎 | 是否需要 Key | 说明 |
| --- | --- | --- |
| 本地翻译（推荐） | 否 | 使用 Codex 内嵌 Chromium 的 Translator API；语言包需要在设置页显式下载 |
| Google Translate | 否 | 使用 Chrome 字典翻译入口，支持自动识别与 POST 文本 |
| Bing Translate | 否 | 动态获取 Bing 网页的短期翻译凭证 |

### 本地语言包

打开翻译弹窗右上角的齿轮，上方的源语言和目标语言同时就是默认语言与语言包下载方向；选择尚未安装的组合时会提示先下载。齿轮可在设置和翻译界面之间往返切换。可选的“自动检测包”是 Chromium 用来提高源语言识别准确率的轻量排名模型，不包含翻译模型；未安装时本工具仍会使用轻量规则识别。下载过程中会区分“等待 Chromium 启动”“正在下载”和“下载完成，正在初始化”，不会把等待状态误报为长期 `0%`。

快速翻译栏的源语言和目标语言都会展示已确认语言对涉及的可用语言。选择一侧后，如果当前组合无效，另一侧会自动切换到可用语言；当 Chromium 确认同一语言包支持反向翻译时，本工具会自动登记双向语言对并启用交换。

Chromium 出于隐私保护不会向页面完整公开所有全局已下载语言对，因此快速翻译栏只展示通过本工具下载或重新验证成功的语言对。如果浏览器更新或清理了模型数据，可在设置中点击“重新验证翻译包”。

设置文件位于：

```text
%APPDATA%\CodexSelectionTranslator\settings.json
```

该设置文件保存翻译引擎、默认语言和已确认的本地语言包记录，不保存 API Key。
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
- Google 和 Bing 网页接口都没有稳定性承诺，未来可能限流或改变请求格式；远程请求会继承启动器配置的代理与 CA 信任设置。

## 开发

```powershell
npm run check
npm test
```

项目结构：

```text
src/
  hook.mjs                    # 本机翻译后端与 CDP 注入器
  renderer.js                # Codex 页面中的划词 UI 与设置面板
scripts/
  install.ps1                # 安装启动器并创建桌面快捷方式
  uninstall.ps1              # 删除启动器、快捷方式和设置
  start-codex-with-hook.ps1  # Windows 启动器
  launch-hidden.vbs          # 无控制台窗口的日常启动入口
assets/
  gts-root-r4.pem            # 安装时附带的公开 GTS 根证书
tests/                       # Node.js 单元测试
start-hook.cmd               # 开发模式双击入口
```

## License

[MIT](LICENSE)
