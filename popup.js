(() => {
  // src/config.js
  var SITE_URL = "https://summerer.vercel.app";

  // src/messaging.js
  async function send(type, payload = {}) {
    const res = await chrome.runtime.sendMessage({ type, ...payload });
    if (!res) throw new Error("\uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8\uC744 \uB2E4\uC2DC \uBD88\uB7EC\uC640 \uC8FC\uC138\uC694.");
    if (!res.ok) {
      const err = new Error(res.error);
      err.status = res.status;
      throw err;
    }
    return res.data;
  }

  // src/popup.js
  var app = document.getElementById("app");
  var logo = (cls = "") => document.getElementById("logo").innerHTML.replace('class="logo"', `class="logo ${cls}"`);
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var chevron = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>`;
  var state = { email: null, tabId: null, site: null, draft: null, summary: "", view: "home", error: "", posts: null, saved: null };
  function header() {
    return `<header>${logo()}<div class="who"><span>${esc(state.email)}</span><button class="btn small" data-act="logout">\uB85C\uADF8\uC544\uC6C3</button></div></header>`;
  }
  var views = {
    // EXT-01 로그인
    login: () => `
    <div class="hero">${logo("big")}<p>\uD0C0\uC784\uB77C\uC778\uC744 \uB530\uB77C \uC815\uB9AC\uD558\uB294 \uC774\uC57C\uAE30</p>
      <button class="btn primary" data-act="login">Google\uB85C \uB85C\uADF8\uC778</button>
      ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    </div>
    <p class="muted center" style="font-size:12px">Summerer \uBE14\uB85C\uADF8\uC640 \uAC19\uC740 \uAD6C\uAE00 \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD558\uC138\uC694.</p>`,
    // 지원하지 않는 페이지
    unsupported: () => `${header()}
    <div class="card"><h1>\uC9C0\uC6D0\uD558\uB294 AI \uCC44\uD305 \uD654\uBA74\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694</h1>
      <p class="muted">\uC9C0\uAE08 \uC9C0\uC6D0: Caveduck<br/>\uB300\uD654 \uD654\uBA74\uC744 \uC5F0 \uB4A4 \uD655\uC7A5 \uC544\uC774\uCF58\uC744 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.</p></div>
    <a class="btn block" style="margin-top:12px" href="${SITE_URL}/posts" target="_blank">\uB0B4 \uBE14\uB85C\uADF8 \uC5F4\uAE30</a>`,
    // EXT-02 본문 전체 요약하기
    home: () => `${header()}
    <div class="card"><h1>${esc(state.site.name)} \uB300\uD654 \uC815\uB9AC</h1>
      <p class="muted">\uD604\uC7AC \uD654\uBA74\uC5D0 \uBD88\uB7EC\uC640\uC9C4 \uBA54\uC2DC\uC9C0\uAE4C\uC9C0 \uC2DC\uAC04\uC21C\uC73C\uB85C \uC694\uC57D\uD574\uC694. \uC811\uD78C \uBE14\uB85D\uC740 \uC81C\uC678\uB3FC\uC694.</p></div>
    ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    <button class="btn primary block" style="margin-top:12px" data-act="summarize">${state.error ? "\uB2E4\uC2DC \uC2DC\uB3C4" : "\uBCF8\uBB38 \uC804\uCCB4 \uC694\uC57D\uD558\uAE30"}</button>`,
    // 요약 중: 경과 시간 + 중지 버튼
    loading: () => `${header()}
    <div class="center" style="padding:24px 0 8px"><div class="spinner"></div>
      <p class="muted">\uC694\uC57D\uD558\uB294 \uC911\uC774\uC5D0\uC694 \xB7 <b id="elapsed">${elapsedText()}</b><br/>\uAE34 \uB300\uD654\uB294 1~3\uBD84 \uAC78\uB9B4 \uC218 \uC788\uC5B4\uC694.<br/>\uCC3D\uC744 \uB2EB\uC544\uB3C4 \uACC4\uC18D \uC9C4\uD589\uB3FC\uC694.</p></div>
    <div id="cancelBox" ${elapsedSec() >= CANCEL_AFTER_SEC ? "" : "hidden"}>
      <button class="btn block" style="margin-top:14px" data-act="cancel">\uC694\uC57D \uC911\uC9C0</button>
      <p class="muted center" style="font-size:12px;margin-top:8px">\uC911\uC9C0\uD558\uBA74 AI \uC694\uC57D\uB3C4 \uBC14\uB85C \uBA48\uCD94\uACE0, \uD558\uB8E8 \uD69F\uC218\uC5D0\uC11C \uBE60\uC838\uC694.</p>
    </div>`,
    // EXT-03 요약 미리보기 + EXT-04 저장 방식 선택
    preview: () => `${header()}
    <div class="top"><h1>\uC694\uC57D \uBBF8\uB9AC\uBCF4\uAE30</h1><button class="back" data-act="resummarize">\uB2E4\uC2DC \uC694\uC57D</button></div>
    ${state.draft?.truncated ? `<p class="warn">\uB300\uD654\uAC00 \uAE38\uC5B4 \uC694\uC57D\uC774 \uC911\uAC04\uC5D0 \uB04A\uACBC\uC744 \uC218 \uC788\uC5B4\uC694. \uB05D\uBD80\uBD84\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.</p>` : ""}
    <textarea id="summary" aria-label="\uC694\uC57D \uB0B4\uC6A9" spellcheck="false">${esc(state.summary)}</textarea>
    <p class="muted" style="font-size:12px;margin:6px 0 12px">\uB0B4\uC6A9\uC744 \uC9C1\uC811 \uACE0\uCE5C \uB4A4 \uC800\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.</p>
    <div class="row"><button class="btn primary" data-act="toNew">\uC0C8\uB85C \uC800\uC7A5\uD558\uAE30</button><button class="btn" data-act="toPick">\uAE30\uC874 \uAE00\uC5D0 \uB36E\uC5B4\uC4F0\uAE30</button></div>`,
    // 새로 저장하기: 소제목·제목 입력
    newPost: () => `${header()}
    <div class="top"><h1>\uC0C8\uB85C \uC800\uC7A5\uD558\uAE30</h1><button class="back" data-act="toPreview">\u2190 \uBBF8\uB9AC\uBCF4\uAE30</button></div>
    <div class="field"><label for="sub">\uC18C\uC81C\uBAA9</label><input id="sub" placeholder="\uC608: MAIN STORY" /></div>
    <div class="field"><label for="ttl">\uC81C\uBAA9</label><input id="ttl" class="title" placeholder="\uC81C\uBAA9" /></div>
    ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    <button class="btn primary block" style="margin-top:16px" data-act="saveNew">\uC800\uC7A5</button>`,
    // EXT-05 덮어쓸 글 선택
    pick: () => `${header()}
    <div class="top"><h1>\uB36E\uC5B4\uC4F8 \uAE00 \uC120\uD0DD</h1><button class="back" data-act="toPreview">\u2190 \uBBF8\uB9AC\uBCF4\uAE30</button></div>
    ${state.posts === null ? `<p class="muted center pad">\uAE00 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026</p>` : state.posts.length === 0 ? `<p class="muted center pad">\uC544\uC9C1 \uAE00\uC774 \uC5C6\uC5B4\uC694. \u2018\uC0C8\uB85C \uC800\uC7A5\uD558\uAE30\u2019\uB97C \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.</p>` : `<div class="list">${state.posts.map(
      (p) => `<button class="item" data-act="pickPost" data-id="${esc(p.id)}"><div class="meta">${p.subtitle ? `<div class="s">${esc(p.subtitle)}</div>` : ""}<div class="t">${esc(p.title || "\uC81C\uBAA9 \uC5C6\uC74C")}</div>${p.period ? `<div class="p"><b>${esc(p.period.from)}</b> \uC5D0\uC11C <b>${esc(p.period.to)}</b> \uAE4C\uC9C0\uC758 \uAE30\uB85D</div>` : ""}</div>${chevron}</button>`
    ).join("")}</div>`}
    ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}`,
    // EXT-07 완료 안내
    done: () => `${header()}
    <div class="center" style="padding:22px 0 8px">
      <div class="check"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></div>
      <h1>${state.saved.mode === "new" ? "\uBE14\uB85C\uADF8\uC5D0 \uC800\uC7A5\uD588\uC5B4\uC694" : "\uAE00\uC744 \uB36E\uC5B4\uC37C\uC5B4\uC694"}</h1>
      <p class="muted">${esc(state.saved.title)}</p>
    </div>
    <div class="row" style="margin-top:16px"><a class="btn primary" href="${SITE_URL}/posts/${esc(state.saved.id)}" target="_blank">\uBE14\uB85C\uADF8\uC5D0\uC11C \uBCF4\uAE30</a><button class="btn" data-act="close">\uB2EB\uAE30</button></div>`
  };
  var CANCEL_AFTER_SEC = 180;
  function elapsedSec() {
    const start = state.draft?.startedAt;
    return start ? Math.max(0, Math.floor((Date.now() - start) / 1e3)) : 0;
  }
  function elapsedText() {
    const sec = elapsedSec();
    return sec >= 60 ? `${Math.floor(sec / 60)}\uBD84 ${sec % 60}\uCD08` : `${sec}\uCD08`;
  }
  setInterval(() => {
    if (state.view !== "loading") return;
    const el = document.getElementById("elapsed");
    if (el) el.textContent = elapsedText();
    const box = document.getElementById("cancelBox");
    if (box && elapsedSec() >= CANCEL_AFTER_SEC) box.hidden = false;
  }, 1e3);
  function render() {
    const keepSummary = document.getElementById("summary");
    if (keepSummary) state.summary = keepSummary.value;
    app.innerHTML = views[state.view]() + `<p class="foot">Developed by @ZZEOP with Claude</p>`;
  }
  function confirmOverwrite(post) {
    const o = document.createElement("div");
    o.className = "overlay";
    o.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true"><p>\uAE30\uC874\uC5D0 \uC791\uC131\uB41C \uAE00\uC774 \uC9C0\uC6CC\uC9D1\uB2C8\uB2E4.<br/>\uB36E\uC5B4\uC4F0\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?</p>
    <div class="row"><button class="btn" data-x="cancel">\uCDE8\uC18C</button><button class="btn danger" data-x="ok">\uB36E\uC5B4\uC4F0\uAE30</button></div></div>`;
    document.body.append(o);
    return new Promise((resolve) => {
      o.addEventListener("click", (e) => {
        const x = e.target.closest("[data-x]")?.dataset.x;
        if (!x && e.target !== o) return;
        o.remove();
        resolve(x === "ok");
      });
    });
  }
  function go(view, extra = {}) {
    Object.assign(state, { error: "" }, extra, { view });
    render();
  }
  function applyDraft(draft) {
    state.draft = draft;
    if (!draft) return go("home");
    if (draft.status === "loading") return go("loading");
    if (draft.status === "error") return go("home", { error: draft.error });
    if (draft.status === "done") {
      state.summary = draft.summary;
      if (!["newPost", "pick", "done"].includes(state.view)) go("preview");
    }
  }
  var actions = {
    async login() {
      try {
        const r = await send("login");
        state.email = r.email;
        await loadTab();
      } catch (e) {
        go("login", { error: e.message?.includes("canceled") || e.message?.includes("closed") ? "" : e.message || "\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694." });
      }
    },
    async logout() {
      await send("logout");
      go("login", { email: null });
    },
    async summarize() {
      state.draft = { startedAt: Date.now() };
      go("loading");
      await send("summarize", { tabId: state.tabId });
    },
    async cancel(btn) {
      btn.disabled = true;
      btn.textContent = "\uC911\uC9C0\uD558\uB294 \uC911\u2026";
      await send("cancelSummary", { tabId: state.tabId });
      state.draft = null;
      go("home", { error: "" });
    },
    resummarize: () => actions.summarize(),
    toPreview: () => go("preview"),
    toNew: () => {
      state.summary = document.getElementById("summary")?.value ?? state.summary;
      if (!state.summary.trim()) return go("preview", { error: "" });
      go("newPost");
      document.getElementById("ttl")?.focus();
    },
    async toPick() {
      state.summary = document.getElementById("summary")?.value ?? state.summary;
      go("pick", { posts: null });
      try {
        state.posts = await send("listPosts");
        render();
      } catch (e) {
        go("pick", { posts: [], error: e.message });
        if (e.status === 401) go("login", { error: "\uB2E4\uC2DC \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694." });
      }
    },
    async saveNew(btn) {
      const subtitle = document.getElementById("sub").value.trim();
      const title = document.getElementById("ttl").value.trim();
      if (!title) {
        state.error = "\uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
        render();
        document.getElementById("sub").value = subtitle;
        document.getElementById("ttl").focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "\uC800\uC7A5 \uC911\u2026";
      try {
        const r = await send("createPost", { subtitle, title, body: state.summary });
        await send("clearDraft", { tabId: state.tabId });
        go("done", { saved: { mode: "new", id: r.id, title } });
      } catch (e) {
        go("newPost", { error: e.message });
        document.getElementById("sub").value = subtitle;
        document.getElementById("ttl").value = title;
      }
    },
    async pickPost(btn) {
      const post = state.posts.find((p) => p.id === btn.dataset.id);
      if (!post || !await confirmOverwrite(post)) return;
      btn.disabled = true;
      try {
        await send("overwritePost", { id: post.id, body: state.summary });
        await send("clearDraft", { tabId: state.tabId });
        go("done", { saved: { mode: "overwrite", id: post.id, title: post.title } });
      } catch (e) {
        go("pick", { error: e.message });
      }
    },
    close: () => window.close()
  };
  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el);
  });
  async function loadTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tab?.id ?? null;
    const info = state.tabId ? await send("tabInfo", { tabId: state.tabId }) : { site: null, draft: null };
    state.site = info.site;
    if (!state.site) return go("unsupported");
    applyDraft(info.draft);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session" || !state.tabId) return;
    const c = changes[`draft:${state.tabId}`];
    if (c && c.newValue) applyDraft(c.newValue);
  });
  (async () => {
    const s = await send("state");
    state.email = s.email;
    if (!s.loggedIn) return go("login");
    await loadTab();
  })();
})();
