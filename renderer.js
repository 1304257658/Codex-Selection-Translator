(() => {
  const STATE_KEY = "__codexSelectionTranslatorStandalone";
  const HOST_ID = "codex-selection-translator-standalone";
  const call = window.__codexTranslatorCall;
  const normalizeTranslationText = window.__codexNormalizeTranslationText;
  if (typeof call !== "function" || typeof normalizeTranslationText !== "function") return;

  window[STATE_KEY]?.destroy?.();

  const LANGUAGES = [
    ["auto", "自动检测"], ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"],
    ["en", "English"], ["ja", "日本語"], ["ko", "한국어"],
    ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"],
    ["ru", "Русский"], ["pt", "Português"], ["it", "Italiano"],
    ["ar", "العربية"], ["th", "ไทย"], ["vi", "Tiếng Việt"],
  ];
  const DEFAULT_SETTINGS = { engine: "local", sourceLanguage: "auto", targetLanguage: "zh-CN" };

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      button, select { font: inherit; }
      #actions {
        position: fixed; display: none; gap: 4px; padding: 4px;
        border: 1px solid rgba(255,255,255,.16); border-radius: 12px;
        background: #202124; box-shadow: 0 8px 24px rgba(0,0,0,.3); pointer-events: auto;
      }
      #actions button, .icon {
        width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px;
        background: transparent; color: #f1f3f4; cursor: pointer;
      }
      #actions button:hover, .icon:hover { background: rgba(255,255,255,.1); }
      #card {
        position: fixed; display: none; width: min(380px, calc(100vw - 24px));
        max-height: min(420px, calc(100vh - 24px)); overflow: auto; padding: 14px;
        border: 1px solid rgba(255,255,255,.14); border-radius: 14px;
        background: #202124; color: #f1f3f4; box-shadow: 0 18px 50px rgba(0,0,0,.38);
        pointer-events: auto; font: 14px/1.5 system-ui, sans-serif;
      }
      .head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .title { color:#8ab4f8; font-weight:650; font-size:12px; }
      .head-actions { display:flex; gap:2px; }
      .language-bar {
        display:grid; grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);
        align-items:center; gap:8px; margin-top:10px;
      }
      .language-bar select { min-width:0; min-height:34px; padding:6px 8px; }
      .swap {
        width:32px; height:32px; padding:0; border:1px solid #4a4d51; border-radius:9px;
        background:transparent; color:#bdc1c6; cursor:pointer;
      }
      .swap:hover:not(:disabled) { background:rgba(255,255,255,.08); color:#fff; }
      .swap:disabled { opacity:.35; cursor:default; }
      .original { margin-top:8px; color:#9aa0a6; font-size:12px; overflow-wrap:anywhere; }
      .result { margin-top:10px; font-size:16px; white-space:pre-wrap; overflow-wrap:anywhere; }
      .loading { color:#9aa0a6; } .error { color:#f28b82; }
      .foot { display:flex; justify-content:flex-end; margin-top:10px; }
      .copy { padding:6px 9px; border:0; border-radius:8px; background:transparent; color:#bdc1c6; cursor:pointer; }
      .copy:hover { background:rgba(255,255,255,.08); color:#fff; }
      #settings { display:none; }
      .field { display:grid; gap:5px; margin-top:12px; }
      label { color:#bdc1c6; font-size:12px; }
      select {
        width:100%; min-height:36px; padding:7px 9px; border:1px solid #4a4d51;
        border-radius:9px; background:#292a2d; color:#f1f3f4; outline:none;
      }
      select:focus { border-color:#8ab4f8; }
      .hint { margin-top:8px; color:#9aa0a6; font-size:11px; }
      .settings-actions { display:flex; justify-content:space-between; gap:8px; margin-top:14px; }
      .primary, .secondary { min-height:34px; padding:6px 11px; border-radius:9px; cursor:pointer; }
      .primary { border:0; background:#8ab4f8; color:#172033; font-weight:650; }
      .secondary { border:1px solid #4a4d51; background:transparent; color:#bdc1c6; }
      .status { min-height:18px; margin-top:8px; color:#81c995; font-size:12px; }
    </style>
    <div id="actions">
      <button id="translate" type="button" aria-label="翻译所选文本" title="翻译">译</button>
    </div>
    <section id="card" role="dialog" aria-label="划词翻译">
      <div class="head">
        <div class="title">划词翻译</div>
        <div class="head-actions">
          <button class="icon" id="open-settings" type="button" aria-label="翻译设置">⚙</button>
          <button class="icon" id="close" type="button" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="language-bar">
        <select id="source" aria-label="源语言" title="源语言"></select>
        <button class="swap" id="swap-languages" type="button" aria-label="交换源语言和目标语言" title="交换语言">⇄</button>
        <select id="target" aria-label="目标语言" title="目标语言"></select>
      </div>
      <div id="translation-view">
        <div class="original"></div>
        <div class="result"></div>
        <div class="foot"><button class="copy" type="button">复制译文</button></div>
      </div>
      <form id="settings">
        <div class="field"><label for="engine">翻译引擎</label><select id="engine"><option value="local">本地翻译（推荐）</option><option value="google">Google Translate</option><option value="bing">Bing Translate</option></select></div>
        <div class="hint" id="engine-hint"></div>
        <div class="settings-actions"><button class="secondary" id="cancel-settings" type="button">取消</button><button class="primary" type="submit">保存设置</button></div>
        <div class="status"></div>
      </form>
    </section>`;

  const $ = (selector) => shadow.querySelector(selector);
  const actions = $("#actions");
  const card = $("#card");
  const translationView = $("#translation-view");
  const settingsView = $("#settings");
  const result = $(".result");
  const original = $(".original");
  const copy = $(".copy");
  const engine = $("#engine");
  const source = $("#source");
  const target = $("#target");
  const swapLanguages = $("#swap-languages");
  const engineHint = $("#engine-hint");
  const status = $(".status");
  const ENGINE_LABELS = { local: "本地", google: "Google", bing: "Bing" };
  const translators = new Map();
  let detectorPromise;
  let currentSettings = { ...DEFAULT_SETTINGS };
  let lastDetectedLanguage = null;
  let settingsPromise = loadSettings();
  let selectedText = "";
  let selectionRect = null;
  let translatedText = "";
  let timer = 0;
  let disposed = false;

  for (const [value, label] of LANGUAGES) {
    source.add(new Option(label, value));
    if (value !== "auto") target.add(new Option(label, value));
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function loadSettings() {
    const pending = call("loadSettings").then((value) => {
      currentSettings = value;
      engine.value = value.engine;
      source.value = value.sourceLanguage;
      target.value = value.targetLanguage;
      refreshEngineFields();
      updateSwapState();
      return value;
    });
    pending.catch(() => {});
    return pending;
  }

  function withDeadline(value, milliseconds, message) {
    let timeout;
    return Promise.race([
      Promise.resolve(value),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timeout));
  }

  function localLanguage(language) {
    if (language === "zh-CN" || language === "zh-Hans") return "zh";
    if (language === "zh-TW") return "zh-Hant";
    return language;
  }

  function uiLanguage(language) {
    if (language === "zh" || language === "zh-Hans") return "zh-CN";
    if (language === "zh-Hant") return "zh-TW";
    return language;
  }

  function updateSwapState() {
    const reverseTarget = source.value === "auto" ? lastDetectedLanguage : source.value;
    swapLanguages.disabled = !reverseTarget
      || reverseTarget === target.value
      || !Array.from(target.options).some((option) => option.value === reverseTarget);
  }

  function guessLanguage(text) {
    if (/[぀-ヿ]/u.test(text)) return "ja";
    if (/[가-힯]/u.test(text)) return "ko";
    if (/[一-鿿]/u.test(text)) return "zh";
    if (/[Ѐ-ӿ]/u.test(text)) return "ru";
    if (/[؀-ۿ]/u.test(text)) return "ar";
    if (/[฀-๿]/u.test(text)) return "th";
    return "en";
  }

  function progressMessage(label, event) {
    const percentage = Number.isFinite(event?.loaded) ? ` ${Math.round(event.loaded * 100)}%` : "";
    result.textContent = `${label}，请稍候…${percentage}`;
  }

  async function detectLanguage(text) {
    if (!("LanguageDetector" in window)) throw new Error("当前 Codex 不支持本地语言检测");
    if (!detectorPromise) {
      detectorPromise = withDeadline(window.LanguageDetector.create({
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (event) => progressMessage("正在下载语言检测包", event));
          },
        }), 60000, "本地语言检测包下载超时").catch((error) => {
        detectorPromise = undefined;
        throw error;
      });
    }
    const detected = await withDeadline(
      (await detectorPromise).detect(text),
      20000,
      "本地语言检测超时",
    );
    const language = detected?.find((item) => item.detectedLanguage && item.detectedLanguage !== "und")?.detectedLanguage;
    if (!language) throw new Error("无法检测源语言");
    return localLanguage(language);
  }

  async function getTranslator(sourceLanguage, targetLanguage) {
    if (!("Translator" in window)) throw new Error("当前 Codex 不支持本地翻译");
    const key = `${sourceLanguage}:${targetLanguage}`;
    if (!translators.has(key)) {
      const translator = withDeadline(window.Translator.create({
          sourceLanguage,
          targetLanguage,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (event) => progressMessage("正在下载本地翻译包", event));
          },
        }), 60000, "本地翻译包下载超时").catch((error) => {
        translators.delete(key);
        throw error;
      });
      translators.set(key, translator);
    }
    return translators.get(key);
  }

  async function translateLocally(text, settings, skipLanguageDetection = false) {
    const targetLanguage = localLanguage(settings.targetLanguage);
    const guessedLanguage = settings.sourceLanguage === "auto"
      ? guessLanguage(text)
      : localLanguage(settings.sourceLanguage);
    const shouldDetect = settings.sourceLanguage === "auto"
      && !skipLanguageDetection
      && text.trim().length >= 12;
    const detectedLanguagePromise = shouldDetect
      ? detectLanguage(text)
      : Promise.resolve(guessedLanguage);
    const guessedTranslatorPromise = guessedLanguage === targetLanguage
      ? null
      : getTranslator(guessedLanguage, targetLanguage);
    guessedTranslatorPromise?.catch(() => {});
    const sourceLanguage = localLanguage(await detectedLanguagePromise.catch(() => guessedLanguage));
    if (sourceLanguage === targetLanguage) {
      return { text, detectedLanguage: sourceLanguage, engine: "local", targetLanguage: settings.targetLanguage };
    }
    const translator = await (sourceLanguage === guessedLanguage && guessedTranslatorPromise
      ? guessedTranslatorPromise
      : getTranslator(sourceLanguage, targetLanguage));
    return {
      text: await withDeadline(translator.translate(text), 30000, "本地翻译超时"),
      detectedLanguage: sourceLanguage,
      engine: "local",
      targetLanguage: settings.targetLanguage,
    };
  }

  async function translateWithConfiguredEngine(text, settings, skipLanguageDetection = false) {
    if (settings.engine !== "local") {
      await call("ping");
      return call("translateRemote", { text, engine: settings.engine });
    }
    try {
      return await translateLocally(text, settings, skipLanguageDetection);
    } catch (localError) {
      result.textContent = "本地翻译不可用，正在尝试 Bing…";
      try {
        await call("ping");
        return await call("translateRemote", { text, engine: "bing" });
      } catch (bingError) {
        if (/翻译后端未响应/u.test(bingError?.message || "")) {
          throw new Error(`本地翻译不可用：${localError?.message || localError}；翻译后端未连接`);
        }
        result.textContent = "Bing 不可用，正在尝试 Google…";
        try {
          return await call("translateRemote", { text, engine: "google" });
        } catch (googleError) {
          throw new Error(`本地、Bing 和 Google 均不可用：${googleError?.message || googleError}`);
        }
      }
    }
  }

  function readSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const text = selection.toString().trim();
    if (!text) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    const ancestor = range.commonAncestorContainer;
    const element = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
    const style = element ? getComputedStyle(element) : null;
    const fontSize = Number.parseFloat(style?.fontSize) || 16;
    const lineHeight = Number.parseFloat(style?.lineHeight) || fontSize * 1.5;
    return { text, rect, lineHeight };
  }

  function positionActions({ rect, lineHeight }) {
    actions.style.left = `${clamp(rect.left, 8, window.innerWidth - 48)}px`;
    actions.style.top = `${clamp(rect.bottom + lineHeight * 2, 8, window.innerHeight - 42)}px`;
    actions.style.display = "flex";
  }

  function positionCard(rect = selectionRect) {
    const width = Math.min(380, window.innerWidth - 24);
    const left = clamp(rect?.left || 12, 12, window.innerWidth - width - 12);
    const below = (rect?.bottom || 12) + 10;
    const top = below + 280 < window.innerHeight ? below : clamp((rect?.top || 300) - 290, 12, window.innerHeight - 300);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function refreshSelection() {
    if (disposed || card.style.display === "block") return;
    const current = readSelection();
    if (!current) { actions.style.display = "none"; return; }
    if (selectedText !== current.text) {
      translatedText = "";
      lastDetectedLanguage = null;
      updateSwapState();
    }
    selectedText = current.text;
    selectionRect = current.rect;
    positionActions(current);
  }

  function closeAll() {
    actions.style.display = "none";
    card.style.display = "none";
  }

  function showCard() {
    actions.style.display = "none";
    positionCard();
    card.style.display = "block";
  }

  async function translateSelection() {
    if (!selectedText) return;
    showCard();
    translationView.style.display = "block";
    settingsView.style.display = "none";
    original.textContent = selectedText;
    $(".title").textContent = "划词翻译";
    result.className = "result loading";
    result.textContent = "正在翻译…";
    copy.style.display = "none";
    try {
      const translationText = normalizeTranslationText(selectedText);
      const response = await translateWithConfiguredEngine(
        translationText,
        currentSettings,
        translationText !== selectedText.trim(),
      );
      translatedText = response.text;
      lastDetectedLanguage = uiLanguage(response.detectedLanguage || response.sourceLanguage);
      updateSwapState();
      $(".title").textContent = `${ENGINE_LABELS[response.engine] || response.engine} · ${response.detectedLanguage || response.sourceLanguage} → ${response.targetLanguage}`;
      result.className = "result";
      result.textContent = translatedText;
      copy.style.display = "block";
    } catch (error) {
      result.className = "result error";
      result.textContent = error?.message || String(error);
    }
  }

  function refreshEngineFields() {
    engineHint.textContent = engine.value === "local"
      ? "在 Codex 内嵌 Chromium 中本地翻译；首次使用会下载语言包。失败时自动尝试 Bing 和 Google。"
      : `${ENGINE_LABELS[engine.value]} 使用免 Key 网页接口，可能受到服务变更或限流影响。`;
  }

  async function saveQuickLanguages(retranslate = true) {
    currentSettings = {
      ...currentSettings,
      sourceLanguage: source.value,
      targetLanguage: target.value,
    };
    updateSwapState();
    try {
      const saved = await call("saveSettings", currentSettings);
      currentSettings = saved;
      settingsPromise = Promise.resolve(saved);
      if (retranslate && selectedText && translationView.style.display !== "none") {
        await translateSelection();
      }
    } catch (error) {
      result.className = "result error";
      result.textContent = error?.message || String(error);
    }
  }

  async function swapLanguageDirection() {
    const reverseTarget = source.value === "auto" ? lastDetectedLanguage : source.value;
    if (!reverseTarget || swapLanguages.disabled) return;
    const nextSource = target.value;
    const nextInput = translatedText;
    source.value = nextSource;
    target.value = reverseTarget;
    lastDetectedLanguage = null;
    if (nextInput) {
      selectedText = nextInput;
      translatedText = "";
    }
    await saveQuickLanguages();
  }

  async function showSettings() {
    showCard();
    translationView.style.display = "none";
    settingsView.style.display = "block";
    $(".title").textContent = "翻译设置";
    status.textContent = "正在读取设置…";
    try {
      settingsPromise = loadSettings();
      const value = await settingsPromise;
      engine.value = value.engine;
      source.value = value.sourceLanguage;
      target.value = value.targetLanguage;
      status.textContent = "";
      refreshEngineFields();
    } catch (error) {
      status.textContent = error?.message || String(error);
    }
  }

  async function saveConfiguration(event) {
    event.preventDefault();
    status.textContent = "正在保存…";
    try {
      const saved = await call("saveSettings", {
        engine: engine.value,
        sourceLanguage: source.value,
        targetLanguage: target.value,
      });
      currentSettings = saved;
      settingsPromise = Promise.resolve(saved);
      status.textContent = "设置已保存";
    } catch (error) {
      status.textContent = error?.message || String(error);
    }
  }

  async function copyResult() {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText).catch(() => {});
    copy.textContent = "已复制";
    setTimeout(() => { copy.textContent = "复制译文"; }, 1000);
  }

  function onSelectionChange() {
    clearTimeout(timer);
    timer = setTimeout(refreshSelection, 40);
  }

  function onPointerDown(event) {
    const path = event.composedPath();
    if (path.includes(actions)) {
      // Preserve the page selection while clicking the floating action buttons.
      event.preventDefault();
    } else if (!path.includes(host) && card.style.display === "block") {
      card.style.display = "none";
    }
  }

  function onKeyDown(event) { if (event.key === "Escape") closeAll(); }

  $("#translate").addEventListener("click", translateSelection);
  $("#open-settings").addEventListener("click", showSettings);
  $("#close").addEventListener("click", closeAll);
  $("#cancel-settings").addEventListener("click", closeAll);
  copy.addEventListener("click", copyResult);
  source.addEventListener("change", () => {
    lastDetectedLanguage = null;
    saveQuickLanguages();
  });
  target.addEventListener("change", () => saveQuickLanguages());
  swapLanguages.addEventListener("click", swapLanguageDirection);
  engine.addEventListener("change", refreshEngineFields);
  settingsView.addEventListener("submit", saveConfiguration);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", refreshSelection, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", closeAll);
  document.documentElement.appendChild(host);

  window[STATE_KEY] = {
    version: "0.6.0",
    destroy() {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerup", refreshSelection, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", closeAll);
      detectorPromise?.then((detector) => detector.destroy?.()).catch(() => {});
      for (const translator of translators.values()) {
        translator.then((value) => value.destroy?.()).catch(() => {});
      }
      host.remove();
      delete window[STATE_KEY];
    },
  };
})();
