import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  bingLanguage,
  normalizeSettings,
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
