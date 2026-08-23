import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  bridgeBootstrap,
  DEFAULT_SETTINGS,
  bingLanguage,
  normalizeSettings,
  normalizeTranslationText,
  parseBingAuth,
  parseBingResponse,
  parseGoogleResponse,
} from "../hook.mjs";

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
  assert.deepEqual(Object.keys(normalizeSettings({ googleApiKey: "legacy" })).sort(), ["engine", "sourceLanguage", "targetLanguage"]);
});

test("parses Google segmented output", () => {
  assert.deepEqual(parseGoogleResponse([[['你好', 'hello'], ['世界', 'world']], null, 'en']), {
    text: "你好世界",
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

test("normalizes compound identifiers before translation", () => {
  assert.equal(normalizeTranslationText("CodexTranslationPlugin"), "Codex Translation Plugin");
  assert.equal(normalizeTranslationText("codex_translation-plugin"), "codex translation plugin");
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
