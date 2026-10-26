import {
  STATUS_ORDER,
  applyLazyIcons,
  debounce,
  emailStatusLabel,
  ensureShellData,
  esc,
  icon,
  safeUrl,
  state,
  statusKey,
  statusLabel,
  statusMarkup,
} from "./core.js";

const view = document.getElementById("view");

if (!state.rosterFilter) state.rosterFilter = "all";
if (typeof state.rosterSearch !== "string") state.rosterSearch = "";

function renderPass(student) {
  const status = statusKey(student.status);
  const day = student.reviewDay?.day || "--";
  const month = student.reviewDay?.month || "TBC";
  const time = student.reviewDay?.time || "Time TBC";
  const actionButtons = [];

  if (status === "queued") {
    actionButtons.push(
      `<button class="btn btn-dark" data-action="invite" data-id="${esc(student.id)}">${icon("send")} Send invite</button>`,
    );
  } else if (status === "invited") {
    actionButtons.push(
      `<a class="btn btn-dark" href="${safeUrl(student.roomUrl)}" target="_blank" rel="noopener">${icon("arrow-up-right")} Open room</a>`,
    );
  } else if (status === "submitted") {
    actionButtons.push(
      `<a class="btn btn-rust" href="${safeUrl(student.roomUrl)}" target="_blank" rel="noopener">${icon("terminal")} Review work</a>`,
    );
  } else if (status === "analyzed") {
    actionButtons.push(
      `<button class="btn btn-rust" data-action="send-debrief" data-id="${esc(student.id)}">${icon("book")} Send debrief</button>`,
    );
    actionButtons.push(
      `<a class="btn btn-ghost" href="${safeUrl(student.roomUrl)}" target="_blank" rel="noopener">${icon("arrow-up-right")} Open</a>`,
    );
  } else if (status === "debriefed") {
    actionButtons.push(
      `<a class="btn btn-ghost" href="${safeUrl(student.roomUrl)}" target="_blank" rel="noopener">${icon("book")} View debrief</a>`,
    );
  }

  actionButtons.push(
    `<button class="btn btn-ghost btn-icon" data-action="copy-link" data-url="${esc(student.roomUrl)}" title="Copy review link" aria-label="Copy review link for ${esc(student.name)}">${icon("copy")}</button>`,
  );

  let note;
  if (student.analysis) {
    note = `<div class="pass-score">Score ${esc(student.analysis.score)}/100 · ${student.analysis.generatedBy === "ai" ? "AI review" : "Rubric review"}</div>`;
  } else if (student.submission?.githubRepo) {
    note = `<div class="pass-note">${icon("github")} ${esc(student.submission.githubRepo)}${student.submission.githubLanguage ? ` · ${esc(student.submission.githubLanguage)}` : ""}</div>`;
  } else if (student.submission?.docName) {
    note = `<div class="pass-note">${icon("file")} ${esc(student.submission.docName)} · ${esc(student.submission.docWordCount)} words</div>`;
  } else if (student.submission?.notesWords) {
    note = `<div class="pass-note">${icon("clipboard")} ${esc(student.submission.notesWords)} words of notes submitted</div>`;
  } else {
    note = `<div class="pass-note">${student.meetLinkGenerated ? "Meet room auto-assigned." : "Meet room set by HR."} ${esc(student.reviewRelative || "")}</div>`;
  }

  return `
    <article class="pass">
      <div class="pass-main">
        <div class="pass-top">
          <span class="pass-kicker">Room / ${esc(student.sessionCode || "------")}</span>
          ${statusMarkup(student.status)}
        </div>
        <h3 class="pass-title">${esc(student.name)}</h3>
        <div class="pass-project">${esc(student.projectTitle)}</div>
        <div class="pass-email">${esc(student.email)}</div>
        <div class="pass-meta">
          <span class="chip">${esc(student.projectBadge || "Applied AI")}</span>
          ${student.reviewRelative ? `<span class="chip">${esc(student.reviewRelative)}</span>` : ""}
        </div>
        ${note}
        <div class="pass-actions">${actionButtons.join("")}</div>
      </div>
      <div class="pass-stub">
        <div class="stub-day">${esc(day)}</div>
        <div class="stub-month">${esc(month)}</div>
        <div class="stub-time">${esc(time)}</div>
        <span class="pass-status status-${status}">${esc(statusLabel(status))}</span>
        <div class="stub-code">${esc(student.sessionCode || "")}</div>
      </div>
    </article>`;
}

export async function renderDashboard(sequence) {
  const data = await ensureShellData(true);
  if (sequence !== state.renderSeq) return;
  const students = data.students || [];
  const settings = data.settings || {};
  const stats = data.stats || {};
  const recentEmails = data.recentEmails || [];
  const queued = stats.queued || 0;
  const invitesOut = Math.max(0, (stats.total || 0) - queued);
  const submitted = (stats.submitted || 0) + (stats.analyzed || 0) + (stats.debriefed || 0);
  const upcoming = students.filter((student) => student.status !== "debriefed").slice(0, 5);
  const active = students
    .filter((student) => student.status !== "debriefed")
    .sort((left, right) => {
      const order = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);
      if (order !== 0) return order;
      return new Date(left.reviewDate) - new Date(right.reviewDate);
    })
    .slice(0, 4);
  const boardDate = upcoming[0]?.reviewDay
    ? `${upcoming[0].reviewDay.weekday} ${upcoming[0].reviewDay.day} ${upcoming[0].reviewDay.month}`
    : "NO SESSIONS";

  const boardRows = upcoming.length
    ? upcoming
        .map(
          (student) => `
          <div class="board-row">
            <span class="board-time">${esc(student.reviewTimeLabel || "--")}</span>
            <div class="board-main">
              <div class="board-name">${esc(student.name)}</div>
              <div class="board-project">${esc(student.projectTitle)}</div>
            </div>
            <span class="board-status ${student.status === "queued" ? "is-rust" : student.status === "debriefed" ? "is-live" : ""}">${esc(statusLabel(student.status).toUpperCase())}</span>
          </div>`,
        )
        .join("")
    : `<div class="board-empty">The board is clear.<br>Import a roster to schedule the first review.</div>`;

  const queueMarkup = active.length
    ? `<div class="pass-grid">${active.map((student) => renderPass(student)).join("")}</div>`
    : students.length
      ? `<div class="panel">
           <div class="card-head"><h3>All clear.</h3><span class="chip">${students.length} intern${students.length === 1 ? "" : "s"}</span></div>
           <p class="field-hint" style="font-size:12.5px">Every intern on the manifest has a written debrief. Import another roster when the next cohort is ready.</p>
           <div class="head-actions" style="margin-top:16px"><a class="btn btn-dark btn-sm" href="/upload" data-link>${icon("upload")} Load another roster</a></div>
         </div>`
      : `<div class="empty">
           <span class="empty-icon">${icon("users")}</span>
           <h3>The manifest is empty.</h3>
           <p>Upload the Excel roster to create review rooms, schedule sessions, and send the first invitations.</p>
           <a class="btn btn-dark" href="/upload" data-link>${icon("upload")} Upload roster</a>
         </div>`;

  const mailMarkup = recentEmails.length
    ? `<div class="mail-mini">${recentEmails
        .slice(0, 4)
        .map(
          (mail) => `
          <div class="mail-mini-row">
            <span class="mail-icon">${icon(mail.type === "debrief" ? "book" : mail.type === "test" ? "shield" : "mail")}</span>
            <div class="mail-copy">
              <div class="mail-subject">${esc(mail.subject)}</div>
              <div class="mail-meta">${esc(mail.studentName || "Mail connection")} · ${esc(emailStatusLabel(mail.status))}</div>
            </div>
          </div>`,
        )
        .join("")}</div>`
    : `<div class="empty" style="padding:24px 14px;border:0;background:transparent">
         <p style="margin:0">No email has left the desk yet.</p>
       </div>`;

  const mail = data.config?.mail || {};
  const ai = data.config?.ai || {};
  const mailMissing = Array.isArray(mail.missing) ? mail.missing : [];
  const defaultMeetLink = String(settings.defaultMeetLink || "").trim();

  view.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">Internship review operations</div>
        <h1 class="hero-title">Every intern<br>leaves with<br>a <em>debrief.</em></h1>
        <p class="lede">Import the roster, open a review room, read the work, and send a specific debrief before the next milestone. This desk holds the whole loop, from sheet to send.</p>
        <div class="hero-actions">
          <a class="btn btn-dark" href="/upload" data-link>${icon("upload")} Upload roster</a>
          <a class="btn btn-ghost" href="/roster" data-link>${icon("users")} Open roster</a>
          ${queued ? `<button class="btn btn-rust" data-action="invite-all">${icon("send")} Send ${queued} pending invite${queued === 1 ? "" : "s"}</button>` : ""}
        </div>
        <div class="hero-note">${icon("lock")} Review rooms are token-matched · ${esc(settings.reviewDurationMinutes || 30)} min per intern</div>
      </div>
      <aside class="hero-board" aria-label="Upcoming review sessions">
        <div class="board-head">
          <span>Flight board · next sessions</span>
          <span class="board-live"><i class="live-dot"></i>Live</span>
        </div>
        <div class="board-date">${esc(boardDate)}</div>
        <div class="board-list">${boardRows}</div>
        <div class="board-foot">
          <span>${upcoming.length ? `${upcoming.length} showing` : "Awaiting roster"}</span>
          <a href="/roster" data-link>Full manifest ${icon("arrow-right")}</a>
        </div>
      </aside>
    </section>

    <section class="stat-strip" aria-label="Review desk totals">
      <div class="stat">
        <div class="stat-value">${esc(stats.total || 0)}</div>
        <div class="stat-label">On the manifest</div>
        <div class="stat-sub">${esc(queued)} still queued</div>
      </div>
      <div class="stat">
        <div class="stat-value">${esc(invitesOut)}</div>
        <div class="stat-label">Invites out</div>
        <div class="stat-sub">Review rooms assigned</div>
      </div>
      <div class="stat">
        <div class="stat-value">${esc(submitted)}</div>
        <div class="stat-label">Work submitted</div>
        <div class="stat-sub">${esc((stats.analyzed || 0) + (stats.debriefed || 0))} reviewed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${esc(stats.debriefed || 0)}</div>
        <div class="stat-label">Debriefs sent</div>
        <div class="stat-sub">${esc(settings.nextReviewDays || 7)}-day follow-up</div>
      </div>
    </section>

    <div class="dashboard-grid">
      <section>
        <div class="section-head">
          <div>
            <div class="eyebrow">Working queue</div>
            <h2 style="margin-top:8px">Active reviews</h2>
          </div>
          <div class="head-actions">
            ${queued ? `<button class="btn btn-ghost btn-sm" data-action="invite-all">${icon("send")} Invite all queued</button>` : ""}
            <a class="link-arrow" href="/roster" data-link>Full roster ${icon("arrow-right")}</a>
          </div>
        </div>
        ${queueMarkup}
      </section>

      <aside class="aside-stack">
        <div class="panel">
          <div class="panel-head"><span class="panel-title">How the desk works</span><span class="mono">01 → 04</span></div>
          <ol class="step-list">
            <li class="step"><span class="step-num">01</span><div><div class="step-title">Load the roster</div><div class="step-text">Name, email, project. Dates and Meet links are optional.</div></div></li>
            <li class="step"><span class="step-num">02</span><div><div class="step-title">Send the invite</div><div class="step-text">Each intern gets a private review room and a brief.</div></div></li>
            <li class="step"><span class="step-num">03</span><div><div class="step-title">Read the work</div><div class="step-text">GitHub or DOCX, scored against the project rubric.</div></div></li>
            <li class="step"><span class="step-num">04</span><div><div class="step-title">Send the debrief</div><div class="step-text">Corrections, next steps, next date and Meet link.</div></div></li>
          </ol>
        </div>

        <div class="panel">
          <div class="panel-head"><span class="panel-title">Recent mail</span><a class="link-arrow" href="/outbox" data-link>Outbox ${icon("arrow-right")}</a></div>
          ${mailMarkup}
        </div>

        <div class="panel">
          <div class="panel-head"><span class="panel-title">Desk wiring</span><a class="link-arrow" href="/settings" data-link>Settings ${icon("arrow-right")}</a></div>
          <div class="config-chips">
            <div class="config-chip ${mail.mode === "smtp" ? "" : "is-warn"}"><span><i class="dot"></i>${mail.mode === "smtp" ? "SMTP connected" : "Outbox fallback"}</span><span class="mono">${mail.mode === "smtp" ? esc(mail.host || "smtp") : esc(mailMissing[0] || "SMTP_HOST")}</span></div>
            <div class="config-chip ${ai.configured ? "" : "is-warn"}"><span><i class="dot"></i>${ai.configured ? "AI mentor online" : "Rubric mentor"}</span><span class="mono">${ai.configured ? esc(ai.model || "provider") : "LOCAL"}</span></div>
            <div class="config-chip ${defaultMeetLink ? "" : "is-warn"}"><span><i class="dot"></i>${defaultMeetLink ? "Default Meet room" : "Auto Meet rooms"}</span><span class="mono">${defaultMeetLink ? "CUSTOM" : "AUTO"}</span></div>
            <div class="config-chip ${data.config?.github ? "" : "is-warn"}"><span><i class="dot"></i>${data.config?.github ? "GitHub token set" : "Public repos only"}</span><span class="mono">${data.config?.github ? "TOKEN" : "NO TOKEN"}</span></div>
          </div>
        </div>
      </aside>
    </div>`;
  applyLazyIcons(view);
}

export async function renderRoster(sequence) {
  const data = await ensureShellData(true);
  if (sequence !== state.renderSeq) return;
  const students = data.students || [];
  const queued = students.filter((student) => student.status === "queued").length;

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head-copy">
        <div class="eyebrow">Manifest · ${students.length} intern${students.length === 1 ? "" : "s"}</div>
        <h1>The <em>roster.</em></h1>
        <p class="lede">Every intern, their project, their room, and how far the review has travelled. Search it, filter it, or send the next batch of invitations.</p>
      </div>
      <div class="head-actions">
        ${queued ? `<button class="btn btn-rust" data-action="invite-all">${icon("send")} Invite ${queued} queued</button>` : ""}
        <a class="btn btn-dark" href="/upload" data-link>${icon("plus")} Upload roster</a>
      </div>
    </div>

    <div class="roster-toolbar">
      <label class="searchbox">
        ${icon("search")}
        <input id="roster-search" type="search" value="${esc(state.rosterSearch)}" placeholder="Search name, email, project or room" autocomplete="off" aria-label="Search roster">
      </label>
      <div class="filters" role="group" aria-label="Filter roster">
        ${[
          ["all", "All"],
          ["queued", "Queued"],
          ["invited", "Invited"],
          ["submitted", "Submitted"],
          ["analyzed", "Analysis"],
          ["debriefed", "Debriefs"],
        ]
          .map(
            ([key, label]) =>
              `<button type="button" class="filter ${state.rosterFilter === key ? "is-active" : ""}" data-roster-filter="${key}">${label}</button>`,
          )
          .join("")}
      </div>
      <span class="result-count" id="roster-count"></span>
    </div>
    <div id="roster-results"></div>`;

  applyLazyIcons(view);

  const results = document.getElementById("roster-results");
  const count = document.getElementById("roster-count");
  const search = document.getElementById("roster-search");

  const draw = () => {
    const query = state.rosterSearch.trim().toLowerCase();
    const filtered = students.filter((student) => {
      const matchesStatus = state.rosterFilter === "all" || student.status === state.rosterFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [student.name, student.email, student.projectTitle, student.sessionCode, student.projectBadge]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    count.textContent = `${filtered.length} of ${students.length}`;
    if (!students.length) {
      results.innerHTML = `<div class="empty">
        <span class="empty-icon">${icon("users")}</span>
        <h3>No interns yet.</h3>
        <p>Load the first roster and the desk will create a private review room, brief and schedule for each row.</p>
        <a class="btn btn-dark" href="/upload" data-link>${icon("upload")} Upload roster</a>
      </div>`;
      applyLazyIcons(results);
      return;
    }
    if (!filtered.length) {
      results.innerHTML = `<div class="empty">
        <span class="empty-icon">${icon("search")}</span>
        <h3>No matches on this manifest.</h3>
        <p>Try a different status, or clear the search to see the full cohort.</p>
        <button type="button" class="btn btn-ghost" data-clear-filters>${icon("x")} Clear filters</button>
      </div>`;
      applyLazyIcons(results);
      return;
    }
    results.innerHTML = `<div class="pass-grid">${filtered.map((student) => renderPass(student)).join("")}</div>`;
    applyLazyIcons(results);
  };

  const clearFilters = () => {
    state.rosterFilter = "all";
    state.rosterSearch = "";
    search.value = "";
    view.querySelectorAll("[data-roster-filter]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.rosterFilter === "all");
    });
    draw();
  };

  search.addEventListener(
    "input",
    debounce(() => {
      state.rosterSearch = search.value;
      draw();
    }, 140),
  );

  view.querySelectorAll("[data-roster-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.rosterFilter = button.dataset.rosterFilter;
      view.querySelectorAll("[data-roster-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      draw();
    });
  });

  results.addEventListener("click", (event) => {
    if (event.target.closest("[data-clear-filters]")) clearFilters();
  });

  draw();
}

export async function renderNotFound(sequence) {
  await ensureShellData();
  if (sequence !== state.renderSeq) return;
  view.innerHTML = `
    <div class="page-head">
      <div class="page-head-copy">
        <div class="eyebrow">404 · off the manifest</div>
        <h1>That page is not <em>on the board.</em></h1>
        <p class="lede">The address may have changed, or the link never existed. Head back to the desk and pick up from the overview.</p>
        <div class="head-actions" style="margin-top:22px">
          <a class="btn btn-dark" href="/" data-link>${icon("arrow-left")} Back to overview</a>
          <a class="btn btn-ghost" href="/roster" data-link>${icon("users")} Open roster</a>
        </div>
      </div>
    </div>`;
  applyLazyIcons(view);
}
