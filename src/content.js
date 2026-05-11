(() => {
  const CONFIG_KEY = "d4koTranslatorConfig";
  const SUPPORTED_HOSTS = ["maxroll.gg"];
  const ORIGINAL_TEXT = new WeakMap();
  const TRANSLATED_MARK = "data-d4ko-translated";
  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "textarea",
    "input",
    "select",
    "code",
    "pre",
    "[contenteditable='true']",
    "[data-d4ko-ignore]"
  ].join(",");

  const state = {
    enabled: false,
    glossary: null,
    glossaryEntries: [],
    glossaryIndex: new Map(),
    phraseRules: null,
    observer: null,
    pending: new Set(),
    flushTimer: 0,
    toastTimer: 0,
    translator: null,
    translatorMode: "glossary-only",
    isTranslating: false,
    translationCache: new Map(),
    status: {
      phase: "idle",
      message: "대기 중",
      translated: 0,
      skipped: 0
    }
  };

  init();

  async function init() {
    if (!isSupportedHost()) {
      restoreMarkedText(document.body);
      return;
    }

    await loadTranslationData();
    const config = await getConfig();
    state.enabled = isHostEnabled(config);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      handleMessage(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[CONFIG_KEY]) {
        return;
      }

      const nextEnabled = isHostEnabled(changes[CONFIG_KEY].newValue || {});
      if (nextEnabled === state.enabled) {
        return;
      }

      if (nextEnabled) {
        void enableTranslator();
      } else {
        disableTranslator();
      }
    });

    if (state.enabled) {
      await enableTranslator();
    }
  }

  async function handleMessage(message) {
    if (!message || !message.type) {
      return getStatus();
    }

    if (message.type === "getStatus") {
      return getStatus();
    }

    if (message.type === "setEnabled") {
      await setHostEnabled(Boolean(message.enabled));
      if (message.enabled) {
        await enableTranslator();
      } else {
        disableTranslator();
      }
      return getStatus();
    }

    if (message.type === "translateNow") {
      if (!isSupportedHost()) {
        return getStatus();
      }
      await enableTranslator({ force: true });
      return getStatus();
    }

    return { ok: false, error: `Unknown message: ${message.type}` };
  }

  async function loadTranslationData() {
    await Promise.all([loadGlossary(), loadPhraseRules()]);
  }

  async function loadGlossary() {
    if (state.glossary) {
      return;
    }

    const url = chrome.runtime.getURL("data/diablo4-ko-glossary.json");
    const response = await fetch(url);
    state.glossary = await response.json();
    state.glossaryEntries = flattenGlossary(state.glossary);
    state.glossaryIndex = buildGlossaryIndex(state.glossaryEntries);
  }

  async function loadPhraseRules() {
    if (state.phraseRules) {
      return;
    }

    const url = chrome.runtime.getURL("data/diablo4-ko-phrase-rules.json");
    const response = await fetch(url);
    state.phraseRules = await response.json();
  }

  function flattenGlossary(glossary) {
    return glossary.terms
      .flatMap((group) =>
        group.entries.flatMap((entry) => {
          const terms = [entry.en, ...(entry.aliases || [])];
          return terms.map((term) => ({
            category: group.category,
            en: term,
            ko: entry.ko,
            caseSensitive: entry.caseSensitive ?? group.caseSensitive,
            needle: normalizeSearchText(
              term,
              entry.caseSensitive ?? group.caseSensitive
            ),
            pattern: buildTermPattern(
              term,
              entry.caseSensitive ?? group.caseSensitive
            )
          }));
        })
      )
      .sort((a, b) => b.en.length - a.en.length);
  }

  function buildGlossaryIndex(entries) {
    const index = new Map();
    for (const entry of entries) {
      const bucket = getNeedleBucket(entry.needle);
      if (!index.has(bucket)) {
        index.set(bucket, []);
      }
      index.get(bucket).push(entry);
    }
    return index;
  }

  function buildTermPattern(term, caseSensitive) {
    const escaped = escapeRegExp(term).replace(/\\ /g, "\\s+");
    const startsWithWord = /^[A-Za-z0-9]/.test(term);
    const endsWithWord = /[A-Za-z0-9]$/.test(term);
    const prefix = startsWithWord ? "(?<![A-Za-z0-9])" : "";
    const suffix = endsWithWord ? "(?![A-Za-z0-9])" : "";
    return new RegExp(`${prefix}${escaped}${suffix}`, caseSensitive ? "g" : "gi");
  }

  async function enableTranslator(options = {}) {
    state.enabled = true;
    if (options.force) {
      state.status.translated = 0;
      state.status.skipped = 0;
      state.translationCache.clear();
    }
    setTranslationStatus("starting", "번역 준비 중");
    await ensureMachineTranslator();
    collectTextNodes(document.body, options.force);
    startObserver();
    if (state.pending.size > 0) {
      setTranslationStatus("queued", `번역 대기 중 (${state.pending.size}개)`);
      scheduleFlush();
    } else {
      setTranslationStatus("completed", "번역할 새 문구가 없습니다");
    }
  }

  function disableTranslator() {
    state.enabled = false;
    stopObserver();
    state.pending.clear();
    setTranslationStatus("disabled", "번역 꺼짐");
    restoreOriginalText(document.body);
  }

  async function ensureMachineTranslator() {
    if (state.translator) {
      return;
    }

    try {
      if (globalThis.Translator?.create) {
        state.translator = await globalThis.Translator.create({
          sourceLanguage: "en",
          targetLanguage: "ko"
        });
        state.translatorMode = "chrome-translator";
        return;
      }

      if (globalThis.ai?.translator?.create) {
        state.translator = await globalThis.ai.translator.create({
          sourceLanguage: "en",
          targetLanguage: "ko"
        });
        state.translatorMode = "chrome-ai-translator";
      }
    } catch (_error) {
      state.translator = null;
      state.translatorMode = "glossary-only";
    }
  }

  function startObserver() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      if (!state.enabled) {
        return;
      }

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            queueNode(node, false);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            collectTextNodes(node, false);
          }
        }
      }
      scheduleFlush();
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (!state.observer) {
      return;
    }
    state.observer.disconnect();
    state.observer = null;
  }

  function collectTextNodes(root, force) {
    if (!root) {
      return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          if (shouldSkipNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!force && node.parentElement?.hasAttribute(TRANSLATED_MARK)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      queueNode(walker.currentNode, force);
    }
  }

  function shouldSkipNode(node) {
    const element = node.parentElement;
    if (!element || element.closest(SKIP_SELECTOR)) {
      return true;
    }
    const text = node.nodeValue.trim();
    if (text.length < 2 || /^[\d\s.,:;!?%()[\]{}+\-/*|]+$/.test(text)) {
      return true;
    }
    return false;
  }

  function queueNode(node, force) {
    if (!ORIGINAL_TEXT.has(node) || force) {
      ORIGINAL_TEXT.set(node, node.nodeValue);
    }
    state.pending.add(node);
    if (state.enabled && !state.isTranslating && state.pending.size === 1) {
      setTranslationStatus("queued", `번역 대기 중 (${state.pending.size}개)`);
    }
  }

  function scheduleFlush() {
    clearTimeout(state.flushTimer);
    state.flushTimer = window.setTimeout(() => {
      flushPending();
    }, 120);
  }

  async function flushPending() {
    if (!state.enabled || state.isTranslating || state.pending.size === 0) {
      return;
    }

    state.isTranslating = true;
    const nodes = [...state.pending].slice(0, 80);
    for (const node of nodes) {
      state.pending.delete(node);
    }
    setTranslationStatus("translating", `번역 중 (${nodes.length}개 처리 중)`);

    try {
      for (const node of nodes) {
        if (!node.isConnected || shouldSkipNode(node)) {
          state.status.skipped += 1;
          continue;
        }
        const original = ORIGINAL_TEXT.get(node) || node.nodeValue;
        const translated = await translateText(original);
        if (translated && translated !== node.nodeValue) {
          node.nodeValue = translated;
          node.parentElement?.setAttribute(TRANSLATED_MARK, "true");
          state.status.translated += 1;
        } else {
          state.status.skipped += 1;
        }
      }
    } finally {
      state.isTranslating = false;
      if (state.pending.size > 0) {
        scheduleFlush();
        setTranslationStatus("queued", `번역 계속 진행 중 (${state.pending.size}개 남음)`);
      } else {
        setTranslationStatus("completed", `번역 완료 (${state.status.translated}개 변경)`);
      }
    }
  }

  async function translateText(text) {
    const trimmed = text.trim();
    if (!shouldTranslateText(trimmed)) {
      return text;
    }

    const cached = state.translationCache.get(text);
    if (cached) {
      return cached;
    }

    if (!state.translator) {
      return rememberTranslation(
        text,
        applyPhraseRules(applyGlossary(text), "postMachineTranslation")
      );
    }

    const protectedText = protectGlossaryTerms(text);
    const preparedText = applyPhraseRules(
      protectedText.text,
      "preMachineTranslation"
    );

    if (!looksLikeEnglish(preparedText)) {
      return applyPhraseRules(
        restoreGlossaryTerms(preparedText, protectedText.terms),
        "postMachineTranslation"
      );
    }

    if (preparedText.length > 900) {
      return applyPhraseRules(
        restoreGlossaryTerms(preparedText, protectedText.terms),
        "postMachineTranslation"
      );
    }

    try {
      const translated = await state.translator.translate(preparedText);
      return rememberTranslation(
        text,
        applyPhraseRules(
          restoreGlossaryTerms(translated || preparedText, protectedText.terms),
          "postMachineTranslation"
        )
      );
    } catch (_error) {
      state.translator = null;
      state.translatorMode = "glossary-only";
      return rememberTranslation(
        text,
        applyPhraseRules(applyGlossary(text), "postMachineTranslation")
      );
    }
  }

  function shouldTranslateText(text) {
    if (!text || hasMostlyKorean(text)) {
      return false;
    }
    return looksLikeEnglish(text) || hasGlossaryMatch(text);
  }

  function applyGlossary(text) {
    let translated = text;
    for (const entry of getCandidateGlossaryEntries(text)) {
      if (!maybeContainsTerm(text, entry)) {
        continue;
      }
      translated = translated.replace(entry.pattern, entry.ko);
    }
    return translated;
  }

  function protectGlossaryTerms(text) {
    let protectedText = text;
    const terms = [];

    for (const entry of getCandidateGlossaryEntries(text)) {
      if (!maybeContainsTerm(protectedText, entry)) {
        continue;
      }
      protectedText = protectedText.replace(entry.pattern, () => {
        const key = `D4KOTERM${terms.length}D4KO`;
        terms.push({ key, value: entry.ko });
        return key;
      });
    }

    return { text: protectedText, terms };
  }

  function restoreGlossaryTerms(text, terms) {
    let restored = text;
    for (const term of terms) {
      restored = restored.replace(
        new RegExp(escapeRegExp(term.key), "gi"),
        term.value
      );
    }
    return restored;
  }

  function applyPhraseRules(text, phase) {
    const rules = state.phraseRules?.[phase] || [];
    let rewritten = text;
    for (const rule of rules) {
      rewritten = rewritten.replace(new RegExp(rule.from, "gi"), rule.to);
    }
    return rewritten;
  }

  function hasGlossaryMatch(text) {
    return getCandidateGlossaryEntries(text).some((entry) => {
      if (!maybeContainsTerm(text, entry)) {
        return false;
      }
      entry.pattern.lastIndex = 0;
      return entry.pattern.test(text);
    });
  }

  function getCandidateGlossaryEntries(text) {
    const normalized = normalizeSearchText(text, false);
    const buckets = new Set();
    const wordStartPattern = /(?:^|[^a-z0-9])([a-z0-9])/g;
    let match;
    while ((match = wordStartPattern.exec(normalized))) {
      buckets.add(match[1]);
    }
    const candidates = [];

    for (const bucket of buckets) {
      const entries = state.glossaryIndex.get(bucket);
      if (entries) {
        candidates.push(...entries);
      }
    }

    const miscEntries = state.glossaryIndex.get("*");
    if (miscEntries) {
      candidates.push(...miscEntries);
    }

    return candidates;
  }

  function maybeContainsTerm(text, entry) {
    return normalizeSearchText(text, entry.caseSensitive).includes(entry.needle);
  }

  function normalizeSearchText(text, caseSensitive) {
    const normalized = text.replace(/\s+/g, " ").trim();
    return caseSensitive ? normalized : normalized.toLowerCase();
  }

  function getNeedleBucket(needle) {
    const match = needle.match(/[a-z0-9]/i);
    return match ? match[0].toLowerCase() : "*";
  }

  function rememberTranslation(original, translated) {
    state.translationCache.set(original, translated);
    if (state.translationCache.size > 5000) {
      const [oldestKey] = state.translationCache.keys();
      state.translationCache.delete(oldestKey);
    }
    return translated;
  }

  function looksLikeEnglish(text) {
    return /[A-Za-z]{3,}/.test(text);
  }

  function hasMostlyKorean(text) {
    const korean = (text.match(/[가-힣]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return korean > 0 && korean >= latin;
  }

  function setTranslationStatus(phase, message) {
    state.status.phase = phase;
    state.status.message = message;
    showToast(message, phase);
  }

  function showToast(message, phase) {
    if (!document.body) {
      return;
    }

    let toast = document.querySelector("[data-d4ko-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.setAttribute("data-d4ko-toast", "true");
      toast.setAttribute("data-d4ko-ignore", "true");
      Object.assign(toast.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        maxWidth: "280px",
        padding: "10px 12px",
        border: "1px solid rgba(255, 255, 255, 0.16)",
        borderRadius: "8px",
        background: "rgba(17, 19, 24, 0.94)",
        color: "#f4f1e8",
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35)",
        font: "13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        letterSpacing: "0",
        pointerEvents: "none",
        transition: "opacity 160ms ease, transform 160ms ease"
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    clearTimeout(state.toastTimer);
    if (phase === "completed" || phase === "disabled") {
      state.toastTimer = window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(4px)";
      }, 2200);
    }
  }

  function restoreOriginalText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (ORIGINAL_TEXT.has(node)) {
        node.nodeValue = ORIGINAL_TEXT.get(node);
        node.parentElement?.removeAttribute(TRANSLATED_MARK);
      }
    }
  }

  function restoreMarkedText(root) {
    if (!root) {
      return;
    }

    const markedElements = root.querySelectorAll?.(`[${TRANSLATED_MARK}]`) || [];
    for (const element of markedElements) {
      element.removeAttribute(TRANSLATED_MARK);
    }

    const toast = root.querySelector?.("[data-d4ko-toast]");
    toast?.remove();
  }

  async function getConfig() {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    return result[CONFIG_KEY] || { enabled: false, enabledHosts: {} };
  }

  async function setHostEnabled(enabled) {
    const config = await getConfig();
    // Keep the legacy global flag explicitly false so older content scripts
    // already living in non-Maxroll tabs shut themselves down on storage change.
    config.enabled = false;
    config.enabledHosts = {
      ...(config.enabledHosts || {}),
      [location.hostname]: enabled
    };
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
    state.enabled = enabled;
  }

  function isHostEnabled(config) {
    return Boolean(config.enabledHosts?.[location.hostname]);
  }

  function isSupportedHost() {
    return SUPPORTED_HOSTS.some(
      (host) => location.hostname === host || location.hostname.endsWith(`.${host}`)
    );
  }

  function getStatus() {
    return {
      ok: true,
      enabled: state.enabled,
      host: location.hostname,
      glossaryEntries: state.glossaryEntries.length,
      phraseRules: (state.phraseRules?.preMachineTranslation?.length || 0) +
        (state.phraseRules?.postMachineTranslation?.length || 0),
      mode: state.translatorMode,
      phase: state.status.phase,
      message: state.status.message,
      pending: state.pending.size,
      translated: state.status.translated,
      skipped: state.status.skipped,
      supportedHost: isSupportedHost()
    };
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
