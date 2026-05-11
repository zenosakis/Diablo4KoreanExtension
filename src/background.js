const CONFIG_KEY = "d4koTranslatorConfig";
const SUPPORTED_HOSTS = ["maxroll.gg"];

void restrictToSupportedHosts();

chrome.runtime.onInstalled.addListener(() => {
  void restrictToSupportedHosts();
});

chrome.runtime.onStartup.addListener(() => {
  void restrictToSupportedHosts();
});

async function restrictToSupportedHosts() {
  await migrateGlobalConfig();
  const tabs = await chrome.tabs.query({});

  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id && isHttpUrl(tab.url) && !isSupportedUrl(tab.url))
      .map((tab) =>
        sendDisableMessage(tab.id),
      ),
  );
}

async function sendDisableMessage(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "setEnabled",
      enabled: false,
    });
  } catch (_error) {
    // Most non-Maxroll tabs will not have this extension's content script.
  }
}

async function migrateGlobalConfig() {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const config = result[CONFIG_KEY] || {};

  const nextConfig = {
    ...config,
    enabled: false,
    enabledHosts: {
      ...(config.enabledHosts || {}),
      ...(config.enabled === true ? { "maxroll.gg": true } : {}),
    },
  };

  await chrome.storage.local.set({ [CONFIG_KEY]: nextConfig });
}

function isHttpUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function isSupportedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return SUPPORTED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch (_error) {
    return false;
  }
}
