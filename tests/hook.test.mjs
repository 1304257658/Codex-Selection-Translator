import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  BING_TRANSLATOR_ORIGINS,
  bridgeBootstrap,
  DEFAULT_SETTINGS,
  bingLanguage,
  findCodexTarget,
  normalizeSettings,
  normalizeTranslationText,
  parseBingAuth,
  parseBingResponse,
  parseGoogleResponse,
  translateWithBing,
} from "../src/hook.mjs";

test("normalizes only supported settings", () => {
  const value = normalizeSettings({
    engine: "bing",
    sourceLanguage: "en",
    targetLanguage: "ja",
  });
  assert.equal(value.engine, "bing");
  assert.equal(value.sourceLanguage, "en");
  assert.equal(value.targetLanguage, "ja");
  assert.equal(normalizeSettings({ engine: "model" }).engine, DEFAULT_SETTINGS.engine);
  assert.deepEqual(Object.keys(normalizeSettings({ googleApiKey: "legacy" })).sort(), [
    "downloadedLanguages",
    "engine",
    "languageDetectorDownloaded",
    "languagePacksInitialized",
    "sourceLanguage",
    "targetLanguage",
  ]);
});

test("normalizes independent managed local language packs", () => {
  const value = normalizeSettings({
    downloadedLanguages: ["en", "zh", "en", "auto", "invalid:value", 42],
    languageDetectorDownloaded: true,
    languagePacksInitialized: true,
  });
  assert.deepEqual(value.downloadedLanguages, ["en", "zh"]);
  assert.equal(value.languageDetectorDownloaded, true);
  assert.equal(value.languagePacksInitialized, true);
});

test("migrates legacy directed language pairs to independent language packs", () => {
  const value = normalizeSettings({
    downloadedLanguagePairs: ["en:zh", "zh:en", "ja:zh", "auto:zh", "invalid"],
    languagePacksInitialized: true,
  });
  assert.deepEqual(value.downloadedLanguages, ["en", "zh", "ja"]);
  assert.equal("downloadedLanguagePairs" in value, false);
});

test("parses Google legacy segmented output", () => {
  assert.deepEqual(parseGoogleResponse([[['你好', 'hello'], ['世界', 'world']], null, 'en']), {
    text: "你好世界",
    detectedLanguage: "en",
  });
});

test("parses Google Chrome dictionary output", () => {
  assert.deepEqual(parseGoogleResponse(["你好"]), {
    text: "你好",
    detectedLanguage: "auto",
  });
  assert.deepEqual(parseGoogleResponse([["你好世界。\n你好吗？", "en"]]), {
    text: "你好世界。\n你好吗？",
    detectedLanguage: "en",
  });
});

test("parses Bing web credentials and output", () => {
  assert.deepEqual(parseBingAuth('IG:"abc" data-iid="translator.1"; params_AbusePreventionHelper = [1000,"token",60000]'), {
    IG: "abc",
    IID: "translator.1",
    key: 1000,
    token: "token",
    expiresAt: 61000,
  });
  assert.deepEqual(parseBingResponse([{
    detectedLanguage: { language: "en" },
    translations: [{ text: "你好" }],
  }]), { text: "你好", detectedLanguage: "en" });
});

test("maps Chinese codes for Bing Translator", () => {
  assert.equal(bingLanguage("zh-CN"), "zh-Hans");
  assert.equal(bingLanguage("zh-TW"), "zh-Hant");
});

test("finds the Codex target over IPv6 when IPv4 CDP is unavailable", async () => {
  const requests = [];
  const target = {
    type: "page",
    title: "ChatGPT",
    url: "app://-/index.html",
    webSocketDebuggerUrl: "ws://[::1]:9222/devtools/page/codex",
  };

  const result = await findCodexTarget({
    port: 9222,
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).startsWith("http://127.0.0.1:")) {
        throw new TypeError("fetch failed");
      }
      return Response.json([target]);
    },
  });

  assert.deepEqual(requests, [
    "http://127.0.0.1:9222/json/list",
    "http://[::1]:9222/json/list",
  ]);
  assert.deepEqual(result, target);
});

test("falls back to the alternate Bing regional endpoint after a connect timeout", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    requests.push(requestUrl);
    if (requestUrl === `${BING_TRANSLATOR_ORIGINS[0]}/translator`) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
      throw error;
    }
    if (requestUrl === `${BING_TRANSLATOR_ORIGINS[1]}/translator`) {
      const key = Date.now();
      return new Response(`IG:"fallback-ig" data-iid="translator.1"; params_AbusePreventionHelper = [${key},"fallback-token",600000]`);
    }
    if (requestUrl.startsWith(`${BING_TRANSLATOR_ORIGINS[1]}/ttranslatev3?`)) {
      return Response.json([{
        detectedLanguage: { language: "en" },
        translations: [{ text: "你好" }],
      }]);
    }
    throw new Error(`unexpected request: ${requestUrl}`);
  };
  try {
    assert.deepEqual(await translateWithBing("hello", {
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
    }), { text: "你好", detectedLanguage: "en" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests[0], `${BING_TRANSLATOR_ORIGINS[0]}/translator`);
  assert.equal(requests[1], `${BING_TRANSLATOR_ORIGINS[1]}/translator`);
  assert.match(requests[2], new RegExp(`^${BING_TRANSLATOR_ORIGINS[1]}/ttranslatev3\\?`));
});

test("normalizes compound identifiers before translation", () => {
  assert.equal(normalizeTranslationText("CodexSelectionTranslator"), "Codex Selection Translator");
  assert.equal(normalizeTranslationText("codex_selection-translator"), "codex selection translator");
  assert.equal(normalizeTranslationText("HTTPRequest"), "HTTP Request");
  assert.equal(normalizeTranslationText("one---two___three"), "one two three");
});

test("times out when the renderer bridge has no backend", async () => {
  let runTimeout;
  const context = {
    clearTimeout() {},
    crypto: { randomUUID: () => "request-1" },
    setTimeout(callback) { runTimeout = callback; return 1; },
    window: { codexTranslatorBridge() {} },
  };
  vm.runInNewContext(bridgeBootstrap(""), context);
  const pending = context.window.__codexTranslatorCall("loadSettings");
  runTimeout();
  await assert.rejects(pending, /翻译后端未响应/);
});

test("resolves renderer bridge calls when the backend responds", async () => {
  let request;
  const context = {
    clearTimeout() {},
    crypto: { randomUUID: () => "request-2" },
    setTimeout() { return 1; },
    window: {
      codexTranslatorBridge(payload) { request = JSON.parse(payload); },
    },
  };
  vm.runInNewContext(bridgeBootstrap(""), context);
  const pending = context.window.__codexTranslatorCall("loadSettings");
  context.window.__codexTranslatorResolve(request.id, { ok: true, value: { engine: "local" } });
  assert.deepEqual(await pending, { engine: "local" });
});
