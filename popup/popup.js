const enabledToggle = document.querySelector("#enabledToggle");
const translateButton = document.querySelector("#translateButton");
const siteStatus = document.querySelector("#siteStatus");
const modeValue = document.querySelector("#modeValue");
const glossaryValue = document.querySelector("#glossaryValue");

let activeTab = null;

document.addEventListener("DOMContentLoaded", init);
enabledToggle.addEventListener("change", onToggleChanged);
translateButton.addEventListener("click", onTranslateClicked);

async function init() {
  activeTab = await getActiveTab();
  if (!activeTab?.id || !activeTab.url) {
    renderUnavailable("현재 탭을 찾을 수 없습니다.");
    return;
  }

  if (!isSupportedUrl(activeTab.url)) {
    renderUnavailable("maxroll.gg 또는 helltides.com에서 사용할 수 있습니다.");
    return;
  }

  const status = await sendToTab({ type: "getStatus" });
  if (!status?.ok) {
    renderUnavailable("페이지를 새로고침한 뒤 다시 시도하세요.");
    return;
  }

  renderStatus(status);
}

async function onToggleChanged() {
  enabledToggle.disabled = true;
  const status = await sendToTab({
    type: "setEnabled",
    enabled: enabledToggle.checked
  });
  enabledToggle.disabled = false;

  if (status?.ok) {
    renderStatus(status);
  } else {
    enabledToggle.checked = !enabledToggle.checked;
    siteStatus.textContent = "활성화에 실패했습니다.";
  }
}

async function onTranslateClicked() {
  translateButton.disabled = true;
  translateButton.textContent = "번역 중";
  const status = await sendToTab({ type: "translateNow" });
  translateButton.disabled = false;
  translateButton.textContent = "다시 번역";

  if (status?.ok) {
    renderStatus(status);
  } else {
    siteStatus.textContent = "번역 요청에 실패했습니다.";
  }
}

function renderStatus(status) {
  enabledToggle.disabled = false;
  translateButton.disabled = !status.enabled;
  enabledToggle.checked = status.enabled;
  siteStatus.textContent = status.enabled
    ? `${status.host}에서 동작 중`
    : `${status.host}에서 꺼져 있음`;
  modeValue.textContent = formatMode(status.mode);
  glossaryValue.textContent = `${status.glossaryEntries}개 + 규칙 ${status.phraseRules}개`;
}

function renderUnavailable(message) {
  enabledToggle.disabled = true;
  translateButton.disabled = true;
  siteStatus.textContent = message;
  modeValue.textContent = "사용 불가";
  glossaryValue.textContent = "-";
}

function formatMode(mode) {
  if (mode === "chrome-translator" || mode === "chrome-ai-translator") {
    return "용어 + 문장 번역";
  }
  return "용어 사전";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab;
}

async function sendToTab(message) {
  try {
    return await chrome.tabs.sendMessage(activeTab.id, message);
  } catch (_error) {
    return { ok: false };
  }
}

function isSupportedUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" &&
      (hostname === "maxroll.gg" ||
        hostname.endsWith(".maxroll.gg") ||
        hostname === "helltides.com" ||
        hostname.endsWith(".helltides.com"));
  } catch (_error) {
    return false;
  }
}
