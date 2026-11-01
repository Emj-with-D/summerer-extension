// src/config.js
var SITE_URL = "https://summerer.vercel.app";

// src/api.js
var KEY = "session";
async function getSession() {
  const { [KEY]: s } = await chrome.storage.local.get(KEY);
  return s || null;
}
async function setSession(s) {
  if (s) await chrome.storage.local.set({ [KEY]: s });
  else await chrome.storage.local.remove(KEY);
}
async function login() {
  const redirect = chrome.identity.getRedirectURL();
  const url = `${SITE_URL}/api/extension/login?redirect=${encodeURIComponent(redirect)}`;
  const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const hash = new URLSearchParams(new URL(result).hash.slice(1));
  if (hash.get("error") || !hash.get("access_token")) throw new Error("\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
  const s = {
    access_token: hash.get("access_token"),
    refresh_token: hash.get("refresh_token"),
    expires_at: Number(hash.get("expires_at")),
    email: hash.get("email") || ""
  };
  await setSession(s);
  return s;
}
async function logout() {
  await setSession(null);
}
var refreshing = null;
async function freshToken() {
  const s = await getSession();
  if (!s) return null;
  if (s.expires_at * 1e3 - Date.now() > 6e4) return s.access_token;
  refreshing ??= (async () => {
    const res = await fetch(`${SITE_URL}/api/extension/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!res.ok) {
      await setSession(null);
      return null;
    }
    const n = await res.json();
    await setSession({ ...s, ...n });
    return n.access_token;
  })().finally(() => refreshing = null);
  return refreshing;
}
var ApiError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
async function call(path, { method = "GET", body } = {}) {
  const token = await freshToken();
  if (!token) throw new ApiError("\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694.", 401);
  let res;
  try {
    res = await fetch(`${SITE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...body ? { "Content-Type": "application/json" } : {} },
      body: body ? JSON.stringify(body) : void 0
    });
  } catch {
    throw new ApiError("Summerer \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC778\uD130\uB137 \uC5F0\uACB0\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) await setSession(null);
  if (!res.ok) throw new ApiError(data.error || "\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", res.status);
  return data;
}
var api = {
  startSummary: (text) => call("/api/summarize", { method: "POST", body: { text, source: "extension" } }),
  summaryStatus: (jobId) => call(`/api/summarize/${jobId}`),
  cancelSummary: (jobId) => call(`/api/summarize/${jobId}`, { method: "DELETE" }),
  listPosts: () => call("/api/posts").then((d) => d.posts),
  createPost: (p) => call("/api/posts", { method: "POST", body: p }),
  overwritePost: (id, body) => call(`/api/posts/${id}`, { method: "PUT", body: { body } }),
  prependPost: (id, label, text) => call(`/api/posts/${id}/prepend`, { method: "POST", body: { label, text } }),
  quotePost: (id, code) => call(`/api/posts/${id}/quote`, { method: "POST", body: { code } })
};

// src/datetime.js
var pad = (n) => String(n).padStart(2, "0");
function nowLabel(d = /* @__PURE__ */ new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function labelFor(text, clickedAt = /* @__PURE__ */ new Date()) {
  let date = null;
  let m = text.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if (!date) {
    m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (m) date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  }
  const t = text.match(/(?<!\d)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?!\d)/);
  const time = t ? `${pad(t[1])}:${t[2]}` : null;
  if (date) return time ? `${date} ${time}` : date;
  if (time) return `${nowLabel(clickedAt).slice(0, 10)} ${time}`;
  return nowLabel(clickedAt);
}

// src/extract.js
function toText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("p, div, li, span.block").forEach((b) => b.append("\n"));
  return clone.textContent.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function extractCaveduck(doc) {
  const panel = doc.querySelector("#chat-content-panel") || doc;
  const nodes = panel.querySelectorAll('[id^="chat-message-"]');
  const turns = [];
  nodes.forEach((msg) => {
    const clone = msg.cloneNode(true);
    clone.querySelectorAll("details, button, svg, img, textarea, [data-chat-content-id]").forEach((n) => n.remove());
    for (const child of Array.from(clone.children)) {
      if (/\bmt-2\b/.test(child.className)) continue;
      const text = toText(child);
      if (!text) continue;
      const role = /\bmb-4\b/.test(child.className) ? "user" : "character";
      turns.push({ role, text });
    }
  });
  return turns;
}
var SITES = [
  { id: "caveduck", name: "Caveduck", hosts: ["caveduck.io"], extract: extractCaveduck }
];
function siteFor(hostname) {
  return SITES.find((s) => s.hosts.some((h) => hostname === h || hostname.endsWith("." + h))) || null;
}

// src/background.js
var draftKey = (tabId) => `draft:${tabId}`;
async function setDraft(tabId, draft) {
  await chrome.storage.session.set({ [draftKey(tabId)]: draft });
}
var POLL_MS = 3e3;
var GIVE_UP_MS = 6 * 60 * 1e3;
var polling = /* @__PURE__ */ new Set();
async function getDraft(tabId) {
  const { [draftKey(tabId)]: d } = await chrome.storage.session.get(draftKey(tabId));
  return d || null;
}
async function summarizeTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  let extracted;
  try {
    extracted = await chrome.tabs.sendMessage(tabId, { type: "extract" });
  } catch {
    throw new Error("\uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
  }
  if (!extracted?.text) throw new Error("\uD654\uBA74\uC5D0\uC11C \uB300\uD654\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB300\uD654\uAC00 \uB2E4 \uBCF4\uC778 \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
  const startedAt = Date.now();
  await setDraft(tabId, { status: "loading", url: tab.url, startedAt, chars: extracted.text.length });
  const { jobId } = await api.startSummary(extracted.text);
  await setDraft(tabId, { status: "loading", url: tab.url, startedAt, chars: extracted.text.length, jobId });
  pollJob(tabId);
}
async function pollJob(tabId) {
  if (polling.has(tabId)) return;
  polling.add(tabId);
  try {
    for (; ; ) {
      const draft = await getDraft(tabId);
      if (!draft || draft.status !== "loading" || !draft.jobId) return;
      if (Date.now() - draft.startedAt > GIVE_UP_MS) {
        await setDraft(tabId, { ...draft, status: "error", error: "\uC694\uC57D\uC774 \uB05D\uB098\uC9C0 \uC54A\uC558\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." });
        return;
      }
      let res;
      try {
        res = await api.summaryStatus(draft.jobId);
      } catch (e) {
        if (e.status === 401 || e.status === 404) {
          await setDraft(tabId, { ...draft, status: "error", error: e.message });
          return;
        }
        res = null;
      }
      const latest = await getDraft(tabId);
      if (!latest || latest.jobId !== draft.jobId || latest.status !== "loading") return;
      if (res?.status === "done") {
        await setDraft(tabId, { status: "done", url: draft.url, summary: res.summary, truncated: !!res.truncated });
        return;
      }
      if (res?.status === "failed" || res?.status === "cancelled") {
        await setDraft(tabId, { ...draft, status: "error", error: res.error || "\uC694\uC57D\uC774 \uC911\uC9C0\uB410\uC5B4\uC694." });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    polling.delete(tabId);
  }
}
async function cancelTab(tabId) {
  const draft = await getDraft(tabId);
  await chrome.storage.session.remove(draftKey(tabId));
  if (draft?.jobId) await api.cancelSummary(draft.jobId).catch(() => {
  });
}
var handlers = {
  async state() {
    const s = await getSession();
    return { email: s?.email ?? null, loggedIn: !!s };
  },
  async login() {
    const s = await login();
    return { email: s.email };
  },
  async logout() {
    const all = await chrome.storage.session.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("draft:"));
    await Promise.all(keys.map((k) => all[k]?.jobId && all[k]?.status === "loading" ? api.cancelSummary(all[k].jobId).catch(() => {
    }) : null));
    await chrome.storage.session.remove(keys);
    await logout();
    return {};
  },
  async tabInfo({ tabId }) {
    const tab = await chrome.tabs.get(tabId);
    let host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch {
    }
    const site = siteFor(host);
    const { [draftKey(tabId)]: draft } = await chrome.storage.session.get(draftKey(tabId));
    let current = draft && draft.url === tab.url ? draft : null;
    if (current?.status === "loading" && (!current.jobId ? !current.startedAt || Date.now() - current.startedAt > 6e4 : Date.now() - current.startedAt > GIVE_UP_MS)) {
      current = { ...current, status: "error", error: "\uC774\uC804 \uC694\uC57D\uC774 \uC911\uB2E8\uB410\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." };
      await setDraft(tabId, current);
    }
    if (current?.status === "loading" && current.jobId) pollJob(tabId);
    return { site: site ? { id: site.id, name: site.name } : null, draft: current };
  },
  async summarize({ tabId }) {
    summarizeTab(tabId).catch(async (e) => {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      await setDraft(tabId, { status: "error", url: tab?.url, error: e.message });
    });
    return {};
  },
  async cancelSummary({ tabId }) {
    await cancelTab(tabId);
    return {};
  },
  async clearDraft({ tabId }) {
    await chrome.storage.session.remove(draftKey(tabId));
    return {};
  },
  listPosts: () => api.listPosts(),
  createPost: ({ subtitle, title, body }) => api.createPost({ subtitle, title, body }),
  overwritePost: ({ id, body }) => api.overwritePost(id, body),
  // EXT-09 드래그한 내용을 선택한 글 앞에 덧붙이기
  prependPost: ({ id, text, clickedAt }) => api.prependPost(id, labelFor(text, new Date(clickedAt)), text),
  // EXT-08 드래그한 대사를 선택한 글의 인용(QUOTE) 앞에 저장
  quotePost: ({ id, code }) => api.quotePost(id, code)
};
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  Promise.resolve(h(msg)).then((data) => sendResponse({ ok: true, data })).catch((e) => sendResponse({ ok: false, error: e?.message || "\uC624\uB958\uAC00 \uB0AC\uC5B4\uC694.", status: e?.status ?? 0 }));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(draftKey(tabId)));
