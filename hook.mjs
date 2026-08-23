import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_PATH = path.join(ROOT, "renderer.js");
const CDP_PORT = Number(process.env.CODEX_TRANSLATOR_CDP_PORT || 9222);
const BINDING_NAME = "codexTranslatorBridge";
const SETTINGS_DIR = path.join(
  process.env.APPDATA || path.join(homedir(), ".config"),
  "CodexSelectionTranslator",
);
const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");

export const DEFAULT_SETTINGS = Object.freeze({
  engine: "local",
  sourceLanguage: "auto",
  targetLanguage: "zh-CN",
});

const ALLOWED_ENGINES = new Set(["local", "google", "bing"]);
const ALLOWED_LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?$/;

export function normalizeTranslationText(text = "") {
  const normalized = String(text)
    .replace(/[-_]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || String(text).trim();
}

export function normalizeSettings(value = {}, current = DEFAULT_SETTINGS) {
  const engine = ALLOWED_ENGINES.has(value.engine)
    ? value.engine
    : ALLOWED_ENGINES.has(current.engine) ? current.engine : DEFAULT_SETTINGS.engine;
  const sourceLanguage = value.sourceLanguage === "auto" || ALLOWED_LANGUAGE.test(value.sourceLanguage || "")
    ? value.sourceLanguage
    : current.sourceLanguage === "auto" || ALLOWED_LANGUAGE.test(current.sourceLanguage || "")
      ? current.sourceLanguage
      : DEFAULT_SETTINGS.sourceLanguage;
  const targetLanguage = ALLOWED_LANGUAGE.test(value.targetLanguage || "")
    ? value.targetLanguage
    : ALLOWED_LANGUAGE.test(current.targetLanguage || "")
      ? current.targetLanguage
      : DEFAULT_SETTINGS.targetLanguage;
  return { engine, sourceLanguage, targetLanguage };
}

async function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(await readFile(SETTINGS_PATH, "utf8")));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(patch) {
  const current = await loadSettings();
  const next = normalizeSettings(patch, current);
  await mkdir(SETTINGS_DIR, { recursive: true });
  const temporary = `${SETTINGS_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, SETTINGS_PATH);
  return publicSettings(next);
}

function publicSettings(settings) {
  return normalizeSettings(settings);
}

function withTimeout(milliseconds = 15000) {
  return AbortSignal.timeout(milliseconds);
}

export function parseGoogleResponse(payload) {
  const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
  const text = segments.map((segment) => segment?.[0] || "").join("").trim();
  if (!text) throw new Error("Google 翻译没有返回译文");
  return { text, detectedLanguage: payload?.[2] || "auto" };
}

async function translateWithGoogle(text, settings) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: settings.sourceLanguage,
    tl: settings.targetLanguage,
    dt: "t",
    q: text,
  });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 CodexSelectionTranslator/0.3",
    },
    signal: withTimeout(),
  });
  if (response.status === 429) {
    throw new Error("Google 无 Key 接口已被限流（HTTP 429）");
  }
  if (!response.ok) throw new Error(`Google 翻译返回 HTTP ${response.status}`);
  return parseGoogleResponse(await response.json());
}

export function bingLanguage(language) {
  if (language === "zh-CN") return "zh-Hans";
  if (language === "zh-TW") return "zh-Hant";
  return language;
}

export function parseBingAuth(page) {
  const IG = page.match(/IG:"([^"]+)"/)?.[1];
  const IID = page.match(/data-iid="([^"]+)"/)?.[1];
  const raw = page.match(/params_AbusePreventionHelper\s*=\s*(\[[^\]]+\])/)?.[1];
  if (!IG || !IID || !raw) throw new Error("Bing 页面没有返回翻译凭证");
  const [key, token, lifetime] = JSON.parse(raw);
  if (!Number.isFinite(key) || typeof token !== "string" || !Number.isFinite(lifetime)) {
    throw new Error("Bing 翻译凭证无效");
  }
  return { IG, IID, key, token, expiresAt: key + lifetime };
}

export function parseBingResponse(payload) {
  const item = payload?.[0];
  const text = item?.translations?.[0]?.text?.trim();
  if (!text) throw new Error("Bing 翻译没有返回译文");
  return { text, detectedLanguage: item.detectedLanguage?.language || "auto" };
}

let bingAuth;
let bingRequestCount = 0;

async function getBingAuth(force = false) {
  if (!force && bingAuth?.expiresAt - Date.now() > 60_000) return bingAuth;
  const response = await fetch("https://www.bing.com/translator", {
    headers: { "User-Agent": "Mozilla/5.0 CodexSelectionTranslator/0.4" },
    signal: withTimeout(),
  });
  if (!response.ok) throw new Error(`Bing 翻译页面返回 HTTP ${response.status}`);
  bingAuth = parseBingAuth(await response.text());
  bingRequestCount = 0;
  return bingAuth;
}

async function translateWithBing(text, settings, retry = true) {
  const auth = await getBingAuth();
  const query = new URLSearchParams({
    isVertical: "1",
    IG: auth.IG,
    IID: auth.IID,
    ref: "TThis",
    SFX: String(++bingRequestCount),
  });
  const body = new URLSearchParams({
    fromLang: settings.sourceLanguage === "auto" ? "auto-detect" : bingLanguage(settings.sourceLanguage),
    to: bingLanguage(settings.targetLanguage),
    text,
    key: String(auth.key),
    token: auth.token,
  });
  const response = await fetch(`https://www.bing.com/ttranslatev3?${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 CodexSelectionTranslator/0.4",
    },
    body,
    signal: withTimeout(),
  });
  if (retry && (response.status === 401 || response.status === 403)) {
    await getBingAuth(true);
    return translateWithBing(text, settings, false);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.errorMessage || `Bing 翻译返回 HTTP ${response.status}`);
  }
  return parseBingResponse(payload);
}

async function translateRemote(text, engine) {
  if (typeof text !== "string" || !text.trim()) throw new Error("没有可翻译的文本");
  if (text.length > 5000) throw new Error("单次最多翻译 5000 个字符");
  if (engine !== "google" && engine !== "bing") throw new Error("不支持的远程翻译引擎");
  const settings = await loadSettings();
  const result = engine === "bing"
    ? await translateWithBing(text.trim(), settings)
    : await translateWithGoogle(text.trim(), settings);
  return {
    ...result,
    engine,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
  };
}

async function handleBridge(action, payload) {
  if (action === "ping") return true;
  if (action === "loadSettings") return publicSettings(await loadSettings());
  if (action === "saveSettings") return saveSettings(payload || {});
  if (action === "translateRemote") return translateRemote(payload?.text, payload?.engine);
  throw new Error(`未知操作：${action}`);
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.sequence = 0;
    this.pending = new Map();
    this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event.data));
    this.socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("CDP 连接已关闭"));
      this.pending.clear();
      this.resolveClosed();
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 命令超时：${method}`));
      }, 5000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  onMessage(raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.bindingCalled" && message.params?.name === BINDING_NAME) {
      this.onBinding(message.params).catch((error) => console.error("[translator] bridge:", error.message));
    }
  }

  async onBinding(params) {
    let request;
    try { request = JSON.parse(params.payload); } catch { return; }
    let response;
    try {
      response = { ok: true, value: await handleBridge(request.action, request.payload) };
    } catch (error) {
      response = { ok: false, error: error?.message || String(error) };
    }
    const expression = `window.__codexTranslatorResolve(${JSON.stringify(request.id)}, ${JSON.stringify(response)})`;
    await this.send("Runtime.evaluate", {
      expression,
      contextId: params.executionContextId,
      returnByValue: true,
      awaitPromise: false,
    });
  }
}

export function bridgeBootstrap(rendererSource) {
  return `
(() => {
  window.__codexTranslatorCallbacks ||= new Map();
  window.__codexNormalizeTranslationText = ${normalizeTranslationText.toString()};
  window.__codexTranslatorResolve = (id, response) => {
    const callback = window.__codexTranslatorCallbacks.get(id);
    if (!callback) return;
    window.__codexTranslatorCallbacks.delete(id);
    response?.ok ? callback.resolve(response.value) : callback.reject(new Error(response?.error || "翻译失败"));
  };
  window.__codexTranslatorCall = (action, payload = {}) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeoutMs = action === "translateRemote" ? 45000 : 5000;
    const timeout = setTimeout(() => {
      window.__codexTranslatorCallbacks.delete(id);
      reject(new Error("翻译后端未响应，请重新启动 Codex Translation"));
    }, timeoutMs);
    window.__codexTranslatorCallbacks.set(id, {
      resolve(value) { clearTimeout(timeout); resolve(value); },
      reject(error) { clearTimeout(timeout); reject(error); },
    });
    try {
      window.${BINDING_NAME}(JSON.stringify({ id, action, payload }));
    } catch (error) {
      clearTimeout(timeout);
      window.__codexTranslatorCallbacks.delete(id);
      reject(error);
    }
  });
})();
${rendererSource}`;
}

async function findCodexTarget() {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, { signal: withTimeout(1500) });
  if (!response.ok) throw new Error(`CDP discovery HTTP ${response.status}`);
  const targets = await response.json();
  return targets.find((target) =>
    target.type === "page" &&
    typeof target.webSocketDebuggerUrl === "string" &&
    (String(target.url).startsWith("app://") || /codex|chatgpt/i.test(`${target.title} ${target.url}`))
  );
}

async function runInjection(target, rendererSource) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Runtime.removeBinding", { name: BINDING_NAME }).catch(() => {});
  await session.send("Runtime.addBinding", { name: BINDING_NAME });
  const source = bridgeBootstrap(rendererSource);
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source });
  await session.send("Runtime.evaluate", {
    expression: source,
    awaitPromise: false,
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true,
  });
  console.log(`[translator] 已注入：${target.title || target.url}`);
  await session.closed;
}

export async function main() {
  const rendererSource = await readFile(RENDERER_PATH, "utf8");
  const keepAlive = setInterval(() => {}, 30000);
  console.log(`[translator] 等待 Codex CDP：127.0.0.1:${CDP_PORT}`);
  try {
    for (;;) {
      try {
        const target = await findCodexTarget();
        if (!target) throw new Error("没有发现 Codex 页面");
        await runInjection(target, rendererSource);
      } catch (error) {
        process.stdout.write(`\r[translator] ${error.message}；正在重试…                    `);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  } finally {
    clearInterval(keepAlive);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch((error) => {
  console.error("[translator] fatal:", error);
  process.exitCode = 1;
});
