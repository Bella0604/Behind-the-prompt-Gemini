"use strict";

/* ---------- 状态 ---------- */

const app = document.getElementById("app");
const dialog = document.getElementById("experience-dialog");
const statusBox = document.getElementById("status-message");

const audienceLabels = {
  friend: "One friend",
  chosen: "People I choose",
  link: "Anyone with the link"
};

const lightingLabels = {
  brighten: "Brighten the image",
  soften: "Soften the shadows"
};

function newSession() {
  return {
    page: 1,
    id: `BTP-${Date.now().toString(36).toUpperCase()}`,
    date: new Date().toLocaleString(),
    audience: "",
    lighting: "",
    messages: [],
    draft: "",
    example: false,
    aiConsent: false,
    aiBusy: false,
    aiError: "",
    aiTransfers: [],
    original: "",
    edited: "",
    imageName: "",
    imageWidth: 0,
    imageHeight: 0,
    applied: false,
    chatDecision: "",
    imageDecision: "",
    recorded: false
  };
}

let state = newSession();
let imageVersion = 0;
let noticeTimer;
let aiController;

/* ---------- 通用工具 ---------- */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatReply(text) {
  // Escape provider text before adding our own formatting; never render its HTML.
  return escapeHTML(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function wrapReceiptText(text, measure, maxWidth) {
  const rows = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = "";
    // Keep English words together; allow CJK text to wrap between characters.
    const tokens = paragraph.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|[^\s\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+|[ \t]+/gu) || [];
    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        if (line) line += " ";
        continue;
      }
      if (line && measure.measureText(line + token).width > maxWidth) {
        rows.push(line.trimEnd());
        line = "";
      }
      // Only split a single token when it cannot fit on a line by itself.
      for (const character of token) {
        if (line && measure.measureText(line + character).width > maxWidth) {
          rows.push(line.trimEnd());
          line = "";
        }
        line += character;
      }
    }
    rows.push(line.trimEnd());
  }
  return rows;
}

function button(label, action, secondary = false, disabled = false) {
  return `
    <button
      type="button"
      class="button ${secondary ? "button-secondary" : ""}"
      data-action="${action}"
      ${disabled ? "disabled" : ""}
    >${escapeHTML(label)}</button>
  `;
}

function choice(label, action, selected) {
  return `
    <button
      type="button"
      class="choice"
      data-action="${action}"
      aria-pressed="${selected}"
    >${selected ? "✓" : "○"} ${escapeHTML(label)}</button>
  `;
}

function notify(message) {
  clearTimeout(noticeTimer);
  statusBox.textContent = message;
  noticeTimer = setTimeout(() => {
    statusBox.textContent = "";
  }, 4500);
}

function invalidateDecisions() {
  state.recorded = false;
}

function go(page) {
  if (dialog.open) dialog.close();
  state.page = page;
  render();
  window.scrollTo(0, 0);
  document.getElementById("main-content").focus();
}

function openDialog(content) {
  if (dialog.open) dialog.close();

  dialog.innerHTML = `
    <div class="dialog-content">
      ${content}
      ${button("Return to the experience", "close", true)}
    </div>
  `;

  dialog.showModal();
}

function heading(label, title) {
  return `
    <div class="scene-heading">
      <p class="eyebrow">${label}</p>
      <h2>${title}</h2>
    </div>
  `;
}

function imagePreview(source, caption) {
  return `
    <figure class="image-preview">
      ${
        source
          ? `<img src="${source}" alt="${escapeHTML(caption)}">`
          : `<div class="image-empty">
               <span>[ + ]</span>
               <p>${escapeHTML(caption)}</p>
             </div>`
      }
      <figcaption class="meta">${escapeHTML(caption)}</figcaption>
    </figure>
  `;
}

/* ---------- 第一屏 ---------- */

function homePage() {
  return `
    <div class="home-layout">
      <section class="home-copy">
        <p class="eyebrow">A STUDY OF WHAT LEAVES THE FRAME</p>
        <h1>BEHIND<br>THE PROMPT</h1>

        <p class="home-subtitle">
          You know what you shared.<br>
          Do you know what changed?
        </p>

        <button
          class="button button-start"
          type="button"
          data-action="begin"
        >Begin the experience</button>

        <p class="home-caption">
          Two everyday AI tasks.
          One receipt that keeps the context in view.
        </p>

        <p class="home-index">
          01 / ACCESS &nbsp; 02 / PURPOSE &nbsp; 03 / RECEIPT
        </p>

        <p class="handwritten home-note">in whose hands?</p>
      </section>

      <aside class="character-panel" aria-label="Data artwork">
        <p class="character-caption">DATA / CONTEXT / CONTROL</p>
      </aside>
    </div>
  `;
}

/* ---------- 第二屏 ---------- */

function sharePage() {
  const messages = state.messages.map(message => `
    <div class="message">
      <p class="message-label">
        ${message.role === "user"
          ? (state.example ? "ALEX / EXAMPLE" : "YOU")
          : (message.example ? "OPENTHREAD / SCRIPTED EXAMPLE" : "OPENTHREAD / AI REPLY")}
      </p>
      <p>${message.role === "assistant" ? formatReply(message.text) : escapeHTML(message.text).replace(/\n/g, "<br>")}</p>
    </div>
  `).join("");

  return `
    ${heading("01 / AUDIENCE", "A PRIVATE CONVERSATION.")}

    <div class="two-column">
      <section class="card stack">
        <h3 class="card-heading">OpenThread Chat</h3>

        <p class="helper-text">
          Real AI replies are powered by Google’s Gemini API through this project’s backend.
          Sending a message transmits the current conversation, including earlier replies,
          to that backend and Google. Your image is never included.
          Link sharing and advertising reuse remain fictional scenarios.
        </p>

        <label class="ai-consent">
          <input id="ai-consent" type="checkbox" ${state.aiConsent ? "checked" : ""} ${state.aiBusy ? "disabled" : ""}>
          <span>I am 18 or older and will use fictional or non-personal questions only. I agree to send this conversation to the project backend and Google. Free-tier inputs and replies may be used to improve Google products and reviewed by humans.</span>
        </label>
        <p class="helper-text">Do not enter personal, sensitive or confidential information. Free-tier limits apply; Alex’s example works offline. Clearing this page does not delete data already sent to the provider. AI replies may be inaccurate.</p>
        <div class="divider"></div>

        <div class="chat-messages" aria-live="polite">
          ${messages || "<p>Ask your own question, or load Alex’s offline example.</p>"}
          ${state.aiBusy ? '<p class="ai-pending" role="status">Waiting for an AI reply…</p>' : ""}
          ${state.aiError ? `<div class="ai-error" role="alert"><p>${escapeHTML(state.aiError)}</p>${button("Retry last message", "retry-ai", true, !state.aiConsent)}${button("Remove last question", "discard-turn", true)}</div>` : ""}
        </div>

        <form id="chat-form" class="chat-form">
          <label for="chat-input" class="message-label">
            YOUR MESSAGE
          </label>

          <textarea
            id="chat-input"
            maxlength="4000"
            placeholder="Ask a general question or describe a fictional situation. No personal or confidential information."
            required
            ${state.aiBusy ? "disabled" : ""}
          >${escapeHTML(state.draft)}</textarea>

          <p class="helper-text">
            Enter to send. Shift + Enter for a new line.
          </p>

          <button class="button" type="submit" ${!state.aiConsent || state.aiBusy || state.aiError ? "disabled" : ""}>
            ${state.aiBusy ? "Generating reply…" : "Send to AI"}
          </button>
        </form>

        <div class="actions">
          ${button("Load Alex’s example", "example", true, state.aiBusy)}
          ${button("Clear conversation", "clear-chat", true, state.aiBusy)}
        </div>
      </section>

      <section class="card card-blue stack">
        <h3>Who do you expect to see this conversation?</h3>

        <p>Choose your expectation for sharing this conversation.</p>

        ${Object.entries(audienceLabels).map(([key, label]) =>
          choice(label, `audience:${key}`, state.audience === key)
        ).join("")}

        <p class="helper-text">
          This records your expectation;
          it does not set access permissions.
        </p>

        ${button(
          "Create sharing link",
          "create-link",
          false,
          state.aiBusy || Boolean(state.aiError) || !state.audience ||
          !state.messages.some(message => message.role === "user")
        )}

        <p class="helper-text">
          The link and forwarding sequence are fictional.
          Nothing is published or sent to another person.
        </p>
      </section>
    </div>
  `;
}

function sendMessage() {
  const input = document.getElementById("chat-input");
  if (!input || state.aiBusy || state.aiError) return;
  if (!state.aiConsent) { notify("Please agree to AI processing before sending."); return; }
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  if (text.length > 4000) { notify("Please keep your message within 4,000 characters."); return; }
  if (state.example) {
    openDialog(`<h2>Start your own AI conversation?</h2><p>Alex’s scripted conversation will be replaced. Your typed question will stay here; send it after returning.</p>${button("Start my own conversation", "own-chat")}`);
    return;
  }
  state.messages.push({ role: "user", text });
  state.draft = "";
  requestAI();
}

async function requestAI() {
  if (!state.aiConsent || state.aiBusy || !state.messages.length) return;
  const session = state;
  const transfer = { status: "unconfirmed", reply: false, time: new Date().toISOString() };
  session.aiTransfers.push(transfer);
  session.aiBusy = true;
  session.aiError = "";
  invalidateDecisions();
  aiController = new AbortController();
  const controller = aiController;
  const timeout = setTimeout(() => controller.abort(), 65000);
  render();
  try {
    const base = String(window.BTP_CONFIG?.apiBase || "http://localhost:8787").replace(/\/$/, "");
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true, messages: session.messages.map(({role, text}) => ({role, content: text})) }),
      signal: controller.signal
    });
    const result = await response.json();
    if (["provider-requested", "not-forwarded"].includes(result.transfer)) transfer.status = result.transfer;
    if (!response.ok) throw new Error(result.error || "The AI request failed. Please retry.");
    if (typeof result.reply !== "string" || !result.reply.trim()) throw new Error("No AI reply was received. Please retry.");
    transfer.status = "provider-requested";
    transfer.reply = true;
    transfer.model = typeof result.model === "string" ? result.model.slice(0, 160) : "Not returned";
    if (state !== session) return;
    session.messages.push({ role: "assistant", text: result.reply });
  } catch (error) {
    if (state !== session) return;
    session.aiError = error.name === "AbortError"
      ? "The request timed out or was cancelled. Delivery to the provider is unconfirmed; retrying may send the conversation again."
      : error instanceof TypeError
        ? "Cannot reach the AI backend. Check that it is running and config.js has the correct address. Delivery is unconfirmed."
        : error.message;
  } finally {
    clearTimeout(timeout);
    if (aiController === controller) aiController = undefined;
    if (state === session) {
      session.aiBusy = false;
      if (state.page === 2) {
        render();
        const list = document.querySelector(".chat-messages");
        if (list) list.scrollTop = list.scrollHeight;
        document.getElementById("chat-input")?.focus();
      }
    }
  }
}

function loadExample() {
  state.messages = [
    {
      role: "user",
      text:
        "I’ve been feeling overwhelmed at work. " +
        "I’m worried that asking for time off will make my manager think I’m unreliable."
    },
    {
      role: "assistant",
      text:
        "You could describe the support you need without sharing every personal detail. " +
        "Would you like help drafting a short message?"
    },
    {
      role: "user",
      text:
        "Yes. I want to ask a close friend what they think before I send it."
    }
  ];

  state.messages = state.messages.map(message => ({ ...message, example: true }));
  state.aiError = "";
  state.example = true;
  state.draft = "";
  invalidateDecisions();
  render();
}

/* ---------- 第三屏 ---------- */

function audiencePage() {
  const matches = state.audience === "link";

  return `
    ${heading("01 / AUDIENCE REVEAL", "WHO ELSE CAN SEE IT?")}

    <div class="two-column">
      <section class="card card-yellow stack">
        <p class="meta">YOUR EXPECTATION</p>
        <h3>${audienceLabels[state.audience]}</h3>

        <div class="divider"></div>

        <p class="meta">LINK ACCESS IN THIS SCENARIO</p>
        <h3>Anyone with the link</h3>

        <p>
          ${matches
            ? "A forwarded recipient can open the link. This matches your chosen link-access expectation."
            : "A forwarded recipient opens the conversation without being selected by the person who shared it."}
        </p>

        <p class="helper-text">
          Scenario rule: no sign-in or recipient check is required.
          Your real conversation has not been published.
        </p>

        ${button("Continue to the image task", "image-task")}
      </section>

      <section class="card card-blue stack">
        <p class="meta">POSSIBLE SEARCH DISCOVERY — SIMULATED</p>

        <div class="search-preview stack">
          <p class="meta">openthread.example/shared/demo</p>
          <p class="card-heading">OpenThread shared conversation</p>
          <p>
            “${escapeHTML(
              state.messages.find(message => message.role === "user")
                ?.text.slice(0, 100) || ""
            )}…”
          </p>
        </div>

        <p class="card-heading">A second possibility: search discovery</p>

        <p>
          Search discovery is a separate possibility.
          Link access alone does not establish that a page is indexed.
        </p>
      </section>
    </div>
  `;
}

/* ---------- 第四屏 ---------- */

function imagePage() {
  return `
    ${heading("02 / PURPOSE", "AN IMAGE. AN INTENTION.")}

    <div class="two-column">
      <section class="card card-yellow stack">
        <div class="image-toolbar">
          <p class="card-heading">OpenThread Image Studio</p>
          ${button("Choose an image", "choose-image", true)}
        </div>

        <input
          id="image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
        >

        <div class="image-pair">
          ${imagePreview(state.original, "BEFORE / YOUR CHOSEN IMAGE")}
          ${imagePreview(state.edited, "AFTER / YOUR LIGHTING EDIT")}
        </div>

        <p class="helper-text">
          JPEG, PNG or WebP, up to 20 MB.
          The image is processed in this browser and is not uploaded.
        </p>

        ${state.imageName
          ? `<p class="meta">${escapeHTML(state.imageName)}</p>`
          : ""}
      </section>

      <section class="card card-blue stack">
        <h3>Choose an image for a lighting edit.</h3>
        <p>Choose a lighting adjustment.</p>

        ${Object.entries(lightingLabels).map(([key, label]) =>
          choice(label, `lighting:${key}`, state.lighting === key)
        ).join("")}

        <p class="helper-text">
          Your agreed purpose: lighting adjustment only. This is a local edit, not AI image generation.
        </p>

        ${button(
          "Apply lighting edit",
          "apply-edit",
          false,
          !state.original || !state.lighting
        )}

        ${state.applied
          ? `<p>Lighting edit applied.</p>
             ${button("Continue", "purpose")}`
          : ""}
      </section>
    </div>
  `;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be opened."));
    image.src = source;
  });
}

async function selectImage(file) {
  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    notify("Please choose a JPEG, PNG or WebP image.");
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    notify("Please choose an image smaller than 20 MB.");
    return;
  }

  const version = ++imageVersion;
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    if (version !== imageVersion) return;

    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    state.original = canvas.toDataURL("image/png");
    state.edited = "";
    state.imageName = file.name;
    state.imageWidth = canvas.width;
    state.imageHeight = canvas.height;
    state.applied = false;

    invalidateDecisions();
    render();
    notify("Image selected. Choose a lighting adjustment.");
  } catch {
    notify("This image could not be opened. Please try another file.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function applyLighting() {
  if (!state.original || !state.lighting) return;

  const version = imageVersion;
  const source = state.original;
  const lighting = state.lighting;

  try {
    const image = await loadImage(source);

    if (
      version !== imageVersion ||
      source !== state.original ||
      lighting !== state.lighting
    ) return;

    const canvas = document.createElement("canvas");
    canvas.width = state.imageWidth;
    canvas.height = state.imageHeight;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        const value = pixels.data[i + channel];

        pixels.data[i + channel] = lighting === "brighten"
          ? Math.min(255, value * 1.1 + 8)
          : Math.min(255, value + 30 * Math.pow(1 - value / 255, 2));
      }
    }

    context.putImageData(pixels, 0, 0);
    state.edited = canvas.toDataURL("image/png");
    state.applied = true;

    invalidateDecisions();

    if (state.page === 4) render();
    notify("Lighting edit applied.");
  } catch {
    notify("The edit could not be applied. Please choose another image.");
  }
}

/* ---------- 第五屏 ---------- */

function purposePage() {
  return `
    ${heading(
      "02 / PURPOSE CHANGE",
      "SAME IMAGE.<br>ANOTHER PURPOSE."
    )}

    <div class="two-column">
      <section class="card card-blue stack">
        <p class="meta">ORIGINAL TASK</p>
        <h3>${lightingLabels[state.lighting]}</h3>

        <div class="divider"></div>

        <p class="meta">NEW USE / PROMOTIONAL ADVERTISING</p>

        <p>
          In this fictional scenario, your image appears in a
          promotional layout. This new purpose was not included
          in the lighting edit.
        </p>

        <p><strong>Permission before the new purpose: not requested.</strong></p>

        <p class="helper-text">
          This is a simulated reuse scenario.
          Your image has not been sent to an advertiser.
        </p>

        ${button("View my Privacy Receipt", "receipt")}
      </section>

      <section class="card stack">
        <p class="meta">FICTIONAL PROMOTIONAL USE</p>

        <div class="ad-layout">
          <div class="stack">
            <h3><em>Daylight</em></h3>
            <h3>Make room<br>for your day.</h3>
            <p>Same image.<br>A different purpose.</p>
          </div>

          ${imagePreview(state.edited, "YOUR IMAGE / SIMULATED AD USE")}
        </div>

        <p>Lighting consent did not include advertising.</p>
      </section>
    </div>
  `;
}

/* ---------- 第六屏 ---------- */

function decisionText(task, answer) {
  if (!answer) return "Not reviewed yet";
  if (answer === "yes") return "Continue under the scenario shown.";

  if (answer === "no") {
    return task === "chat"
      ? "Do not share under these conditions."
      : "Do not use the image tool under these conditions.";
  }

  return task === "chat"
    ? "Continue only with named access and a revocable link."
    : "Continue only with new permission before advertising reuse.";
}

function receiptSections() {
  return [
    {
      title: "01 — CONVERSATION",
      lines: [
        ["DATA PROVIDED", state.example ? "Alex’s fictional conversation" : "Your entered conversation"],
        ["USER EXPECTATION", audienceLabels[state.audience]],
        ["AI SERVICE", "Google / Gemini via project backend"],
        ["ACTUAL AI REQUESTS", `${state.aiTransfers.length} attempted; ${state.aiTransfers.filter(item => item.status === "provider-requested").length} provider requests confirmed by backend; ${state.aiTransfers.filter(item => item.reply).length} replies received`],
        ["NOT FORWARDED", `${state.aiTransfers.filter(item => item.status === "not-forwarded").length} attempts rejected by backend before provider request`],
        ["DELIVERY UNCERTAINTY", `${state.aiTransfers.filter(item => item.status === "unconfirmed").length} requests with unconfirmed delivery`],
        ["ACTUAL DATA FLOW", state.aiTransfers.length ? "Browser attempts send current chat history to the backend. Only backend-confirmed provider requests are listed as forwarded to Google. Images excluded; retries may resend history. Clearing chat does not clear earlier request records." : "No AI requests made in this session"],
        ["FREE-TIER DATA USE", "Google may use inputs and replies for product improvement and human review. Use fictional or non-personal content only."],
        ["PROVIDER STORAGE", "Not verified by this receipt; clearing this page does not delete provider records"],
        ["SCENARIO EVENT", "Forwarded recipient opens link"],
        ["POSSIBLE FURTHER CHANGE", "Search discovery"],
        ["CONTROL SHIFT", state.audience === "link"
          ? "Link access matches expectation"
          : "Audience extends beyond expectation"]
      ]
    },
    {
      title: "02 — IMAGE",
      lines: [
        ["DATA PROVIDED", "Your locally selected image"],
        ["USER EXPECTATION", lightingLabels[state.lighting]],
        ["ACTUAL PROCESSING", "Local browser lighting edit; no image sent to AI or backend"],
        ["SCENARIO EVENT", "Image appears in a fictional advertising layout"],
        ["CONTROL SHIFT", "No new permission requested in the scenario"]
      ]
    },
    {
      title: "PRIVACY SUMMARY",
      lines: [
        ["SESSION ID", state.id],
        ["TASKS REVIEWED", "02"],
        ["SCENARIO ACCESS", "Link holders"],
        ["FURTHER DISCOVERY", "Possible, not confirmed"],
        ["EXPECTED PURPOSE", "Lighting edit"],
        ["SCENARIO REUSE", "Advertising"],
        ["RECORD TYPE", "Local request record plus simulated privacy scenarios; not a provider activity log"]
      ]
    },
    {
      title: "YOUR RECORDED DECISIONS",
      lines: [
        ["CHAT SHARING", state.recorded
          ? decisionText("chat", state.chatDecision)
          : "Not recorded yet"],
        ["IMAGE EDITING", state.recorded
          ? decisionText("image", state.imageDecision)
          : "Not recorded yet"],
        ["NOTE", "Requested conditions do not activate real platform controls."]
      ]
    }
  ];
}

function decisionChoices(task, selected) {
  return [
    ["yes", "Yes"],
    ["controls", "Only with these controls"],
    ["no", "No"]
  ].map(([key, label]) =>
    choice(label, `decision:${task}:${key}`, selected === key)
  ).join("");
}

function receiptPage() {
  const sections = receiptSections();

  return `
    <div class="actions">
      ${button(
        "Download my receipt PNG",
        "download",
        false,
        !state.recorded
      )}
    </div>

    <p class="receipt-progress">
      Read the receipt below. Record both decisions to enable download.
    </p>

    <div class="receipt-layout">
      <article class="privacy-receipt stack">
        <div class="receipt-title">
          <h3>PRIVACY RECEIPT</h3>
          <p>BEHIND THE PROMPT</p>
        </div>

        <p class="meta">
          USER: ${state.example ? "ALEX / EXAMPLE" : "THIS PARTICIPANT"}<br>
          DATE: ${escapeHTML(state.date)}<br>
          DATA ITEMS: 02
        </p>

        ${sections.map((section, index) => `
          <section class="receipt-section stack">
            <h4>${section.title}</h4>

            ${section.lines.map(([label, value]) => `
              <div>
                <p class="receipt-label">${label}</p>
                <p>${escapeHTML(value || "")}</p>
              </div>
            `).join("")}

            ${index < 2
              ? `<p class="receipt-stamp">
                  ${index === 0
                    ? (state.audience === "link"
                      ? "LINK ACCESS AS EXPECTED"
                      : "AUDIENCE BEYOND EXPECTATION")
                    : "PURPOSE CONTROL AT RISK"}
                 </p>`
              : ""}
          </section>
        `).join("")}

        <p class="meta">
          Raw conversation text and your photo are excluded from this PNG.
        </p>
      </article>

      <section class="card card-blue stack">
        <p class="meta">YOUR NEXT DECISION</p>
        <h3>What would you choose now?</h3>

        ${state.recorded
          ? `
            <p>Your decisions are recorded.</p>

            <p class="meta">CHAT SHARING</p>
            <p>${decisionText("chat", state.chatDecision)}</p>

            <p class="meta">IMAGE EDITING</p>
            <p>${decisionText("image", state.imageDecision)}</p>

            ${button("Review my decisions", "review", true)}
            ${button("Download my receipt PNG", "download")}
          `
          : `
            <p>
              Still share? Proposed controls:
              named access and a link you can revoke.
            </p>

            ${decisionChoices("chat", state.chatDecision)}

            <p>
              Still edit the image? Proposed control:
              new permission before advertising reuse.
            </p>

            ${decisionChoices("image", state.imageDecision)}

            ${button(
              "Record my decisions",
              "record",
              false,
              !state.chatDecision || !state.imageDecision
            )}
          `
        }

        <p class="helper-text">
          There is no right answer. These decisions do not activate
          real platform privacy controls.
        </p>

        ${button("Restart experience", "restart", true)}
      </section>
    </div>
  `;
}

/* ---------- PNG 收据导出 ---------- */

async function downloadReceipt() {
  if (!state.recorded) {
    notify("Please record both decisions first.");
    return;
  }

  try {
    await document.fonts.load('18px "Space Mono"');

    const lines = [];

    lines.push(["title", "PRIVACY RECEIPT"]);
    lines.push(["center", "BEHIND THE PROMPT"]);
    lines.push(["small", `USER: ${state.example ? "ALEX / EXAMPLE" : "THIS PARTICIPANT"}`]);
    lines.push(["small", `DATE: ${state.date}`]);

    for (const section of receiptSections()) {
      lines.push(["section", section.title]);

      for (const [label, value] of section.lines) {
        lines.push(["label", label]);
        lines.push(["body", value || ""]);
        lines.push(["gap", ""]);
      }
    }

    lines.push(["small", "Raw conversation and photo excluded."]);

    const measure = document.createElement("canvas").getContext("2d");
    const rows = [];

    for (const [type, text] of lines) {
      const size = type === "title" ? 32 : type === "section" ? 20
        : type === "small" ? 12 : type === "label" ? 14 : 17;

      const lineHeight = type === "gap" ? 12 : Math.ceil(size * 1.45);

      if (type === "gap") {
        rows.push({ type, text: "", size, lineHeight });
        continue;
      }

      measure.font = `${size}px "Space Mono", monospace`;

      for (const line of wrapReceiptText(text, measure, 392)) {
        rows.push({ type, text: line, size, lineHeight });
      }
    }

    const height = 64 + rows.reduce((sum, row) =>
      sum + row.lineHeight + (row.type === "section" ? 24 : 0), 0
    );

    const canvas = document.createElement("canvas");
    canvas.width = 880;
    canvas.height = height * 2;

    const context = canvas.getContext("2d");
    context.scale(2, 2);

    context.fillStyle = "#fcf9f3";
    context.fillRect(0, 0, 440, height);
    context.textBaseline = "top";

    let y = 24;

    for (const row of rows) {
      if (row.type === "section") {
        y += 12;
        context.fillStyle = "#b9b9b9";
        context.fillRect(24, y, 392, 1);
        y += 12;
      }

      context.font = `${row.size}px "Space Mono", monospace`;
      context.fillStyle =
        row.type === "small" ? "#817979" :
        row.type === "section" && row.text.startsWith("01") ? "#2aadea" :
        row.type === "section" && row.text.startsWith("02") ? "#ff0307" :
        "#171717";

      const centered = ["title", "center"].includes(row.type);
      context.textAlign = centered ? "center" : "left";

      if (row.type !== "gap") {
        context.fillText(row.text, centered ? 220 : 24, y);
      }

      y += row.lineHeight;
    }

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/png")
    );

    if (!blob) throw new Error("PNG generation failed.");

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${state.id}-privacy-receipt.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify("Your receipt PNG has been generated.");
  } catch {
    notify("The receipt could not be saved. Please try again.");
  }
}

/* ---------- 页面渲染 ---------- */

function render() {
  const pages = [
    homePage,
    sharePage,
    audiencePage,
    imagePage,
    purposePage,
    receiptPage
  ];

  document.body.dataset.theme = state.page === 1 ? "light" : "dark";

  app.innerHTML = `
    <header class="site-header">
      <span>BEHIND THE PROMPT</span>
      <span class="page-number">
        ${String(state.page).padStart(2, "0")} / 06
      </span>
      ${state.page > 1 ? button("Back", "back", true) : ""}
    </header>

    <main
      id="main-content"
      class="scene"
      tabindex="-1"
    >
      ${pages[state.page - 1]()}
    </main>

    <footer class="scene-footer">
      <span>
        ${state.page === 1
          ? "AN INTERACTIVE PRIVACY STUDY"
          : "AI CHAT / LOCAL IMAGE EDIT / FICTIONAL REUSE"}
      </span>
      <span>DATA / CONTEXT / CONTROL</span>
    </footer>
  `;
}

/* ---------- 点击处理 ---------- */

document.addEventListener("click", event => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;

  const action = target.dataset.action;

  if (action.startsWith("audience:")) {
    state.audience = action.split(":")[1];
    invalidateDecisions();
    render();
    return;
  }

  if (action.startsWith("lighting:")) {
    state.lighting = action.split(":")[1];
    state.applied = false;
    state.edited = "";
    invalidateDecisions();
    render();
    return;
  }

  if (action.startsWith("decision:")) {
    const [, task, answer] = action.split(":");
    state[task === "chat" ? "chatDecision" : "imageDecision"] = answer;
    state.recorded = false;
    render();
    return;
  }

  switch (action) {
    case "begin":
      go(2);
      break;

    case "back":
      go(Math.max(1, state.page - 1));
      break;

    case "close":
      dialog.close();
      break;

    case "retry-ai":
      requestAI();
      break;

    case "discard-turn":
      if (!state.aiBusy && state.aiError) {
        const last = state.messages.at(-1);
        if (last?.role === "user") { state.draft = last.text; state.messages.pop(); }
        state.aiError = "";
        invalidateDecisions();
        render();
      }
      break;

    case "own-chat":
      dialog.close();
      state.messages = [];
      state.example = false;
      state.aiError = "";
      invalidateDecisions();
      render();
      break;

    case "example":
      openDialog(`
        <h2>Load Alex’s example?</h2>
        <p>This replaces the conversation currently on screen.</p>
        ${button("Load the example", "confirm-example")}
      `);
      break;

    case "confirm-example":
      dialog.close();
      loadExample();
      break;

    case "clear-chat":
      openDialog(`
        <h2>Clear this conversation?</h2>
        <p>The current messages will be removed from this browser session. This does not delete data already sent to Google; request counts remain in your receipt.</p>
        ${button("Clear conversation", "confirm-clear")}
      `);
      break;

    case "confirm-clear":
      dialog.close();
      state.messages = [];
      state.aiError = "";
      state.draft = "";
      state.example = false;
      invalidateDecisions();
      render();
      break;

    case "create-link":
      if (state.aiBusy || state.aiError || !state.audience || !state.messages.length) return;

      openDialog(`
        <p class="meta">FICTIONAL SHARING DEMO</p>
        <h2>Your link is ready.</h2>
        <p>Your expectation: ${audienceLabels[state.audience]}</p>
        <p class="meta">openthread.example/shared/demo</p>
        <p>No real link has been created.</p>
        ${button("Simulate sending to a friend", "send-link")}
      `);
      break;

    case "send-link":
      openDialog(`
        <p class="meta">FICTIONAL SHARING DEMO</p>
        <h2>A link can travel.</h2>
        <p>
          You send the link to a friend.
          The friend forwards it to another person.
        </p>
        <p>You did not choose this new recipient.</p>
        ${button("Open as the new recipient", "reveal-audience")}
      `);
      break;

    case "reveal-audience":
      go(3);
      break;

    case "image-task":
      go(4);
      break;

    case "choose-image":
      document.getElementById("image-input").click();
      break;

    case "apply-edit":
      applyLighting();
      break;

    case "purpose":
      if (state.applied) go(5);
      break;

    case "receipt":
      if (state.applied) go(6);
      break;

    case "record":
      if (state.chatDecision && state.imageDecision) {
        state.recorded = true;
        render();
        notify("Your decisions are recorded.");
      }
      break;

    case "review":
      state.recorded = false;
      render();
      break;

    case "download":
      downloadReceipt();
      break;

    case "restart":
      openDialog(`
        <h2>Start a new session?</h2>
        <p>
          Current messages, image and choices will be cleared.
          Download your receipt first if you want to keep it. Starting over does not delete data already sent to the AI provider.
        </p>
        ${button("Restart experience", "confirm-restart")}
      `);
      break;

    case "confirm-restart":
      imageVersion++;
      aiController?.abort();
      state = newSession();
      go(1);
      break;
  }
});

document.addEventListener("submit", event => {
  if (event.target.id !== "chat-form") return;
  event.preventDefault();
  sendMessage();
});

document.addEventListener("input", event => {
  if (event.target.id === "chat-input") {
    state.draft = event.target.value;
  }
});

document.addEventListener("keydown", event => {
  if (
    event.target.id === "chat-input" &&
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    sendMessage();
  }
});

document.addEventListener("change", event => {
  if (event.target.id === "ai-consent") {
    state.aiConsent = event.target.checked;
    render();
  }
  if (event.target.id === "image-input") {
    selectImage(event.target.files[0]);
  }
});

/* ---------- 启动 ---------- */

render();

/* 加载首页原始 DATA 字符 */
let homeArtworkPromise;

async function showHomeArtwork() {
  const panel = document.querySelector(".character-panel");

  if (!panel || panel.querySelector(".character-field")) return;

  try {
    if (!homeArtworkPromise) {
      homeArtworkPromise = fetch("./assets/home-data.txt")
        .then(response => {
          if (!response.ok) {
            throw new Error("Artwork file not found");
          }
          return response.text();
        });
    }

    const characters = await homeArtworkPromise;

    // 等待期间可能已经切换页面
    if (!panel.isConnected) return;
    if (panel.querySelector(".character-field")) return;

    const artwork = document.createElement("pre");
    artwork.className = "character-field";
    artwork.setAttribute("aria-hidden", "true");
    artwork.textContent = characters;

    panel.prepend(artwork);
  } catch {
    homeArtworkPromise = undefined;
    notify("Homepage artwork could not load. Check the assets folder.");
  }
}

const homeArtworkObserver = new MutationObserver(showHomeArtwork);
homeArtworkObserver.observe(app, { childList: true });

showHomeArtwork();
