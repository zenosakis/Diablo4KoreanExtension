const SUPPORTED_HOSTS = ["maxroll.gg"];
const enabledToggle = document.querySelector("#enabledToggle");
const translateButton = document.querySelector("#translateButton");
const siteStatus = document.querySelector("#siteStatus");
const progressValue = document.querySelector("#progressValue");
const modeValue = document.querySelector("#modeValue");
const glossaryValue = document.querySelector("#glossaryValue");

let activeTab = null;
let pollTimer = 0;

document.addEventListener("DOMContentLoaded", init);
enabledToggle.addEventListener("change", onToggleChanged);
translateButton.addEventListener("click", onTranslateClicked);

async function init() {
  activeTab = await getActiveTab();
  if (!activeTab?.id || !activeTab.url) {
    renderUnavailable("현재 탭을 찾을 수 없습니다.");
    return;
  }

  if (!canUseOnUrl(activeTab.url)) {
    renderUnavailable("Maxroll 페이지에서만 사용할 수 있습니다.");
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
    siteStatus.textContent = "상태 변경에 실패했습니다.";
  }
}

async function onTranslateClicked() {
  translateButton.disabled = true;
  translateButton.textContent = "번역 중...";
  progressValue.textContent = "번역 요청 중";

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
  translateButton.disabled = !status.enabled || !status.supportedHost;
  enabledToggle.checked = status.enabled;
  siteStatus.textContent = status.enabled
    ? `${status.host}에서 동작 중`
    : `${status.host}에서 꺼져 있음`;
  progressValue.textContent = formatProgress(status);
  modeValue.textContent = formatMode(status.mode);
  glossaryValue.textContent = `${status.glossaryEntries}개 + 규칙 ${status.phraseRules}개`;

  updatePolling(status);
}

function renderUnavailable(message) {
  clearTimeout(pollTimer);
  enabledToggle.disabled = true;
  translateButton.disabled = true;
  siteStatus.textContent = message;
  progressValue.textContent = "사용 불가";
  modeValue.textContent = "사용 불가";
  glossaryValue.textContent = "-";
}

function formatProgress(status) {
  if (status.phase === "translating" || status.phase === "queued") {
    return `${status.message} · 변경 ${status.translated}개`;
  }
  if (status.phase === "completed") {
    return `번역 완료 · 변경 ${status.translated}개`;
  }
  if (status.phase === "disabled") {
    return "번역 꺼짐";
  }
  return status.message || "대기 중";
}

function formatMode(mode) {
  if (mode === "chrome-translator" || mode === "chrome-ai-translator") {
    return "용어 + 문장 번역";
  }
  return "용어 사전";
}

function updatePolling(status) {
  clearTimeout(pollTimer);
  if (!status.enabled) {
    return;
  }

  if (["starting", "queued", "translating"].includes(status.phase)) {
    pollTimer = window.setTimeout(refreshStatus, 700);
  }
}

async function refreshStatus() {
  const status = await sendToTab({ type: "getStatus" });
  if (status?.ok) {
    renderStatus(status);
  }
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

function canUseOnUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return (
      (protocol === "http:" || protocol === "https:") &&
      SUPPORTED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    );
  } catch (_error) {
    return false;
  }
}
