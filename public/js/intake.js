import {
  api,
  applyLazyIcons,
  clearBusy,
  ensureShellData,
  esc,
  formatBytes,
  icon,
  readFileBase64,
  setBusy,
  state,
  toast,
} from "./core.js";

const view = document.getElementById("view");

export async function renderUpload(sequence) {
  const data = await ensureShellData();
  if (sequence !== state.renderSeq) return;
  state.upload = { file: null, base64: null, preview: null, result: null };
  const settings = data.settings || {};

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head-copy">
        <div class="eyebrow">Roster intake · Excel or CSV</div>
        <h1>Load the <em>manifest.</em></h1>
        <p class="lede">Drop the sheet HR already keeps. The desk checks every row, proposes a review slot for each valid intern, and can send all invitations in one pass.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-ghost" href="/api/sample.xlsx" download>${icon("download")} Sample XLSX</a>
        <a class="btn btn-ghost" href="/api/sample.csv" download>${icon("file")} Sample CSV</a>
      </div>
    </div>

    <div class="split">
      <div id="upload-workspace">
        <section class="dropzone" id="upload-dropzone">
          <input id="upload-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" aria-label="Choose roster file">
          <span class="dropzone-icon">${icon("upload")}</span>
          <div class="dropzone-title">Drop the sheet here</div>
          <p class="dropzone-text">or <strong>browse</strong> to choose a file. Accepts <strong>.xlsx</strong> and <strong>.csv</strong> up to 12 MB. The first sheet is read.</p>
          <div class="dropzone-meta">
            <span class="chip">Name</span>
            <span class="chip">Email</span>
            <span class="chip">Project</span>
            <span class="chip">Review date · optional</span>
          </div>
        </section>
        <div id="preview-zone" style="margin-top:16px"></div>
      </div>

      <aside class="sheet-aside">
        <div class="panel">
          <div class="panel-head"><span class="panel-title">Sheet rules</span><span class="mono">Required + optional</span></div>
          <ul class="rules-list">
            <li><span><strong>Name</strong> and <strong>email</strong> are required. Duplicate emails update the existing intern.</span></li>
            <li><span><strong>Project</strong> chooses the review playbook. Image classification and sentiment analysis get tailored rubrics.</span></li>
            <li><span><strong>Review date</strong> is optional. Blank rows are scheduled on the next weekday at 10:00 IST, spaced 30 minutes apart.</span></li>
            <li><span><strong>Meet link</strong> is optional. Paste a real room, or the desk assigns a demo Meet code.</span></li>
          </ul>
        </div>
        <div class="panel">
          <div class="panel-head"><span class="panel-title">Expected shape</span><span class="mono">2 sample rows</span></div>
          <div class="sample-table-wrap">
            <table class="sample-table">
              <thead><tr><th>Name</th><th>Email</th><th>Project</th></tr></thead>
              <tbody>
                <tr><td>Madhu</td><td>madhus…@gmail.com</td><td>AI based image classification</td></tr>
                <tr><td>Renuka</td><td>srenuka…@gmail.com</td><td>AI based sentimental analysis</td></tr>
              </tbody>
            </table>
          </div>
          <p class="field-hint" style="margin-top:10px">Header names are flexible: name / intern / student, email / email id, project / project title.</p>
        </div>
        <div class="callout ${settings.testMode ? "callout-rust" : "callout-info"}">
          ${icon(settings.testMode ? "shield" : "mail")}
          <span>${settings.testMode ? `Test mode is on. Invitations will be recorded for <strong>${esc(settings.testEmail)}</strong>, not the intern.` : "Test mode is off. Invitations will be sent to each intern's own email address."}</span>
        </div>
      </aside>
    </div>`;

  applyLazyIcons(view);

  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("upload-file");
  const previewZone = document.getElementById("preview-zone");

  const chooseFile = async (file) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      toast("Choose an .xlsx or .csv roster file.", "error");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast("The roster file is too large. The limit is 12 MB.", "error");
      return;
    }
    state.upload = { file, base64: null, preview: null, result: null };
    previewZone.innerHTML = `
      <div class="preview-panel">
        <div class="preview-head"><h3>Reading ${esc(file.name)}</h3><span class="mono">${esc(formatBytes(file.size))}</span></div>
        <div class="page-loader" style="min-height:180px;padding:42px 20px"><span class="spinner"></span><span class="mono">Checking rows and scheduling reviews</span></div>
      </div>`;
    try {
      const base64 = await readFileBase64(file);
      state.upload.base64 = base64;
      const preview = await api("/api/students/import", {
        method: "POST",
        body: { filename: file.name, dataBase64: base64, dryRun: true },
      });
      state.upload.preview = preview;
      renderPreview();
    } catch (error) {
      state.upload = { file: null, base64: null, preview: null, result: null };
      previewZone.innerHTML = `<div class="callout callout-rust">${icon("alert")}<span>${esc(error.message)}</span></div>`;
      toast(error.message, "error");
    }
  };

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file) chooseFile(file);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) chooseFile(file);
    fileInput.value = "";
  });

  function renderPreview() {
    const preview = state.upload?.preview;
    if (!preview) return;
    const currentSettings = state.settings || settings;
    const rows = preview.rows || [];
    const summary = preview.summary || {};
    const tableRows = rows.length
      ? rows
          .map(
            (row) => `
        <tr class="${row.issues?.length ? "row-invalid" : ""}">
          <td class="cell-name">${esc(row.name || "Missing name")}${
            row.issues?.length
              ? `<div class="issue-text">${row.issues.map((issue) => esc(issue)).join("<br>")}</div>`
              : ""
          }</td>
          <td class="cell-email">${esc(row.email || "Missing email")}</td>
          <td class="cell-project">${esc(row.projectTitle || "Applied AI project")}</td>
          <td class="cell-date">${esc(row.reviewDateLabel || "Auto-scheduled")}<br><span class="muted">${row.meetLinkGenerated ? "Meet auto" : "Meet set"}</span></td>
          <td><span class="chip ${row.action === "new" ? "chip-rust" : ""}">${row.action === "update" ? "Update" : "New"}</span>${
            row.existingStatusLabel ? `<div class="issue-text" style="color:var(--muted)">${esc(row.existingStatusLabel)}</div>` : ""
          }</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No rows were found in the first sheet.</td></tr>`;

    previewZone.innerHTML = `
      <div class="preview-panel">
        <div class="preview-head">
          <div>
            <h3>${esc(preview.sheetName || "Roster")}</h3>
            <span class="mono">${esc(state.upload.file?.name || "Selected sheet")} · ${esc(formatBytes(state.upload.file?.size || 0))}</span>
          </div>
          <div class="preview-summary">
            <span class="summary-pill">${esc(summary.total || 0)} rows</span>
            <span class="summary-pill is-ok">${esc(summary.valid || 0)} valid</span>
            ${summary.invalid ? `<span class="summary-pill is-bad">${esc(summary.invalid)} blocked</span>` : ""}
            <span class="summary-pill ${summary.updates ? "is-warn" : ""}">${esc(summary.updates || 0)} update${summary.updates === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Intern</th><th>Email</th><th>Project</th><th>Review slot</th><th>Row</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
      <div class="import-bar">
        <div>
          <label class="checkline ${summary.valid ? "" : "is-disabled"}">
            <input id="send-invites" type="checkbox" ${summary.valid ? "checked" : ""}>
            Send invitations after import
          </label>
          <div class="field-hint" style="margin-top:5px">${
            currentSettings.testMode
              ? `All mail is redirected to ${esc(currentSettings.testEmail)} while test mode is on.`
              : "Mail will be sent to each valid intern's own address."
          }</div>
        </div>
        <div class="import-actions">
          <button type="button" class="btn btn-ghost" data-reset-upload>${icon("x")} Choose another</button>
          <button type="button" class="btn btn-dark" id="confirm-import" ${summary.valid ? "" : "disabled"}>${icon("check")} Import ${summary.valid || 0} intern${summary.valid === 1 ? "" : "s"}</button>
        </div>
      </div>`;

    previewZone.querySelector("[data-reset-upload]")?.addEventListener("click", resetUpload);
    document.getElementById("confirm-import")?.addEventListener("click", confirmImport);
    previewZone.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function resetUpload() {
    state.upload = { file: null, base64: null, preview: null, result: null };
    previewZone.innerHTML = "";
    fileInput.value = "";
    dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function confirmImport(event) {
    const button = event.currentTarget;
    const preview = state.upload?.preview;
    if (!preview || !state.upload?.base64) return;
    const sendInvites = Boolean(document.getElementById("send-invites")?.checked);
    setBusy(button, sendInvites ? "Importing and sending invitations" : "Importing roster");
    try {
      const result = await api("/api/students/import", {
        method: "POST",
        body: {
          filename: state.upload.file.name,
          dataBase64: state.upload.base64,
          dryRun: false,
          sendInvites,
        },
      });
      state.upload.result = result;
      state.bootstrap = null;
      const failedInvites = (result.invites || []).filter((invite) => !invite.ok);
      previewZone.innerHTML = `
        <div class="preview-panel">
          <div class="preview-head">
            <div>
              <div class="eyebrow">Import complete</div>
              <h3 style="margin-top:5px">Roster is on the desk.</h3>
              <span class="mono">${esc(result.message || "")}</span>
            </div>
            <div class="preview-summary">
              <span class="summary-pill is-ok">${esc(result.imported || 0)} new</span>
              <span class="summary-pill">${esc(result.updated || 0)} updated</span>
              ${result.skipped ? `<span class="summary-pill is-bad">${esc(result.skipped)} skipped</span>` : ""}
              ${result.invited ? `<span class="summary-pill is-ok">${esc(result.invited)} invited</span>` : ""}
            </div>
          </div>
          <div style="padding:17px">
            ${
              sendInvites
                ? `<div class="callout ${failedInvites.length ? "callout-warn" : "callout-info"}">${icon(failedInvites.length ? "alert" : "mail")}<span>${
                    failedInvites.length
                      ? `${failedInvites.length} invitation${failedInvites.length === 1 ? "" : "s"} could not be recorded. Open the outbox or roster to inspect them.`
                      : `Invitations were processed. ${state.settings?.testMode ? `Test mode sent them to ${esc(state.settings.testEmail)}.` : "Check the outbox for delivery status."}`
                  }</span></div>`
                : `<div class="callout">${icon("info")}<span>Rows were imported without sending invitations. Open the roster to send them when you are ready.</span></div>`
            }
            <div class="head-actions" style="margin-top:16px">
              <a class="btn btn-dark" href="/roster" data-link>${icon("users")} Open roster</a>
              <button type="button" class="btn btn-ghost" data-reset-upload>${icon("upload")} Upload another</button>
            </div>
          </div>
        </div>`;
      previewZone.querySelector("[data-reset-upload]")?.addEventListener("click", resetUpload);
      applyLazyIcons(previewZone);
      toast(result.message || "Roster imported.", "success");
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
  }
}
