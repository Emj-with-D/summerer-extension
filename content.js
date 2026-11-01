(() => {
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
  function turnsToText(turns) {
    return turns.map((t) => `${t.role === "user" ? "[\uC0AC\uC6A9\uC790]" : "[\uCE90\uB9AD\uD130]"}
${t.text}`).join("\n\n");
  }

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

  // src/quoteCode.js
  var cleanName = (name) => name.replace(/[()\[\]\n:："“”]/g, " ").replace(/\s+/g, " ").trim();
  var cleanText = (t) => t.replace(/\[([^\[\]\n]+)\]/g, "\u2039$1\u203A");
  var cleanLine = (t) => cleanText(t).replace(/["“”]\s*\)/g, (s) => s.replace(")", " )")).trim();
  function splitDialogue(src) {
    const text = src.replace(/\r\n/g, "\n").trim();
    if (!/["“”]/.test(text)) return text ? [{ kind: "line", text }] : [];
    const parts = [];
    let buf = "";
    let inQuote = false;
    const straight = (text.match(/"/g) || []).length;
    if (straight % 2 === 1) {
      const i = text.indexOf('"');
      const before = text[i - 1] || "";
      const after = text[i + 1] || "";
      if (i > 0 && /[^\s(\[]/.test(before) && (!after || /[\s.,!?…~)\]]/.test(after))) inQuote = true;
    }
    const flush = (kind) => {
      const t = buf.trim();
      if (t) parts.push({ kind, text: t });
      buf = "";
    };
    for (const ch of text) {
      if (ch === "\u201C" && !inQuote) {
        flush("text");
        inQuote = true;
      } else if (ch === "\u201D" && inQuote) {
        flush("line");
        inQuote = false;
      } else if (ch === "\u201D" && !inQuote) {
        flush("line");
      } else if (ch === '"') {
        flush(inQuote ? "line" : "text");
        inQuote = !inQuote;
      } else {
        buf += ch;
      }
    }
    flush(inQuote ? "line" : "text");
    return parts;
  }
  function buildQuoteCode(name, src) {
    const n = cleanName(name);
    return splitDialogue(src).map((p) => p.kind === "line" ? `(${n}:"${cleanLine(p.text)}")` : cleanText(p.text)).join(" ");
  }

  // src/content.js
  var site = siteFor(location.hostname);
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type !== "extract" || !site) return false;
    const turns = site.extract(document);
    sendResponse({ site: site.id, turns: turns.length, text: turnsToText(turns) });
    return false;
  });
  var S_PATH = "M47.4041 267.819C49.0665 276.545 53.8459 290.255 68.8073 292.125V293.787C52.8069 293.06 45.8456 287.763 45.8456 287.763V267.819H47.4041ZM82.3142 255.043C96.1327 264.08 100.185 275.506 93.5352 285.374C93.5352 285.374 89.5871 292.645 76.0802 293.787V292.229C86.3662 289.528 87.5091 275.194 76.288 267.092L59.6642 256.497C47.4041 248.603 39.8195 238.735 48.1314 226.894C48.1314 226.894 52.3913 220.246 65.0669 219.104V220.662C56.2355 223.363 52.9108 235.723 65.7942 244.033L82.3142 255.043ZM92.3924 241.332C90.9378 234.061 86.3662 222.324 72.3399 220.662V219C86.4701 219.727 93.9508 223.882 93.9508 223.882V241.332H92.3924Z";
  var CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
.fab { position: fixed; z-index: 2147483646; display: flex; align-items: center; height: 34px; padding: 0 4px 0 9px; gap: 2px; border-radius: 999px;
  background: #4b5563; box-shadow: 0 4px 14px rgba(17,24,40,.28); }
.fab .s { width: 14px; height: 14px; fill: #fff; margin-right: 4px; flex: none; }
.fab button { border: 0; background: none; color: #fff; font-size: 12.5px; font-weight: 600; height: 26px; padding: 0 9px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.fab button:hover { background: rgba(255,255,255,.14); }
.fab .bar { width: 1px; height: 14px; background: rgba(255,255,255,.28); }
.panel { position: fixed; z-index: 2147483647; width: 300px; max-height: 390px; display: flex; flex-direction: column; background: #f8f7f2; color: #1f2937;
  border: 1px solid #dfdedc; border-radius: 14px; box-shadow: 0 12px 36px rgba(17,24,40,.22); overflow: hidden; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 8px; }
.title { font-size: 14px; font-weight: 700; color: #111828; }
.sub { padding: 0 14px 8px; font-size: 12px; color: #6b7280; line-height: 1.5; }
.x, .back { border: 0; background: none; cursor: pointer; line-height: 1; color: #6b7280; padding: 2px 4px; }
.x { font-size: 18px; }
.back { font-size: 12.5px; }
.list { overflow-y: auto; padding: 0 6px 8px; scrollbar-width: thin; }
.item { display: block; width: 100%; text-align: left; border: 0; background: none; cursor: pointer; padding: 9px 10px; border-radius: 10px; }
.item:hover { background: #efeee8; }
.item .s { font-size: 11px; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: .04em; }
.item .t { font-size: 14px; font-weight: 700; color: #111828; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item .p { font-size: 11.5px; color: #4b5563; margin-top: 2px; }
.form { padding: 0 14px 14px; }
.preview { font-size: 12.5px; line-height: 1.65; color: #1f2937; border: 1px solid #c5c5c7; border-radius: 10px; padding: 8px 10px; max-height: 120px; overflow: auto; white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere; }
.preview .lb { font-weight: 700; color: #111828; }
.preview .q { font-weight: 700; color: #e7792a; }
.hint { font-size: 11.5px; color: #6b7280; margin: 6px 0 0; line-height: 1.5; }
.label { font-size: 12px; font-weight: 600; color: #4b5563; margin: 12px 0 6px; }
.name { width: 100%; height: 36px; border: 1px solid #6b7380; border-radius: 10px; padding: 0 10px; font-size: 14px; background: transparent; color: #111828; outline: none; }
.name:focus { border-color: #111828; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip { border: 1px solid #dfdedc; background: #f8f7f2; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #111828; cursor: pointer; }
.chip:hover, .chip.on { background: #4b5563; border-color: #4b5563; color: #fff; }
.save { margin-top: 12px; width: 100%; height: 38px; border: 0; border-radius: 10px; background: #4b5563; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
.save:hover { background: #374151; }
.save:disabled { opacity: .5; pointer-events: none; }
.msg { padding: 14px; font-size: 13px; color: #4b5563; line-height: 1.6; }
.msg.err { color: #b86f6f; }
.err-inline { font-size: 12px; color: #b86f6f; margin-top: 8px; }
.toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 32px; transform: translateX(-50%); background: #111828; color: #fff;
  font-size: 13.5px; font-weight: 500; padding: 10px 16px; border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
`;
  if (site) {
    let hideFab = function() {
      fab?.remove();
      fab = null;
    }, closePanel = function() {
      panel?.remove();
      panel = null;
    }, toast = function(text) {
      const t = document.createElement("div");
      t.className = "toast";
      t.textContent = text;
      root.append(t);
      setTimeout(() => t.remove(), 2200);
    }, showFab = function(x, y) {
      hideFab();
      fab = document.createElement("div");
      fab.className = "fab";
      fab.setAttribute("role", "toolbar");
      fab.setAttribute("aria-label", "Summerer\uC5D0 \uC800\uC7A5");
      fab.innerHTML = `<svg class="s" viewBox="40 214 60 84" aria-hidden="true"><path d="${S_PATH}"/></svg>
      <button type="button" data-mode="summary">\uC694\uC57D\uC5D0 \uB367\uBD99\uC774\uAE30</button><span class="bar"></span><button type="button" data-mode="quote">\uC778\uC6A9\uC73C\uB85C \uC800\uC7A5</button>`;
      fab.style.left = `${clamp(x, 8, innerWidth - 230)}px`;
      fab.style.top = `${clamp(y, 8, innerHeight - 44)}px`;
      fab.addEventListener("mousedown", (e) => e.preventDefault());
      fab.querySelectorAll("button").forEach(
        (b) => b.addEventListener("click", (e) => {
          e.stopPropagation();
          openPanel(b.dataset.mode);
        })
      );
      root.append(fab);
    }, postItem = function(p) {
      return `<button class="item" data-id="${esc(p.id)}">${p.subtitle ? `<div class="s">${esc(p.subtitle)}</div>` : ""}<div class="t">${esc(p.title || "\uC81C\uBAA9 \uC5C6\uC74C")}</div>${p.period ? `<div class="p"><b>${esc(p.period.from)}</b> \uC5D0\uC11C <b>${esc(p.period.to)}</b> \uAE4C\uC9C0\uC758 \uAE30\uB85D</div>` : ""}</button>`;
    };
    const host = document.createElement("summerer-ui");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.append(style);
    document.documentElement.append(host);
    let fab = null;
    let panel = null;
    let pendingText = "";
    let anchor = { x: 0, y: 0 };
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    async function openPanel(mode) {
      hideFab();
      closePanel();
      const isQuote = mode === "quote";
      panel = document.createElement("div");
      panel.className = "panel";
      panel.style.left = `${clamp(anchor.x - 8, 8, innerWidth - 308)}px`;
      panel.style.top = `${clamp(anchor.y, 8, innerHeight - 398)}px`;
      panel.innerHTML = `<div class="head"><span class="title">${isQuote ? "\uC778\uC6A9\uC73C\uB85C \uC800\uC7A5\uD560 \uAE00 \uC120\uD0DD" : "\uB367\uBD99\uC77C \uAE00 \uC120\uD0DD"}</span><button class="x" aria-label="\uB2EB\uAE30">\xD7</button></div>
      <div class="sub">${isQuote ? "\uC120\uD0DD\uD55C \uAE00\uC758 QUOTE \uB9E8 \uC55E\uC5D0 \uB300\uC0AC\uB85C \uC800\uC7A5\uB3FC\uC694." : "\uC120\uD0DD\uD55C \uAE00\uC758 \uC694\uC57D \uB9E8 \uC55E\uC5D0 \uB0A0\uC9DC\xB7\uC2DC\uAC04\uACFC \uD568\uAED8 \uCD94\uAC00\uB3FC\uC694."}</div><div class="body"><p class="msg">\uAE00 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026</p></div>`;
      panel.querySelector(".x").addEventListener("click", closePanel);
      root.append(panel);
      const body = panel.querySelector(".body");
      let posts;
      try {
        posts = await send("listPosts");
      } catch (e) {
        if (!panel) return;
        const text = e.status === 401 ? "\uD655\uC7A5 \uC544\uC774\uCF58\uC744 \uB20C\uB7EC \uBA3C\uC800 \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694." : e.message;
        body.innerHTML = `<p class="msg err">${esc(text)}</p>`;
        return;
      }
      if (!panel) return;
      const showList = () => {
        if (!posts.length) {
          body.innerHTML = `<p class="msg">\uC544\uC9C1 \uAE00\uC774 \uC5C6\uC5B4\uC694. \uD655\uC7A5 \uC544\uC774\uCF58\uC5D0\uC11C \uBA3C\uC800 \uAE00\uC744 \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.</p>`;
          return;
        }
        body.innerHTML = `<div class="list">${posts.map(postItem).join("")}</div>`;
        body.querySelectorAll(".item").forEach(
          (btn) => btn.addEventListener("click", () => {
            const post = posts.find((p) => p.id === btn.getAttribute("data-id"));
            if (isQuote) showNameForm(post);
            else prepend(post);
          })
        );
      };
      async function prepend(post) {
        body.innerHTML = `<p class="msg">\uB367\uBD99\uC774\uB294 \uC911\u2026</p>`;
        try {
          await send("prependPost", { id: post.id, text: pendingText, clickedAt: Date.now() });
          done(`\u2018${post.title || "\uAE00"}\u2019 \uC55E\uC5D0 \uB367\uBD99\uC600\uC5B4\uC694`);
        } catch (e) {
          body.innerHTML = `<p class="msg err">${esc(e.message)}</p>`;
        }
      }
      function showNameForm(post) {
        panel.querySelector(".title").textContent = post.title || "\uC81C\uBAA9 \uC5C6\uC74C";
        panel.querySelector(".sub").innerHTML = `<button class="back" type="button">\u2190 \uAE00 \uB2E4\uC2DC \uACE0\uB974\uAE30</button>`;
        panel.querySelector(".back").addEventListener("click", () => {
          panel.querySelector(".title").textContent = "\uC778\uC6A9\uC73C\uB85C \uC800\uC7A5\uD560 \uAE00 \uC120\uD0DD";
          panel.querySelector(".sub").textContent = "\uC120\uD0DD\uD55C \uAE00\uC758 QUOTE \uB9E8 \uC55E\uC5D0 \uB300\uC0AC\uB85C \uC800\uC7A5\uB3FC\uC694.";
          showList();
        });
        const names = post.speakers || [];
        body.innerHTML = `<div class="form"><div class="label" style="margin-top:0">\uC800\uC7A5\uB420 \uB0B4\uC6A9</div><div class="preview"></div>
        <p class="hint">\uB530\uC634\uD45C \uC548\uC740 \uB300\uC0AC, \uB098\uBA38\uC9C0\uB294 \uC9C0\uBB38\uC73C\uB85C \uC800\uC7A5\uB3FC\uC694. \uC800\uC7A5 \uD6C4 \uC6F9\uC5D0\uC11C \uACE0\uCE60 \uC218 \uC788\uC5B4\uC694.</p>
        <div class="label">\uB9D0\uD55C \uC0AC\uB78C</div><input class="name" maxlength="40" placeholder="\uC608: SEVERO" />
        ${names.length ? `<div class="chips">${names.map((n) => `<button type="button" class="chip">${esc(n)}</button>`).join("")}</div>` : ""}
        <p class="err-inline" hidden></p><button type="button" class="save">\uC778\uC6A9\uC73C\uB85C \uC800\uC7A5</button></div>`;
        const input = body.querySelector(".name");
        const err = body.querySelector(".err-inline");
        const save = body.querySelector(".save");
        if (names[0]) input.value = names[0];
        const preview = body.querySelector(".preview");
        const label = labelFor(pendingText, /* @__PURE__ */ new Date());
        const renderPreview = () => {
          const code = buildQuoteCode(input.value.trim() || "\uC774\uB984", pendingText);
          const html = esc(code).replace(/\([^()\n]*?:&quot;[\s\S]*?&quot;\)/g, (m) => `<span class="q">${m}</span>`);
          preview.innerHTML = `<span class="lb">[${esc(label)}]</span> ${html}`;
        };
        const sync = () => {
          body.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.textContent === input.value.trim()));
          renderPreview();
        };
        sync();
        input.addEventListener("input", sync);
        body.querySelectorAll(".chip").forEach(
          (c) => c.addEventListener("click", () => {
            input.value = c.textContent;
            sync();
          })
        );
        input.focus();
        input.select();
        const submit = async () => {
          const name = input.value.trim();
          if (!name) {
            err.hidden = false;
            err.textContent = "\uB9D0\uD55C \uC0AC\uB78C \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
            return input.focus();
          }
          save.disabled = true;
          save.textContent = "\uC800\uC7A5 \uC911\u2026";
          try {
            await send("quotePost", { id: post.id, name, text: pendingText, clickedAt: Date.now() });
            done(`\u2018${post.title || "\uAE00"}\u2019 QUOTE\uC5D0 \uC800\uC7A5\uD588\uC5B4\uC694`);
          } catch (e) {
            err.hidden = false;
            err.textContent = e.message;
            save.disabled = false;
            save.textContent = "\uC778\uC6A9\uC73C\uB85C \uC800\uC7A5";
          }
        };
        save.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.isComposing) submit();
          if (e.key === "Escape") closePanel();
        });
      }
      function done(message) {
        closePanel();
        window.getSelection()?.removeAllRanges();
        toast(message);
      }
      showList();
    }
    document.addEventListener(
      "mouseup",
      (e) => {
        if (e.composedPath().includes(host)) return;
        setTimeout(() => {
          const sel = window.getSelection();
          const text = sel?.toString().trim() ?? "";
          if (!text || !sel.rangeCount) return hideFab();
          const node = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
          if (node?.closest("textarea, input, [contenteditable='true']")) return hideFab();
          const rects = sel.getRangeAt(0).getClientRects();
          const r = rects[rects.length - 1] || sel.getRangeAt(0).getBoundingClientRect();
          pendingText = text;
          anchor = { x: r.right, y: r.bottom + 8 };
          showFab(r.right + 6, r.bottom + 6);
        }, 0);
      },
      true
    );
    document.addEventListener(
      "mousedown",
      (e) => {
        if (e.composedPath().includes(host)) return;
        hideFab();
        closePanel();
      },
      true
    );
    document.addEventListener("scroll", hideFab, true);
    document.addEventListener("keydown", (e) => e.key === "Escape" && (hideFab(), closePanel()));
  }
})();
