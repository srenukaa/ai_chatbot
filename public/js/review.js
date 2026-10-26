import {
  api,
  applyLazyIcons,
  clearBusy,
  esc,
  firstName,
  icon,
  istDateTime,
  listMarkup,
  readFileBase64,
  safeUrl,
  setBusy,
  state,
  statusKey,
  statusLabel,
  statusMarkup,
  toast,
  wordCount,
} from "./core.js";
import { parseRoute, refresh } from "./router.js";

const view = document.getElementById("view");

if (!state.chat) state.chat = {};
if (!state.chatBusy) state.chatBusy = {};

function chatKey(token) {
  return `vulture-chat:${token}`;
}

function loadChat(session, token) {
  if (state.chat[token]?.length) return;
  let stored = null;
  try {
    stored = sessionStorage.getItem(chatKey(token));
  } catch {
    stored = null;
  }
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        state.chat[token] = parsed;
        return;
      }
    } catch {
      state.chat[token] = null;
    }
  }
  state.chat[token] = [{ role: "assistant", content: session.intro || "Your review room is ready." }];
}

function persistChat(token) {
  try {
    sessionStorage.setItem(chatKey(token), JSON.stringify(state.chat[token] || []));
  } catch {
    return;
  }
}

function renderInline(value) {
  let text = String(value || "");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return text;
}

function renderMarkdown(value) {
  const safe = esc(value).replace(/\r/g, "");
  const lines = safe.split("\n");
  let html = "";
  let listType = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${paragraph.map(renderInline).join("<br>")}</p>`;
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html += `</${listType}>`;
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        html += `<${type}>`;
        listType = type;
      }
      html += `<li>${renderInline((bullet || numbered)[1])}</li>`;
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  closeList();
  return html || "<p></p>";
}

function drawChat(token) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  const chat = state.chat[token] || [];
  log.innerHTML = chat
    .map(
      (message) => `
      <div class="msg ${message.role === "user" ? "msg-user" : "msg-assistant"}">
        <div class="msg-meta">${message.role === "user" ? "You" : "Mentor"}</div>
        <div class="msg-bubble">${renderMarkdown(message.content)}</div>
      </div>`,
    )
    .join("");
  log.scrollTop = log.scrollHeight;
}

function scrollChat() {
  const log = document.getElementById("chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

async function sendChat(token, text, session) {
  const message = String(text || "").trim();
  if (!message || state.chatBusy[token]) return;
  const chat = state.chat[token];
  const input = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send");
  if (!chat) return;

  state.chatBusy[token] = true;
  if (sendButton) sendButton.disabled = true;
  chat.push({ role: "user", content: message.slice(0, 4000) });
  persistChat(token);
  drawChat(token);
  if (input) {
    input.value = "";
    input.style.height = "auto";
  }

  const log = document.getElementById("chat-log");
  const typing = document.createElement("div");
  typing.className = "msg msg-assistant";
  typing.id = "chat-typing";
  typing.innerHTML = '<div class="msg-meta">Mentor</div><div class="typing"><i></i><i></i><i></i></div>';
  if (log) {
    log.appendChild(typing);
    scrollChat();
  }

  try {
    const result = await api(`/api/review/${encodeURIComponent(token)}/chat`, {
      method: "POST",
      body: {
        message,
        history: chat.slice(0, -1).slice(-10).map((item) => ({ role: item.role, content: item.content })),
      },
    });
    document.getElementById("chat-typing")?.remove();
    chat.push({ role: "assistant", content: result.reply || "I could not produce a reply just now." });
    persistChat(token);
    drawChat(token);
    const mode = document.getElementById("chat-mode");
    if (mode) mode.textContent = result.mode === "ai" ? "AI mentor · brief loaded" : "Guided mentor · brief loaded";
  } catch (error) {
    document.getElementById("chat-typing")?.remove();
    if (chat[chat.length - 1]?.role === "user") chat.pop();
    persistChat(token);
    drawChat(token);
    if (input) {
      input.value = message;
      input.focus();
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 124)}px`;
    }
    toast(error.message, "error");
  } finally {
    state.chatBusy[token] = false;
    if (sendButton) sendButton.disabled = false;
  }
}

function briefCard(session) {
  const student = session.student;
  const playbook = session.playbook || {};
  const duration = session.settings?.reviewDurationMinutes || 30;
  const agenda = (playbook.agenda || [])
    .map((item) => `<li><strong>${esc(item.minutes)} min</strong> — ${esc(item.title)}. ${esc(item.detail)}</li>`)
    .join("");
  const references = (playbook.references || [])
    .map(
      (reference) => `
      <a href="${safeUrl(reference.url)}" target="_blank" rel="noopener noreferrer">
        ${icon("external")}<span><strong>${esc(reference.label)}</strong>${reference.note ? `<br>${esc(reference.note)}` : ""}</span>
      </a>`,
    )
    .join("");

  return `
    <section class="panel brief-card">
      <div class="card-head">
        <div>
          <div class="mono">Session brief</div>
          <h3 style="margin-top:5px">${esc(student.projectTitle)}</h3>
        </div>
        ${statusMarkup(student.status)}
      </div>
      <div class="brief-when">
        <div class="when-item"><span>When</span><strong>${esc(student.reviewDateTimeLabel)}</strong></div>
        <div class="when-item"><span>Duration</span><strong>${esc(duration)} minutes</strong></div>
        <div class="when-item"><span>Room</span><strong>${esc(session.sessionCode || "------")}</strong></div>
        <div class="when-item"><span>Meet</span><strong>${student.meetLinkGenerated ? "Auto-assigned" : "Custom room"}</strong></div>
      </div>
      <div class="brief-overview"><p>${esc(playbook.overview || playbook.brief || "")}</p></div>
      ${student.meetLinkGenerated ? '<p class="field-hint" style="margin-top:8px">The Meet code is a generated placeholder. Your coordinator can send a real room link if needed.</p>' : ""}
      ${playbook.clarification ? `<div class="callout callout-info" style="margin-top:12px">${icon("info")}<span>${esc(playbook.clarification)}</span></div>` : ""}
      <details class="details" ${playbook.clarification ? "" : "open"}>
        <summary>What we will cover</summary>
        <div class="detail-body"><ul>${agenda}</ul></div>
      </details>
      <details class="details">
        <summary>Objectives</summary>
        <div class="detail-body">${listMarkup(playbook.objectives, "analysis-list")}</div>
      </details>
      <details class="details">
        <summary>What to bring</summary>
        <div class="detail-body">${listMarkup(playbook.requirements, "analysis-list")}</div>
      </details>
      <details class="details">
        <summary>Deliverables and reference shelf</summary>
        <div class="detail-body">
          ${listMarkup(playbook.deliverables, "analysis-list")}
          <div class="ref-list" style="margin-top:9px">${references}</div>
        </div>
      </details>
    </section>`;
}

function submissionEvidence(student) {
  const submission = student.submission;
  if (!submission) return "";
  const lines = [];
  const repo = submission.githubRepo || submission.githubUrl;
  if (repo) {
    const href = safeUrl(submission.githubUrl || `https://github.com/${submission.githubRepo}`);
    lines.push(
      `<div class="submitted-line">${icon("github")}<span><strong>GitHub</strong> · <a href="${href}" target="_blank" rel="noopener noreferrer">${esc(repo)}</a>${submission.githubLanguage ? ` · ${esc(submission.githubLanguage)}` : ""}${submission.githubFiles ? ` · ${esc(submission.githubFiles)} files` : ""}</span></div>`,
    );
  }
  if (submission.docName) {
    lines.push(
      `<div class="submitted-line">${icon("file")}<span><strong>${esc(submission.docName)}</strong> · ${esc(submission.docWordCount)} words</span></div>`,
    );
  }
  if (submission.notesWords) {
    lines.push(
      `<div class="submitted-line">${icon("clipboard")}<span><strong>Notes</strong> · ${esc(submission.notesWords)} words</span></div>`,
    );
  }
  if (submission.submittedAt) {
    lines.push(`<div class="submitted-line">${icon("clock")}<span>Submitted ${esc(istDateTime(submission.submittedAt))}</span></div>`);
  }
  const warnings = submission.warnings || [];
  const warningBox = warnings.length
    ? `<div class="warn-box"><strong>Worth checking</strong><ul>${warnings.map((warning) => `<li>${esc(warning)}</li>`).join("")}</ul></div>`
    : "";
  return `<div class="submitted-box">${lines.join("")}</div>${warningBox}`;
}

function submissionForm(student, token) {
  const selected = state.reviewDoc?.token === token ? state.reviewDoc : null;
  const docCopy = selected
    ? `<strong>${esc(selected.name)}</strong><span>${esc(formatDocSize(selected.size))} · ready to attach</span>`
    : `<strong>Attach a DOCX</strong><span>Optional · up to 15 MB</span>`;

  return `
    <form id="submission-form" novalidate>
      <div class="field">
        <label for="github-input">GitHub repository</label>
        <input class="input" id="github-input" name="githubUrl" type="url" placeholder="https://github.com/owner/project" autocomplete="off">
        <span class="field-hint">Public repository, or a repo the server token can read.</span>
      </div>
      <div class="field">
        <label class="field-label">Written report</label>
        <div class="dropzone-compact" id="doc-zone">
          <input id="doc-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Attach a DOCX report">
          <span class="file-chip-icon">${icon("file")}</span>
          <div class="dropzone-compact-copy" id="doc-zone-copy">${docCopy}</div>
        </div>
        <button type="button" class="btn-plain" id="doc-remove" style="align-self:flex-start;margin-top:4px" ${selected ? "" : "hidden"}>Remove document</button>
      </div>
      <div class="field">
        <label for="notes-input">Review notes</label>
        <textarea class="textarea" id="notes-input" name="notes" rows="4" maxlength="8000" placeholder="What did you build, what worked, what is still uncertain?"></textarea>
        <span class="field-hint">Add a GitHub link, a DOCX, or at least 15 words of notes.</span>
      </div>
      <div class="submit-row">
        <span class="mono" style="color:var(--muted)">Evidence is private to this room</span>
        <button type="submit" class="btn btn-rust" id="submit-work">${icon("check")} Submit for review</button>
      </div>
    </form>`;
}

function formatDocSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function submissionCard(session, token) {
  const student = session.student;
  const submission = student.submission;
  const analysis = student.analysis;
  const autoSend = Boolean(session.settings?.autoSendDebrief);

  if (analysis) {
    return `
      <section class="panel submission-card" id="submission-card">
        <div class="card-head">
          <div><div class="mono">Evidence</div><h3 style="margin-top:5px">Your work</h3></div>
          <span class="chip">Locked</span>
        </div>
        ${submissionEvidence(student)}
        <p class="field-hint" style="margin-top:11px">This submission has been reviewed. The written debrief is below.</p>
      </section>`;
  }

  if (submission) {
    return `
      <section class="panel submission-card" id="submission-card">
        <div class="card-head">
          <div><div class="mono">Evidence</div><h3 style="margin-top:5px">Your work</h3></div>
          ${statusMarkup(student.status)}
        </div>
        ${submissionEvidence(student)}
        <div id="analysis-slot" style="margin-top:14px">
          <div class="callout callout-rust">${icon("spark")}<span>The evidence is in. Run the project review to score the work against the rubric${autoSend ? " and send the written debrief" : " and prepare the debrief"}.</span></div>
          <div class="submit-row">
            <span class="mono" style="color:var(--muted)">Review takes a moment</span>
            <button type="button" class="btn btn-rust" id="run-analysis">${icon("spark")} Run project review</button>
          </div>
        </div>
      </section>`;
  }

  return `
    <section class="panel submission-card" id="submission-card">
      <div class="card-head">
        <div><div class="mono">Evidence</div><h3 style="margin-top:5px">Show your work</h3></div>
        ${statusMarkup(student.status)}
      </div>
      <p class="field-hint" style="margin-bottom:13px">Give the review something concrete: a repository, a written report, or clear notes on what you built.</p>
      ${submissionForm(student, token)}
    </section>`;
}

function analysisCard(session) {
  const student = session.student;
  const analysis = student.analysis;
  if (!analysis) return "";
  const corrections = (analysis.corrections || [])
    .map(
      (correction, index) => `
      <div class="correction">
        <span class="correction-num">0${index + 1}</span>
        <div class="correction-body"><strong>${esc(correction.issue)}</strong>${esc(correction.fix)}</div>
      </div>`,
    )
    .join("");
  const evidence = analysis.evidence || {};
  const matched = Array.isArray(evidence.matched) ? evidence.matched.length : 0;
  const missing = Array.isArray(evidence.missing) ? evidence.missing.length : 0;
  const focus = (analysis.nextReviewFocus || [])
    .map((item) => `<span class="chip chip-rust">${esc(item)}</span>`)
    .join("");
  const tips = Array.isArray(analysis.tips) && analysis.tips.length
    ? `<details class="details"><summary>Practical tips</summary><div class="detail-body">${listMarkup(analysis.tips, "analysis-list")}</div></details>`
    : "";

  let debriefStatus = "";
  const email = student.debriefEmail;
  if (email) {
    if (email.status === "sent") {
      debriefStatus = `<div class="email-status">${icon("check")}<span><strong>Debrief delivered</strong> to ${esc(email.deliveredTo)}.</span></div>`;
    } else if (email.status === "simulated") {
      debriefStatus = `<div class="email-status is-warn">${icon("inbox")}<span><strong>Debrief saved to the outbox</strong> for ${esc(email.deliveredTo)}. SMTP is not connected, so it was not sent externally.</span></div>`;
    } else {
      debriefStatus = `<div class="email-status is-warn">${icon("alert")}<span><strong>Debrief email failed.</strong> ${esc(email.error || "Open the outbox for details.")}</span></div>`;
    }
  } else if (session.settings?.autoSendDebrief === false) {
    debriefStatus = `<div class="email-status is-warn">${icon("info")}<span><strong>Debrief not emailed yet.</strong> Automatic sending is off; HR can send it from the roster.</span></div>`;
  } else {
    debriefStatus = `<div class="email-status is-warn">${icon("info")}<span><strong>Debrief not emailed yet.</strong> The desk is still preparing it, or the send failed before a record was saved.</span></div>`;
  }

  const next = student.nextReviewLabel
    ? `<div class="next-review-box">
         <div class="mono">Next review</div>
         <strong>${esc(student.nextReviewLabel)}</strong>
         <span>Keep the same room and bring the corrected evidence.</span>
         ${student.nextMeetLink ? `<a class="btn btn-rust btn-sm" style="margin-top:9px" href="${safeUrl(student.nextMeetLink)}" target="_blank" rel="noopener">${icon("video")} Next Meet link</a>` : ""}
       </div>`
    : "";

  return `
    <section class="panel analysis-card" id="analysis-card">
      <div class="card-head">
        <div><div class="mono">Written debrief</div><h3 style="margin-top:5px">Review evidence</h3></div>
        <span class="chip chip-rust">${analysis.generatedBy === "ai" ? "AI review" : "Rubric review"}</span>
      </div>
      <div class="analysis-top">
        <div class="score-ring" data-score="${esc(analysis.score)}" style="--score:0">
          <div class="score-value">${esc(analysis.score)}<small>/100</small></div>
        </div>
        <div class="verdict">
          <div class="mono">Verdict</div>
          <h3>${esc(analysis.verdict)}</h3>
          <div class="mono" style="margin-top:5px;color:var(--muted)">${esc(analysis.generatedAt ? istDateTime(analysis.generatedAt) : "")}</div>
        </div>
      </div>
      <p class="analysis-summary">${esc(analysis.summary)}</p>
      <div class="analysis-block">
        <div class="mono">What is working</div>
        ${listMarkup(analysis.strengths, "analysis-list")}
      </div>
      <div class="analysis-block">
        <div class="mono">What needs correction</div>
        ${corrections || '<p class="field-hint">No corrections were recorded.</p>'}
      </div>
      <div class="analysis-block">
        <div class="mono">Next steps</div>
        ${listMarkup(analysis.nextSteps, "analysis-list")}
      </div>
      ${tips}
      <div class="analysis-block">
        <div class="mono">Focus for the next review</div>
        <div class="analysis-foot">${focus || '<span class="chip">Keep iterating</span>'}</div>
      </div>
      <div class="analysis-foot">
        ${matched ? `<span class="chip">${esc(matched)} checks matched</span>` : ""}
        ${missing ? `<span class="chip">${esc(missing)} evidence gaps</span>` : ""}
      </div>
      ${debriefStatus}
      ${next}
    </section>`;
}

function drawReview(session) {
  const student = session.student;
  const playbook = session.playbook || {};
  const token = state.reviewToken;
  const first = firstName(student.name);
  const status = statusKey(student.status);
  const duration = session.settings?.reviewDurationMinutes || 30;
  const isComplete = status === "debriefed" || Boolean(student.analysis);

  const suggestions =
    playbook.key === "sentiment-analysis"
      ? ["Does Whisper score sentiment?", "What should I submit?", "How is this evaluated?", "What should I fix first?"]
      : ["What should I submit?", "How is this evaluated?", "Explain the dataset", "What should I fix first?"];

  view.innerHTML = `
    <div class="review-shell">
      <header class="review-topbar">
        <div class="review-brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation">
              <path d="M10 17L32 49L54 17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18 17L32 38L46 17" fill="none" stroke="#c9502b" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M27 17L32 26L37 17" fill="none" stroke="#aeb7a3" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="review-brand-text"><strong>VULTURE</strong><span>Review room</span></span>
        </div>
        <div class="review-session">
          <span class="session-code">${esc(session.sessionCode || "------")}</span>
          <span class="session-identity">
            <strong>${esc(student.name)}</strong>
            <span><i class="identity-dot"></i>Matched to ${esc(student.projectBadge || "Applied AI")}</span>
          </span>
        </div>
        <a class="review-meet" href="${safeUrl(student.meetLink)}" target="_blank" rel="noopener">${icon("video")} Join Google Meet ${icon("arrow-up-right")}</a>
      </header>

      <div class="review-intro">
        <div>
          <div class="eyebrow">Review room · ${esc(statusLabel(status))}</div>
          <h1>Your review, <em>${esc(first)}.</em></h1>
          <p>${isComplete ? "The review is complete. Read the written debrief, then use the next steps to prepare for the follow-up." : `This room is already matched to your project. Use the mentor chat for anything unclear, submit your evidence, and run the review. ${esc(duration)} minutes are reserved.`}</p>
        </div>
        <a class="link-arrow" href="${isComplete ? "#analysis-card" : "#submission-card"}">${isComplete ? "Read the debrief" : "Show your work"} ${icon("arrow-down")}</a>
      </div>

      <div class="review-grid">
        <section class="chat-panel" aria-label="Mentor chat">
          <div class="chat-head">
            <span class="bot-avatar">${icon("spark")}</span>
            <div class="chat-title">
              <strong>Review mentor</strong>
              <div class="chat-status"><span class="dot" style="background:#83c69a"></span><span id="chat-mode">Project brief loaded</span></div>
            </div>
            <span class="chip chat-head-badge">${esc(duration)} min</span>
          </div>
          <div class="chat-log" id="chat-log" aria-live="polite"></div>
          <div class="suggestions" id="chat-suggestions">
            ${suggestions
              .map(
                (suggestion) =>
                  `<button type="button" class="suggestion" data-suggestion="${esc(suggestion)}">${esc(suggestion)}</button>`,
              )
              .join("")}
          </div>
          <form class="chat-form" id="chat-form">
            <textarea class="chat-input" id="chat-input" rows="1" maxlength="4000" placeholder="Ask about the brief, your evidence, or the review…" aria-label="Message the review mentor"></textarea>
            <button type="submit" class="send-btn" id="chat-send" aria-label="Send message">${icon("send")}</button>
          </form>
        </section>

        <div class="aside-stack">
          ${briefCard(session)}
          ${submissionCard(session, token)}
          ${analysisCard(session)}
        </div>
      </div>

      <footer class="review-footer">
        <span>${esc(session.settings?.companyName || "Vulture Management Wings")} · Private review room</span>
        <span>Session ${esc(session.sessionCode || "------")} · ${esc(student.projectTitle)}</span>
      </footer>
    </div>`;

  applyLazyIcons(view);
  drawChat(token);
  bindChat(token, session);
  bindSubmission(token, session);
  bindAnalysis(token, session);
  animateScore();

  if (state.reviewFocus === "analysis") {
    state.reviewFocus = null;
    requestAnimationFrame(() => document.getElementById("analysis-card")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

function bindChat(token, session) {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  if (!form || !input) return;

  const resize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 124)}px`;
  };
  input.addEventListener("input", resize);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendChat(token, text, session);
  });

  document.querySelectorAll("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      sendChat(token, button.dataset.suggestion, session);
    });
  });
}

function bindSubmission(token, session) {
  const form = document.getElementById("submission-form");
  if (!form) return;

  const docZone = document.getElementById("doc-zone");
  const docInput = document.getElementById("doc-input");
  const docCopy = document.getElementById("doc-zone-copy");
  const docRemove = document.getElementById("doc-remove");

  const updateDoc = () => {
    const selected = state.reviewDoc?.token === token ? state.reviewDoc : null;
    if (docCopy) {
      docCopy.innerHTML = selected
        ? `<strong>${esc(selected.name)}</strong><span>${esc(formatDocSize(selected.size))} · ready to attach</span>`
        : `<strong>Attach a DOCX</strong><span>Optional · up to 15 MB</span>`;
    }
    if (docRemove) docRemove.hidden = !selected;
    if (docZone) docZone.classList.toggle("has-file", Boolean(selected));
  };

  docZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    docZone.classList.add("is-dragover");
  });
  docZone?.addEventListener("dragleave", () => docZone.classList.remove("is-dragover"));
  docZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    docZone.classList.remove("is-dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file) pickDoc(file);
  });

  const pickDoc = async (file) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast("Attach a .docx report.", "error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast("The document is too large. The limit is 15 MB.", "error");
      return;
    }
    try {
      const base64 = await readFileBase64(file);
      state.reviewDoc = { token, name: file.name, size: file.size, base64 };
      updateDoc();
    } catch (error) {
      toast(error.message, "error");
    }
  };

  docInput?.addEventListener("change", () => {
    const file = docInput.files?.[0];
    if (file) pickDoc(file);
  });

  docRemove?.addEventListener("click", () => {
    state.reviewDoc = null;
    if (docInput) docInput.value = "";
    updateDoc();
  });

  updateDoc();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("submit-work");
    const githubUrl = document.getElementById("github-input")?.value.trim() || "";
    const notes = document.getElementById("notes-input")?.value || "";
    const doc = state.reviewDoc?.token === token ? state.reviewDoc : null;
    if (!githubUrl && !doc && wordCount(notes) < 15) {
      toast("Add a GitHub link, a DOCX, or at least 15 words of notes.", "error");
      document.getElementById("notes-input")?.focus();
      return;
    }
    setBusy(button, "Submitting evidence");
    try {
      await api(`/api/review/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        body: {
          githubUrl,
          notes,
          docName: doc?.name || "",
          docBase64: doc?.base64 || "",
        },
      });
      state.reviewDoc = null;
      state.bootstrap = null;
      toast("Work received. Run the review when you are ready.", "success");
      refresh();
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
  });
}

function bindAnalysis(token, session) {
  const slot = document.getElementById("analysis-slot");
  if (!slot) return;
  const button = slot.querySelector("#run-analysis");
  if (!button) return;

  const runAnalysis = async () => {
    const original = slot.innerHTML;
    const autoSend = Boolean(session.settings?.autoSendDebrief);
    const steps = [
      "Reading the evidence",
      "Mapping against the rubric",
      autoSend ? "Sending the debrief" : "Preparing the debrief",
    ];
    let step = 0;

    slot.innerHTML = `
      <div class="analysis-loader">
        <div class="analysis-loader-head"><span class="spinner"></span><strong>Running the project review</strong></div>
        <p>Reading the submission and checking the rubric</p>
        <div class="progress-steps" id="analysis-progress">
          ${steps.map((label, index) => `<div class="progress-step ${index === 0 ? "is-active" : ""}" data-step="${index}"><i class="dot"></i>${esc(label)}</div>`).join("")}
        </div>
      </div>`;

    const timer = window.setInterval(() => {
      const stepsElements = slot.querySelectorAll("[data-step]");
      if (!stepsElements.length) return;
      if (step < steps.length - 1) step += 1;
      stepsElements.forEach((element, index) => {
        element.classList.toggle("is-done", index < step);
        element.classList.toggle("is-active", index === step);
      });
    }, 2200);

    try {
      const result = await api(`/api/review/${encodeURIComponent(token)}/analyze`, { method: "POST" });
      window.clearInterval(timer);
      const email = result.email;
      if (email?.status === "quota" || email?.status === "failed" || result.emailError) {
        toast(result.emailError || email?.error || "The review is ready, but the debrief email failed.", "error");
      } else if (email?.status === "simulated") {
        toast("Review complete. The debrief is saved in the outbox.", "success");
      } else if (email?.status === "sent") {
        toast(`Review complete. Debrief sent to ${email.deliveredTo}.`, "success");
      } else {
        toast("Review complete.", "success");
      }
      state.bootstrap = null;
      state.reviewFocus = "analysis";
      if (parseRoute().name !== "review") return;
      refresh();
    } catch (error) {
      window.clearInterval(timer);
      slot.innerHTML = original;
      const retry = slot.querySelector("#run-analysis");
      if (retry) retry.addEventListener("click", runAnalysis);
      toast(error.message, "error");
    }
  };

  button.addEventListener("click", runAnalysis);
}

function animateScore() {
  const ring = document.querySelector(".score-ring");
  if (!ring) return;
  const target = Number(ring.dataset.score || 0);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ring.style.setProperty("--score", String(target));
    return;
  }
  const started = performance.now();
  const duration = 900;
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    ring.style.setProperty("--score", String(Math.round(progress * target)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export async function renderReview(token, sequence) {
  state.reviewToken = token;
  if (state.reviewDoc?.token !== token) state.reviewDoc = null;
  try {
    const session = await api(`/api/review/${encodeURIComponent(token)}`);
    if (sequence !== state.renderSeq) return;
    state.review = session;
    state.settings = {
      ...(state.settings || {}),
      companyName: session.settings?.companyName,
      senderName: session.settings?.senderName,
      reviewDurationMinutes: session.settings?.reviewDurationMinutes,
      autoSendDebrief: session.settings?.autoSendDebrief,
    };
    loadChat(session, token);
    persistChat(token);
    document.title = `${session.student.name} · Review room · Vulture`;
    drawReview(session);
  } catch (error) {
    if (sequence !== state.renderSeq) return;
    state.review = null;
    document.title = "Review room · Vulture";
    view.innerHTML = `
      <div class="review-error">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation">
              <path d="M10 17L32 49L54 17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18 17L32 38L46 17" fill="none" stroke="#c9502b" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="brand-word"><strong>VULTURE</strong><span>Management Wings</span></span>
        </div>
        <div class="eyebrow" style="justify-content:center">Review room</div>
        <h1 style="margin-top:14px">This link is not <em>on the board.</em></h1>
        <p>${esc(error.message)} Ask your coordinator for a fresh invitation, or open the desk if you are the review team.</p>
        <a class="btn btn-dark" href="/" data-link>${icon("arrow-left")} Back to the desk</a>
      </div>`;
    applyLazyIcons(view);
  }
}
