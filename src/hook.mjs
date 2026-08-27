import { setDefaultResultOrder } from "node:dns";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The translator endpoints publish both address families, while some Windows
// networks advertise IPv6 without providing a working external IPv6 route.
setDefaultResultOrder("ipv4first");

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
  downloadedLanguages: [],
  languagePacksInitialized: false,
  languageDetectorDownloaded: false,
});

const ALLOWED_ENGINES = new Set(["local", "google", "bing"]);
const ALLOWED_LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?$/;
const ALLOWED_LANGUAGE_PAIR = /^([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?):([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?)$/;

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
  const languageSource = Array.isArray(value.downloadedLanguages)
    ? value.downloadedLanguages
    : Array.isArray(value.downloadedLanguagePairs)
      ? value.downloadedLanguagePairs.flatMap((pair) => {
        const match = typeof pair === "string" ? pair.match(ALLOWED_LANGUAGE_PAIR) : null;
        return match && match[1] !== match[2] ? [match[1], match[2]] : [];
      })
      : Array.isArray(current.downloadedLanguages)
        ? current.downloadedLanguages
        : Array.isArray(current.downloadedLanguagePairs)
          ? current.downloadedLanguagePairs.flatMap((pair) => {
            const match = typeof pair === "string" ? pair.match(ALLOWED_LANGUAGE_PAIR) : null;
            return match && match[1] !== match[2] ? [match[1], match[2]] : [];
          })
          : [];
  const downloadedLanguages = [...new Set(languageSource.filter((language) =>
    typeof language === "string"
      && language !== "auto"
      && ALLOWED_LANGUAGE.test(language)
  ))].slice(0, 256);
  const languageDetectorDownloaded = typeof value.languageDetectorDownloaded === "boolean"
    ? value.languageDetectorDownloaded
    : Boolean(current.languageDetectorDownloaded);
  const languagePacksInitialized = typeof value.languagePacksInitialized === "boolean"
    ? value.languagePacksInitialized
    : Boolean(current.languagePacksInitialized);
  return {
    engine,
    sourceLanguage,
    targetLanguage,
    downloadedLanguages,
    languagePacksInitialized,
    languageDetectorDownloaded,
  };
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

async function fetchTranslationService(service, url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(`${service} 翻译请求超时`);
    }
    const detail = error?.cause?.code || error?.cause?.message || error?.message;
    throw new Error(`${service} 网络请求失败${detail ? `：${detail}` : ""}，请检查网络或代理设置`);
  }
}

export function parseGoogleResponse(payload) {
  const first = payload?.[0];
  let detectedLanguage = "auto";
  let text = "";

  if (typeof first === "string") {
    text = first;
  } else if (Array.isArray(first) && typeof first[0] === "string") {
    // clients5 dict-chrome-ex: [["translated text", "detected language"]]
    text = first[0];
    detectedLanguage = typeof first[1] === "string" ? first[1] : "auto";
  } else if (Array.isArray(first)) {
    // Legacy translate_a/single: [[['translated', 'source'], ...], ..., 'en']
    text = first.map((segment) => segment?.[0] || "").join("");
    detectedLanguage = payload?.[2] || "auto";
  }

  text = text.trim();
  if (!text) throw new Error("Google 翻译没有返回译文");
  return { text, detectedLanguage };
}

export async function translateWithGoogle(text, settings) {
  const params = new URLSearchParams({
    client: "dict-chrome-ex",
    sl: settings.sourceLanguage,
    tl: settings.targetLanguage,
  });
  const response = await fetchTranslationService(
    "Google",
    `https://clients5.google.com/translate_a/t?${params}`,
    {
      method: "POST",
      body: new URLSearchParams({ q: text }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 CodexSelectionTranslator/0.8",
      },
      signal: withTimeout(),
    },
  );
  if (response.status === 429) {
    throw new Error("Google 无 Key 接口已被限流（HTTP 429）");
  }
  if (!response.ok) throw new Error(`Google 翻译返回 HTTP ${response.status}`);
  const parsed = parseGoogleResponse(await response.json());
  if (parsed.detectedLanguage === "auto" && settings.sourceLanguage !== "auto") {
    parsed.detectedLanguage = settings.sourceLanguage;
  }
  return parsed;
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

export const BING_TRANSLATOR_ORIGINS = Object.freeze([
  "https://cn.bing.com",
  "https://www.bing.com",
]);

let bingAuth;
let bingRequestCount = 0;

function bingOrigins(excludedOrigin = "") {
  const preferredOrigin = bingAuth?.origin;
  return [...BING_TRANSLATOR_ORIGINS]
    .sort((left, right) => (left === preferredOrigin ? -1 : right === preferredOrigin ? 1 : 0))
    .filter((origin) => origin !== excludedOrigin);
}

async function getBingAuth(force = false, excludedOrigin = "") {
  if (!force && bingAuth?.expiresAt - Date.now() > 60_000) return bingAuth;
  const failures = [];
  const origins = bingOrigins(excludedOrigin);
  const requestAuth = async (origin) => {
    try {
      const response = await fetchTranslationService("Bing", `${origin}/translator`, {
        headers: { "User-Agent": "Mozilla/5.0 CodexSelectionTranslator/0.8" },
        signal: withTimeout(8000),
      });
      if (!response.ok) throw new Error(`Bing 翻译页面返回 HTTP ${response.status}`);
      return { ...parseBingAuth(await response.text()), origin };
    } catch (error) {
      throw new Error(`${new URL(origin).host}：${error?.message || error}`);
    }
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      bingAuth = await Promise.any(origins.map(requestAuth));
      bingRequestCount = 0;
      return bingAuth;
    } catch (error) {
      failures.push(...(error?.errors || [error]).map((failure) => failure?.message || String(failure)));
    }
  }
  bingAuth = undefined;
  throw new Error(`Bing 翻译入口均不可用（${failures.join("；")}）`);
}

export async function translateWithBing(text, settings, retry = true) {
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
  const requestTranslation = () => fetchTranslationService("Bing", `${auth.origin}/ttranslatev3?${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 CodexSelectionTranslator/0.8",
      },
      body,
      signal: withTimeout(12000),
    });
  let response;
  try {
    response = await requestTranslation();
  } catch (error) {
    if (!retry) throw error;
    try {
      response = await requestTranslation();
    } catch {
      await getBingAuth(true, auth.origin);
      return translateWithBing(text, settings, false);
    }
  }
  if (retry && (response.status === 401 || response.status === 403)) {
    await getBingAuth(true);
    return translateWithBing(text, settings, false);
  }
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // The error below reports an invalid response without exposing a full HTML page.
  }
  if (!response.ok) {
    throw new Error(payload?.errorMessage || `Bing 翻译返回 HTTP ${response.status}`);
  }
  if (!raw) {
    throw new Error("Bing 翻译返回空响应，请检查网络或代理设置");
  }
  if (!payload) {
    throw new Error("Bing 翻译返回了无法解析的响应");
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
    const timeoutMs = action === "translateRemote" ? 90000 : 5000;
    const timeout = setTimeout(() => {
      window.__codexTranslatorCallbacks.delete(id);
      reject(new Error("翻译后端未响应，请重新启动 Codex Selection Translator"));
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

export async function findCodexTarget({
  port = CDP_PORT,
  fetchImpl = fetch,
  timeoutMs = 1500,
} = {}) {
  const origins = [`http://127.0.0.1:${port}`, `http://[::1]:${port}`];
  const errors = [];
  let endpointReached = false;

  for (const origin of origins) {
    try {
      const response = await fetchImpl(`${origin}/json/list`, { signal: withTimeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      endpointReached = true;
      const target = targets.find((candidate) =>
        candidate.type === "page" &&
        typeof candidate.webSocketDebuggerUrl === "string" &&
        (String(candidate.url).startsWith("app://") || /codex|chatgpt/i.test(`${candidate.title} ${candidate.url}`))
      );
      if (target) return target;
    } catch (error) {
      errors.push(`${origin}: ${error.message}`);
    }
  }

  if (endpointReached) return null;
  throw new Error(`CDP discovery failed (${errors.join("; ")})`);
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
  const disconnectGraceMs = 30000;
  let connectedOnce = false;
  let disconnectedAt = 0;
  console.log(`[translator] 等待 Codex CDP：127.0.0.1/[::1]:${CDP_PORT}`);
  try {
    for (;;) {
      try {
        const target = await findCodexTarget();
        if (!target) throw new Error("没有发现 Codex 页面");
        connectedOnce = true;
        disconnectedAt = 0;
        await runInjection(target, rendererSource);
        disconnectedAt = Date.now();
      } catch (error) {
        if (connectedOnce) {
          if (!disconnectedAt) disconnectedAt = Date.now();
          if (Date.now() - disconnectedAt >= disconnectGraceMs) {
            console.log("\n[translator] Codex 已退出，翻译后端同步停止。");
            return;
          }
        }
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
