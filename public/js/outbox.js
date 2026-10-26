import {
  api,
  applyLazyIcons,
  emailStatusLabel,
  emailStatusMarkup,
  ensureShellData,
  esc,
  icon,
  istDateTime,
  openModal,
  state,
  toast,
} from "./core.js";

const view = document.getElementById("view");

if (!state.outboxFilter) state.outboxFilter = "all";

export async function renderOutbox(sequence) {
  await ensureShellData();
  if (sequence !== state.renderSeq) return;
  const data = await api("/api/outbox");
  if (sequence !== state.renderSeq) return;
  state.outbox = data.emails || [];
  state.outboxFilter = "all";

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head-copy">
        <div class="eyebrow">Outbox · every desk email</div>
        <h1>Trail of <em>mail.</em></h1>
        <p class="lede">Invitations, debriefs and connection checks. When SMTP is not configured, messages stay here as a complete preview instead of being lost.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-ghost" href="/settings" data-link>${icon("settings")} Mail settings</a>
        <a class="btn btn-dark" href="/roster" data-link>${icon("users")} Open roster</a>
      </div>
    </div>
    <div class="outbox-toolbar">
      <div class="filters" role="group" aria-label="Filter outbox">
        ${[
          ["all", "All", data.counts?.all || 0],
          ["invite", "Invites", data.counts?.invite || 0],
          ["debrief", "Debriefs", data.counts?.debrief || 0],
          ["test", "Checks", data.counts?.test || 0],
          ["failed", "Failed", data.counts?.failed || 0],
        ]
          .map(
            ([key, label, count]) =>
              `<button type="button" class="filter ${key === "all" ? "is-active" : ""}" data-outbox-filter="${key}">${label} · ${count}</button>`,
          )
          .join("")}
      </div>
      <span class="result-count" id="outbox-count"></span>
    </div>
    <div id="outbox-results"></div>`;

  applyLazyIcons(view);

  const results = document.getElementById("outbox-results");
  const count = document.getElementById("outbox-count");

  const draw = () => {
    const filtered = state.outbox.filter((mail) => {
      if (state.outboxFilter === "all") return true;
      if (state.outboxFilter === "failed") return mail.status === "failed";
      return mail.type === state.outboxFilter;
    });
    count.textContent = `${filtered.length} message${filtered.length === 1 ? "" : "s"}`;
    if (!filtered.length) {
      results.innerHTML = `<div class="empty">
        <span class="empty-icon">${icon("inbox")}</span>
        <h3>No mail in this tray.</h3>
        <p>${state.outbox.length ? "Nothing matches this filter yet." : "Send an invitation from the roster and the first message will appear here."}</p>
        <a class="btn btn-dark" href="/roster" data-link>${icon("users")} Open roster</a>
      </div>`;
      applyLazyIcons(results);
      return;
    }
    results.innerHTML = `<div class="outbox-list">${filtered
      .map(
        (mail) => `
        <button type="button" class="mail-row" data-action="open-email" data-email-id="${esc(mail.id)}" aria-label="Open email ${esc(mail.subject)}">
          <span class="mail-icon">${icon(mail.type === "debrief" ? "book" : mail.type === "test" ? "shield" : "mail")}</span>
          <span class="mail-row-main">
            <span class="mail-row-subject">${esc(mail.subject)}</span>
            <span class="mail-row-meta">
              <span>${esc(mail.studentName || "Mail check")}</span>
              <span>${esc(mail.deliveredTo || mail.intendedTo || "No recipient")}</span>
              <span>${esc(istDateTime(mail.createdAt))}</span>
            </span>
          </span>
          <span class="mail-row-status">${emailStatusMarkup(mail.status)}</span>
          <span class="mail-row-arrow">${icon("arrow-up-right")}</span>
        </button>`,
      )
      .join("")}</div>`;
    applyLazyIcons(results);
  };

  view.querySelectorAll("[data-outbox-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.outboxFilter = button.dataset.outboxFilter;
      view.querySelectorAll("[data-outbox-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      draw();
    });
  });

  draw();
}

export async function openEmailPreview(emailId) {
  try {
    const data = await api(`/api/outbox/${encodeURIComponent(emailId)}`);
    const email = data.email;
    openModal(
      `
      <div class="modal-head">
        <div>
          <div class="modal-title">${esc(email.subject)}</div>
          <div class="modal-sub">${esc(email.type)} · ${esc(emailStatusLabel(email.status))}</div>
        </div>
        <button type="button" class="modal-close" data-modal-close aria-label="Close email preview">${icon("x")}</button>
      </div>
      <div class="modal-body">
        <div class="mail-preview-meta">
          <span>To <strong>${esc(email.deliveredTo || email.intendedTo)}</strong></span>
          ${email.intendedTo && email.intendedTo !== email.deliveredTo ? `<span>Intended <strong>${esc(email.intendedTo)}</strong></span>` : ""}
          <span>Status <strong>${esc(emailStatusLabel(email.status))}</strong></span>
          <span>Provider <strong>${esc(email.provider || "outbox")}</strong></span>
          <span>${esc(istDateTime(email.createdAt))}</span>
          ${email.testMode ? `<span>Test mode <strong>on</strong></span>` : ""}
        </div>
        ${email.error ? `<div class="callout callout-warn" style="margin-bottom:12px">${icon("alert")}<span>${esc(email.error)}</span></div>` : ""}
        <iframe class="mail-frame" id="mail-preview-frame" title="Email HTML preview" sandbox=""></iframe>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-modal-close>Close</button>
      </div>`,
      { wide: true },
    );
    const frame = document.getElementById("mail-preview-frame");
    if (frame) frame.srcdoc = email.html || email.text || "<p>No preview available.</p>";
  } catch (error) {
    toast(error.message, "error");
  }
}
