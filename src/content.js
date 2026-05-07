(() => {
  const CONFIG_KEY = "d4koTranslatorConfig";
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
    phraseRules: null,
    observer: null,
    pending: new Set(),
    flushTimer: 0,
    translator: null,
    translatorMode: "glossary-only",
    isTranslating: false
  };

  init();

  async function init() {
    await loadTranslationData();
    const config = await getConfig();
    state.enabled = isHostEnabled(config);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      handleMessage(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
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
            pattern: buildTermPattern(
              term,
              entry.caseSensitive ?? group.caseSensitive
            )
          }));
        })
      )
      .sort((a, b) => b.en.length - a.en.length);
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
    await ensureMachineTranslator();
    collectTextNodes(document.body, options.force);
    startObserver();
    scheduleFlush();
  }

  function disableTranslator() {
    state.enabled = false;
    stopObserver();
    state.pending.clear();
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

    try {
      for (const node of nodes) {
        if (!node.isConnected || shouldSkipNode(node)) {
          continue;
        }
        const original = ORIGINAL_TEXT.get(node) || node.nodeValue;
        const translated = await translateText(original);
        if (translated && translated !== node.nodeValue) {
          node.nodeValue = translated;
          node.parentElement?.setAttribute(TRANSLATED_MARK, "true");
        }
      }
    } finally {
      state.isTranslating = false;
      if (state.pending.size > 0) {
        scheduleFlush();
      }
    }
  }

  async function translateText(text) {
    const trimmed = text.trim();
    if (!shouldTranslateText(trimmed)) {
      return text;
    }

    if (!state.translator) {
      return applyPhraseRules(applyGlossary(text), "postMachineTranslation");
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
      return applyPhraseRules(
        restoreGlossaryTerms(translated || preparedText, protectedText.terms),
        "postMachineTranslation"
      );
    } catch (_error) {
      state.translator = null;
      state.translatorMode = "glossary-only";
      return applyPhraseRules(applyGlossary(text), "postMachineTranslation");
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
    for (const entry of state.glossaryEntries) {
      translated = translated.replace(entry.pattern, entry.ko);
    }
    return translated;
  }

  function protectGlossaryTerms(text) {
    let protectedText = text;
    const terms = [];

    for (const entry of state.glossaryEntries) {
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
    return state.glossaryEntries.some((entry) => {
      entry.pattern.lastIndex = 0;
      return entry.pattern.test(text);
    });
  }

  function looksLikeEnglish(text) {
    return /[A-Za-z]{3,}/.test(text);
  }

  function hasMostlyKorean(text) {
    const korean = (text.match(/[가-힣]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return korean > 0 && korean >= latin;
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

  async function getConfig() {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    return result[CONFIG_KEY] || { enabledHosts: {} };
  }

  async function setHostEnabled(enabled) {
    const config = await getConfig();
    config.enabledHosts = config.enabledHosts || {};
    config.enabledHosts[location.hostname] = enabled;
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
    state.enabled = enabled;
  }

  function isHostEnabled(config) {
    return Boolean(config.enabledHosts?.[location.hostname]);
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
      supportedHost: /(^|\.)maxroll\.gg$/.test(location.hostname) ||
        /(^|\.)helltides\.com$/.test(location.hostname)
    };
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
