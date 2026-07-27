chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/purify.min.js", "vendor/Readability.js", "content/transform.js"],
    });
    await flashBadge("✓", "#0a7d2c");
  } catch (err) {
    console.error("zen-view failed:", err);
    await flashBadge("!", "#c0392b");
  }
});

async function flashBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
}
