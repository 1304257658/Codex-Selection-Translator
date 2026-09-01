(() => {
  const LEGACY_STATE_KEY = "__codexSelectionTranslatorStandalone";
  const STATE_KEY = "__codexSelectionTranslator";
  const HOST_ID = "codex-selection-translator";
  const call = window.__codexTranslatorCall;
  const normalizeTranslationText = window.__codexNormalizeTranslationText;
  if (typeof call !== "function" || typeof normalizeTranslationText !== "function") return;

  window[LEGACY_STATE_KEY]?.destroy?.();
  window[STATE_KEY]?.destroy?.();

  const LANGUAGES = [
    ["auto", "自动检测"], ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"],
    ["en", "English"], ["ja", "日本語"], ["ko", "한국어"],
    ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"],
    ["ru", "Русский"], ["pt", "Português"], ["it", "Italiano"],
    ["ar", "العربية"], ["th", "ไทย"], ["vi", "Tiếng Việt"],
  ];
  const DEFAULT_SETTINGS = {
    engine: "local",
    sourceLanguage: "auto",
    targetLanguage: "zh-CN",
    downloadedLanguages: [],
    languagePacksInitialized: false,
    languageDetectorDownloaded: false,
  };

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
      .speech-row { display:grid; grid-template-columns:minmax(0,1fr) 32px; align-items:start; gap:6px; }
      .original { margin-top:8px; color:#9aa0a6; font-size:12px; overflow-wrap:anywhere; }
      .result { margin-top:10px; font-size:16px; white-space:pre-wrap; overflow-wrap:anywhere; }
      .speech-row .speech-button { margin-top:6px; }
      .loading { color:#9aa0a6; } .error { color:#f28b82; }
      .foot { display:flex; justify-content:flex-end; gap:4px; margin-top:10px; }
      .symbol-button {
        width:32px; height:32px; padding:0; border:0; border-radius:8px;
        background:transparent; color:#bdc1c6; cursor:pointer; font-size:19px; line-height:1;
      }
      .symbol-button:hover { background:rgba(255,255,255,.08); color:#fff; }
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
      #pack-backdrop {
        position:fixed; inset:0; display:none; background:rgba(7,9,12,.62);
        backdrop-filter:blur(2px); pointer-events:auto;
      }
      #pack-manager {
        position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); display:none;
        width:min(720px,calc(100vw - 32px)); max-height:min(620px,calc(100vh - 32px));
        overflow:hidden; padding:18px; border:1px solid rgba(255,255,255,.16); border-radius:16px;
        background:#202124; color:#f1f3f4; box-shadow:0 26px 80px rgba(0,0,0,.52);
        pointer-events:auto; font:14px/1.5 system-ui,sans-serif;
      }
      .pack-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
      .pack-heading .title { font-size:15px; color:#f1f3f4; }
      .pack-subtitle { margin-top:2px; color:#9aa0a6; font-size:12px; }
      .pack-note {
        margin:14px 0 0; padding:10px 12px; border-left:3px solid #8ab4f8;
        border-radius:0 8px 8px 0; background:rgba(138,180,248,.08); color:#bdc1c6; font-size:12px;
      }
      .pack-delete { border:1px solid rgba(242,139,130,.5); background:transparent; color:#f28b82; }
      .pack-delete:hover:not(:disabled) { background:rgba(242,139,130,.1); }
      #pack-manager-status { min-height:22px; margin-top:10px; color:#81c995; font-size:12px; }
      .pack-list-heading {
        display:flex; align-items:center; justify-content:space-between; margin-top:12px;
        padding-top:14px; border-top:1px solid rgba(255,255,255,.12);
      }
      .pack-list-title { font-weight:650; }
      #pack-count { color:#9aa0a6; font-size:12px; }
      #language-pack-list { max-height:390px; overflow:auto; margin-top:8px; padding-right:4px; }
      .pack-row {
        display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px;
        min-height:48px; padding:7px 8px; border-radius:10px;
      }
      .pack-row:hover { background:rgba(255,255,255,.045); }
      .pack-language { min-width:0; }
      .pack-language-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pack-language-code { color:#9aa0a6; font:11px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .pack-ready { color:#81c995; font-size:12px; }
      .pack-missing { color:#9aa0a6; font-size:12px; }
      .pack-row button { min-height:30px; padding:4px 9px; border-radius:8px; cursor:pointer; }
      .pack-empty { padding:28px 8px; color:#9aa0a6; text-align:center; }
      button:focus-visible, select:focus-visible { outline:2px solid #8ab4f8; outline-offset:2px; }
      button:disabled, select:disabled { opacity:.5; cursor:default; }
      @media (max-width:640px) {
        #pack-manager { overflow:auto; }
      }
    </style>
    <div id="actions">
      <button id="translate" type="button" aria-label="翻译所选文本" title="翻译">译</button>
    </div>
    <section id="card" role="dialog" aria-label="划词翻译">
      <div class="head">
        <div class="title">划词翻译</div>
        <div class="head-actions">
          <button class="icon" id="open-packs" type="button" aria-label="语言包管理" title="语言包管理">⇩</button>
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
        <div class="speech-row"><div class="original"></div><button class="symbol-button speech-button" id="speak-original" type="button" data-idle-label="播放原文" aria-label="播放原文" title="播放原文">🔊</button></div>
        <div class="speech-row"><div class="result"></div><button class="symbol-button speech-button" id="speak-translation" type="button" data-idle-label="播放译文" aria-label="播放译文" title="播放译文" style="display:none">🔊</button></div>
        <div class="foot"><button class="retry symbol-button" type="button" aria-label="重试翻译" title="重试翻译">↻</button><button class="copy symbol-button" type="button" aria-label="复制译文" title="复制译文">⧉</button></div>
      </div>
      <form id="settings">
        <div class="field"><label for="engine">翻译引擎</label><select id="engine"><option value="local">本地翻译（推荐）</option><option value="google">Google Translate</option><option value="bing">Bing Translate</option></select></div>
        <div class="hint" id="engine-hint"></div>
        <div class="settings-actions"><button class="secondary" id="back-settings" type="button">返回</button><button class="primary" type="submit">保存设置</button></div>
        <div class="status"></div>
      </form>
    </section>
    <div id="pack-backdrop"></div>
    <section id="pack-manager" role="dialog" aria-modal="true" aria-label="语言包管理">
      <div class="pack-heading">
        <div><div class="title">语言包管理</div><div class="pack-subtitle">每种语言独立管理；翻译页只显示已下载的语言。</div></div>
        <button class="icon" id="close-packs" type="button" aria-label="关闭语言包管理" title="关闭">×</button>
      </div>
      <p class="pack-note">首次启动会检测 Chromium 本地已有语言资源。“删除”会让该语言从翻译页消失并释放相关会话；Chromium 暂不提供网页 API 删除磁盘缓存。</p>
      <div id="pack-manager-status" role="status" aria-live="polite"></div>
      <div class="pack-list-heading"><div class="pack-list-title">语言包</div><div id="pack-count"></div></div>
      <div id="language-pack-list"></div>
    </section>`;

  const $ = (selector) => shadow.querySelector(selector);
  const actions = $("#actions");
  const card = $("#card");
  const translationView = $("#translation-view");
  const settingsView = $("#settings");
  const result = $(".result");
  const original = $(".original");
  const copy = $(".copy");
  const speakOriginal = $("#speak-original");
  const speakTranslation = $("#speak-translation");
  const engine = $("#engine");
  const source = $("#source");
  const target = $("#target");
  const swapLanguages = $("#swap-languages");
  const engineHint = $("#engine-hint");
  const status = $(".status");
  const retry = $(".retry");
  const packBackdrop = $("#pack-backdrop");
  const packManager = $("#pack-manager");
  const packManagerStatus = $("#pack-manager-status");
  const languagePackList = $("#language-pack-list");
  const packCount = $("#pack-count");
  const ENGINE_LABELS = { local: "本地", google: "Google", bing: "Bing" };
  const translators = new Map();
  const installedLanguages = new Set();
  const downloadingLanguages = new Set();
  const languagePackProgress = new Map();
  let availableLanguagePacksPromise;
  let detectorPromise;
  let currentSettings = { ...DEFAULT_SETTINGS };
  let lastDetectedLanguage = null;
  let settingsPromise = loadSettings();
  let selectedText = "";
  let selectionRect = null;
  let translatedText = "";
  let translationTitle = "划词翻译";
  let activeUtterance = null;
  let activeSpeechButton = null;
  let timer = 0;
  let disposed = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function loadSettings() {
    const pending = call("loadSettings").then(async (value) => {
      currentSettings = value;
      installedLanguages.clear();
      const storedLanguages = Array.isArray(value.downloadedLanguages)
        ? value.downloadedLanguages
        : (value.downloadedLanguagePairs || []).flatMap((pair) =>
          typeof pair === "string" ? pair.split(":") : []
        );
      for (const language of storedLanguages) {
        installedLanguages.add(localLanguage(language));
      }
      let languagePacksChanged = false;
      if (!value.languagePacksInitialized) {
        for (const language of await discoverAvailableLanguagePacks()) {
          installedLanguages.add(language);
          languagePacksChanged = true;
        }
      }
      if (languagePacksChanged || !value.languagePacksInitialized) {
        currentSettings = await call("saveSettings", {
          ...currentSettings,
          downloadedLanguages: [...installedLanguages],
          languagePacksInitialized: true,
        });
      }
      engine.value = currentSettings.engine;
      refreshQuickLanguageOptions(currentSettings.sourceLanguage, currentSettings.targetLanguage);
      refreshEngineFields();
      updateSwapState();
      return currentSettings;
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

  function discoverAvailableLanguagePacks() {
    if (!("Translator" in window) || typeof window.Translator.availability !== "function") {
      return Promise.resolve([]);
    }
    if (!availableLanguagePacksPromise) {
      const languages = [...new Set(
        LANGUAGES.map(([language]) => localLanguage(language)).filter((language) => language !== "auto"),
      )].filter((language) => language !== "en");
      const checks = languages.map(async (language) => {
        const availability = await Promise.all([
          window.Translator.availability({ sourceLanguage: "en", targetLanguage: language }),
          window.Translator.availability({ sourceLanguage: language, targetLanguage: "en" }),
        ].map((request) => Promise.resolve(request).catch(() => "unavailable")));
        return availability.includes("available") ? language : null;
      });
      availableLanguagePacksPromise = withDeadline(
        Promise.all(checks),
        10000,
        "自动检测本地翻译包超时",
      ).then((detectedLanguages) => {
        const available = detectedLanguages.filter(Boolean);
        return available.length ? ["en", ...available] : [];
      }).catch(() => []);
    }
    return availableLanguagePacksPromise;
  }

  function setLanguageOptions(select, entries, preferredValue, emptyLabel) {
    select.replaceChildren();
    if (!entries.length) {
      select.add(new Option(emptyLabel, ""));
      select.disabled = true;
      return "";
    }
    select.disabled = false;
    for (const [value, label] of entries) select.add(new Option(label, value));
    select.value = entries.some(([value]) => value === preferredValue)
      ? preferredValue
      : entries[0][0];
    return select.value;
  }

  function refreshSettingsLanguageOptions() {
    refreshQuickLanguageOptions(currentSettings.sourceLanguage, currentSettings.targetLanguage);
  }

  function refreshQuickLanguageOptions(
    preferredSource = source.value,
    preferredTarget = target.value,
  ) {
    const concreteLanguages = LANGUAGES.filter(([value]) => value !== "auto");
    const installedEntries = concreteLanguages.filter(([value]) =>
      installedLanguages.has(localLanguage(value))
    );
    const activeEngine = engine.value || currentSettings.engine;
    const sourceEntries = activeEngine === "local"
      ? installedEntries.length ? [["auto", "自动检测"], ...installedEntries] : []
      : LANGUAGES;
    const targetEntries = activeEngine === "local" ? installedEntries : concreteLanguages;
    const sourceValue = sourceEntries.some(([value]) => value === preferredSource)
      ? preferredSource
      : currentSettings.sourceLanguage;
    const targetValue = targetEntries.some(([value]) => value === preferredTarget)
      ? preferredTarget
      : currentSettings.targetLanguage;
    setLanguageOptions(source, sourceEntries, sourceValue, "请先下载语言包");
    setLanguageOptions(target, targetEntries, targetValue, "请先下载语言包");
    updateSwapState();
  }

  function updateSwapState() {
    const reverseTarget = source.value === "auto" ? lastDetectedLanguage : source.value;
    swapLanguages.disabled = !reverseTarget
      || reverseTarget === target.value
      || !LANGUAGES.some(([language]) => language === reverseTarget && language !== "auto");
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

  function languageName(language) {
    return LANGUAGES.find(([value]) => value === uiLanguage(language))?.[1] || language;
  }

  function updatePackProgress(language, event) {
    const label = languageName(language);
    const percentage = Number.isFinite(event?.loaded)
      ? Math.max(0, Math.floor(event.loaded * 100))
      : null;
    languagePackProgress.set(language, percentage);
    const message = percentage === null
      ? `${label} 语言包：正在开始下载…`
      : percentage >= 100
        ? `${label} 语言包：下载完成，正在初始化…`
        : `${label} 语言包：正在下载… ${percentage}%`;
    if (packManager.style.display === "block") {
      packManagerStatus.textContent = message;
      packManagerStatus.className = "";
      renderPackManager();
    }
  }

  function ensureLanguageDetector() {
    if (!("LanguageDetector" in window)) throw new Error("当前 Codex 不支持本地语言检测");
    if (!detectorPromise) {
      detectorPromise = withDeadline(
        window.LanguageDetector.create(),
        180000,
        "本地语言检测包下载超时",
      ).then(async (detector) => {
        if (!currentSettings.languageDetectorDownloaded) {
          currentSettings = {
            ...currentSettings,
            languageDetectorDownloaded: true,
          };
          const saved = await call("saveSettings", currentSettings).catch(() => currentSettings);
          currentSettings = saved;
          settingsPromise = Promise.resolve(saved);
        }
        return detector;
      }).catch((error) => {
        detectorPromise = undefined;
        throw error;
      });
    }
    return detectorPromise;
  }

  async function detectLanguage(text) {
    const pendingDetector = ensureLanguageDetector();
    if (!currentSettings.languageDetectorDownloaded) {
      pendingDetector.catch(() => {});
      throw new Error("本地语言检测包正在后台下载");
    }
    const detector = await withDeadline(
      pendingDetector,
      30000,
      "本地语言检测器初始化超时",
    );
    const detected = await withDeadline(
      detector.detect(text),
      20000,
      "本地语言检测超时",
    );
    const language = detected?.find((item) => item.detectedLanguage && item.detectedLanguage !== "und")?.detectedLanguage;
    if (!language) throw new Error("无法检测源语言");
    return localLanguage(language);
  }

  async function persistInstalledLanguages() {
    const nextSettings = {
      ...currentSettings,
      downloadedLanguages: [...installedLanguages],
      languagePacksInitialized: true,
    };
    const saved = await call("saveSettings", nextSettings);
    currentSettings = saved;
    settingsPromise = Promise.resolve(saved);
  }

  async function getTranslator(sourceLanguage, targetLanguage) {
    if (!("Translator" in window)) throw new Error("当前 Codex 不支持本地翻译");
    const key = `${sourceLanguage}:${targetLanguage}`;
    if (!translators.has(key)) {
      const translator = withDeadline(window.Translator.create({
        sourceLanguage,
        targetLanguage,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (translationView.style.display !== "none") {
              const percentage = Number.isFinite(event?.loaded)
                ? `${Math.max(0, Math.floor(event.loaded * 100))}%`
                : "正在准备";
              result.className = "result loading";
              result.textContent = `${languageName(sourceLanguage)} → ${languageName(targetLanguage)}：${percentage}`;
            }
          });
        },
      }), 180000, "本地翻译器初始化超时").catch((error) => {
        translators.delete(key);
        refreshQuickLanguageOptions(source.value, target.value);
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
    const sourceLanguage = localLanguage(await detectedLanguagePromise.catch(() => guessedLanguage));
    const missingLanguages = [...new Set([sourceLanguage, targetLanguage])]
      .filter((language) => !installedLanguages.has(language));
    if (missingLanguages.length) {
      throw new Error(`请先在语言包管理中下载：${missingLanguages.map(languageName).join("、")}`);
    }
    if (sourceLanguage === targetLanguage) {
      return { text, detectedLanguage: sourceLanguage, engine: "local", targetLanguage: settings.targetLanguage };
    }
    const translator = await getTranslator(sourceLanguage, targetLanguage);
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
    cancelSpeech();
    actions.style.display = "none";
    card.style.display = "none";
    packBackdrop.style.display = "none";
    packManager.style.display = "none";
  }

  function showCard() {
    actions.style.display = "none";
    positionCard();
    card.style.display = "block";
  }

  function showTranslationView() {
    showCard();
    settingsView.style.display = "none";
    translationView.style.display = "block";
    refreshQuickLanguageOptions(currentSettings.sourceLanguage, currentSettings.targetLanguage);
    status.textContent = "";
    $(".title").textContent = translationTitle;
  }

  async function translateSelection() {
    if (!selectedText) return;
    cancelSpeech();
    translationTitle = "划词翻译";
    showTranslationView();
    original.textContent = selectedText;
    result.className = "result loading";
    result.textContent = "正在翻译…";
    copy.style.display = "none";
    retry.style.display = "none";
    speakTranslation.style.display = "none";
    try {
      try {
        await settingsPromise;
      } catch {
        settingsPromise = loadSettings();
        await settingsPromise;
      }
      if (!source.value || !target.value) {
        throw new Error("请先在语言包管理中下载至少两种需要的语言");
      }
      const translationText = normalizeTranslationText(selectedText);
      const response = await translateWithConfiguredEngine(
        translationText,
        {
          ...currentSettings,
          sourceLanguage: source.value,
          targetLanguage: target.value,
        },
        translationText !== selectedText.trim(),
      );
      translatedText = response.text;
      lastDetectedLanguage = uiLanguage(response.detectedLanguage || response.sourceLanguage);
      updateSwapState();
      translationTitle = `${ENGINE_LABELS[response.engine] || response.engine} · ${response.detectedLanguage || response.sourceLanguage} → ${response.targetLanguage}`;
      $(".title").textContent = translationTitle;
      result.className = "result";
      result.textContent = translatedText;
      copy.style.display = "block";
      retry.style.display = "block";
      speakTranslation.style.display = "block";
    } catch (error) {
      result.className = "result error";
      result.textContent = error?.message || String(error);
      retry.style.display = "block";
      speakTranslation.style.display = "none";
    }
  }

  function refreshEngineFields() {
    engineHint.textContent = engine.value === "local"
      ? "在 Codex 内嵌 Chromium 中本地翻译；翻译页只显示语言包管理中已下载的语言，切换语言不会下载。"
      : `${ENGINE_LABELS[engine.value]} 使用免 Key 网页接口，可能受到服务变更或限流影响。`;
    refreshQuickLanguageOptions(source.value, target.value);
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
    refreshQuickLanguageOptions(nextSource, reverseTarget);
    if (source.value !== nextSource || target.value !== reverseTarget) return;
    lastDetectedLanguage = null;
    if (nextInput) {
      selectedText = nextInput;
      translatedText = "";
    }
    await saveQuickLanguages();
  }

  function setPackManagerStatus(message = "", isError = false) {
    packManagerStatus.textContent = message;
    packManagerStatus.className = isError ? "error" : "";
  }

  function renderPackManager() {
    const entries = LANGUAGES.filter(([value]) => value !== "auto");
    packCount.textContent = `${installedLanguages.size} / ${entries.length} 个已下载`;
    languagePackList.replaceChildren();
    for (const [uiLanguageCode, label] of entries) {
      const language = localLanguage(uiLanguageCode);
      const isInstalled = installedLanguages.has(language);
      const isDownloading = downloadingLanguages.has(language);
      const row = document.createElement("div");
      row.className = "pack-row";
      const languageDetails = document.createElement("div");
      languageDetails.className = "pack-language";
      const name = document.createElement("div");
      name.className = "pack-language-name";
      name.textContent = label;
      const code = document.createElement("div");
      code.className = "pack-language-code";
      code.textContent = language;
      languageDetails.append(name, code);
      const state = document.createElement("div");
      state.className = isInstalled ? "pack-ready" : "pack-missing";
      state.textContent = isInstalled ? "已下载" : isDownloading ? "下载中" : "未下载";
      const action = document.createElement("button");
      action.type = "button";
      action.dataset.language = language;
      action.dataset.action = isInstalled ? "delete" : "download";
      action.className = isInstalled ? "pack-delete" : "primary";
      action.disabled = isDownloading;
      const progress = languagePackProgress.get(language);
      action.textContent = isInstalled
        ? "删除"
        : isDownloading
          ? Number.isFinite(progress) ? `${progress}%` : "下载中…"
          : "下载";
      row.append(languageDetails, state, action);
      languagePackList.appendChild(row);
    }
  }

  function managedDownloadDirection(language) {
    if (language !== "en") return { sourceLanguage: "en", targetLanguage: language };
    const preferredLanguages = [
      localLanguage(currentSettings.targetLanguage),
      ...installedLanguages,
      ...LANGUAGES.map(([value]) => localLanguage(value)),
    ];
    const targetLanguage = preferredLanguages.find((candidate) =>
      candidate && candidate !== "auto" && candidate !== "en"
    ) || "zh";
    return { sourceLanguage: "en", targetLanguage };
  }

  async function showPackManager() {
    packBackdrop.style.display = "block";
    packManager.style.display = "block";
    setPackManagerStatus("正在读取语言包记录…");
    try {
      await settingsPromise;
      renderPackManager();
      setPackManagerStatus();
      languagePackList.querySelector("button")?.focus();
    } catch (error) {
      setPackManagerStatus(error?.message || String(error), true);
    }
  }

  function closePackManager() {
    packBackdrop.style.display = "none";
    packManager.style.display = "none";
    $("#open-packs").focus();
  }

  async function downloadManagedLanguage(language) {
    if (!language || installedLanguages.has(language) || downloadingLanguages.has(language)) return;
    if (!("Translator" in window)) {
      setPackManagerStatus("当前 Codex 不支持本地翻译语言包。", true);
      return;
    }
    const direction = managedDownloadDirection(language);
    const key = `${direction.sourceLanguage}:${direction.targetLanguage}`;
    downloadingLanguages.add(language);
    languagePackProgress.delete(language);
    setPackManagerStatus(`${languageName(language)}：正在请求 Chromium 下载…`);
    renderPackManager();
    try {
      if (!translators.has(key)) {
        const translator = withDeadline(window.Translator.create({
          ...direction,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (event) => updatePackProgress(language, event));
          },
        }), 180000, `${languageName(language)}语言包下载超时`).catch((error) => {
          translators.delete(key);
          throw error;
        });
        translators.set(key, translator);
      }
      await translators.get(key);
      installedLanguages.add(language);
      await persistInstalledLanguages();
      refreshQuickLanguageOptions(source.value, target.value);
      setPackManagerStatus(`${languageName(language)}语言包已下载。`);
    } catch (error) {
      installedLanguages.delete(language);
      setPackManagerStatus(error?.message || String(error), true);
    } finally {
      downloadingLanguages.delete(language);
      languagePackProgress.delete(language);
      renderPackManager();
    }
  }

  async function deleteManagedLanguage(language) {
    if (!language || !installedLanguages.has(language)) return;
    const relatedTranslators = [];
    for (const [key, pendingTranslator] of translators) {
      if (!key.split(":").includes(language)) continue;
      translators.delete(key);
      relatedTranslators.push(pendingTranslator);
    }
    for (const pendingTranslator of relatedTranslators) {
      Promise.resolve(pendingTranslator).then((translator) => translator?.destroy?.()).catch(() => {});
    }
    installedLanguages.delete(language);
    setPackManagerStatus(`正在删除 ${languageName(language)} 的本工具记录…`);
    try {
      await persistInstalledLanguages();
      refreshQuickLanguageOptions(source.value, target.value);
      setPackManagerStatus(`${languageName(language)}已从翻译页移除。`);
    } catch (error) {
      installedLanguages.add(language);
      setPackManagerStatus(error?.message || String(error), true);
    }
    renderPackManager();
  }

  async function showSettings() {
    showCard();
    translationView.style.display = "none";
    settingsView.style.display = "block";
    $(".title").textContent = "翻译设置";
    status.textContent = "正在读取设置…";
    try {
      settingsPromise = loadSettings();
      await settingsPromise;
      status.textContent = "";
      refreshSettingsLanguageOptions();
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
      refreshQuickLanguageOptions(saved.sourceLanguage, saved.targetLanguage);
      showTranslationView();
    } catch (error) {
      status.textContent = error?.message || String(error);
    }
  }

  async function copyResult() {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText).catch(() => {});
    copy.textContent = "✓";
    copy.title = "已复制";
    setTimeout(() => {
      copy.textContent = "⧉";
      copy.title = "复制译文";
    }, 1000);
  }

  function resetSpeechButton(button) {
    if (!button) return;
    const label = button.dataset.idleLabel;
    button.textContent = "🔊";
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function cancelSpeech() {
    const previousButton = activeSpeechButton;
    activeUtterance = null;
    activeSpeechButton = null;
    window.speechSynthesis?.cancel?.();
    resetSpeechButton(previousButton);
  }

  function speakText(text, language, button) {
    const speech = window.speechSynthesis;
    if (!text || !speech || typeof window.SpeechSynthesisUtterance !== "function") {
      button.disabled = true;
      button.title = "当前环境不支持语音播放";
      return;
    }
    if (activeSpeechButton === button) {
      cancelSpeech();
      return;
    }

    cancelSpeech();
    const utterance = new window.SpeechSynthesisUtterance(text);
    if (language && language !== "auto") {
      utterance.lang = language;
      const languageCode = language.toLowerCase();
      const primaryLanguage = languageCode.split("-")[0];
      const voices = speech.getVoices?.() || [];
      const voice = voices.find((candidate) => candidate.lang.toLowerCase() === languageCode)
        || voices.find((voice) => voice.lang.toLowerCase().split("-")[0] === primaryLanguage)
        || null;
      if (voice) utterance.voice = voice;
    }

    activeUtterance = utterance;
    activeSpeechButton = button;
    button.textContent = "■";
    button.title = "停止播放";
    button.setAttribute("aria-label", "停止播放");
    const finish = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      activeSpeechButton = null;
      resetSpeechButton(button);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  function markTranslationStale() {
    if (!selectedText || translationView.style.display === "none") return;
    cancelSpeech();
    translatedText = "";
    result.className = "result loading";
    result.textContent = "语言已更改，点击 ↻ 重新翻译。";
    copy.style.display = "none";
    retry.style.display = "block";
    speakTranslation.style.display = "none";
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

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (packManager.style.display === "block") closePackManager();
    else closeAll();
  }

  function toggleSettings() {
    if (settingsView.style.display === "block") showTranslationView();
    else showSettings();
  }

  $("#translate").addEventListener("click", translateSelection);
  $("#open-packs").addEventListener("click", showPackManager);
  $("#open-settings").addEventListener("click", toggleSettings);
  $("#close").addEventListener("click", closeAll);
  $("#back-settings").addEventListener("click", showTranslationView);
  $("#close-packs").addEventListener("click", closePackManager);
  packBackdrop.addEventListener("click", closePackManager);
  languagePackList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-language]");
    if (!button) return;
    if (button.dataset.action === "delete") deleteManagedLanguage(button.dataset.language);
    else downloadManagedLanguage(button.dataset.language);
  });
  retry.addEventListener("click", translateSelection);
  copy.addEventListener("click", copyResult);
  speakOriginal.addEventListener("click", () => {
    const language = source.value === "auto"
      ? (lastDetectedLanguage || guessLanguage(selectedText))
      : source.value;
    speakText(selectedText, language, speakOriginal);
  });
  speakTranslation.addEventListener("click", () => {
    speakText(translatedText, target.value, speakTranslation);
  });
  source.addEventListener("change", () => {
    lastDetectedLanguage = null;
    refreshQuickLanguageOptions(source.value, target.value);
    if (settingsView.style.display === "block") {
      return;
    }
    markTranslationStale();
    saveQuickLanguages(false);
  });
  target.addEventListener("change", () => {
    refreshQuickLanguageOptions(source.value, target.value);
    if (settingsView.style.display === "block") {
      return;
    }
    markTranslationStale();
    saveQuickLanguages(false);
  });
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
    version: "0.9.0",
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
