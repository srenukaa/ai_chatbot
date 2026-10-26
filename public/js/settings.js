import {
  api,
  applyLazyIcons,
  applyShellSettings,
  clearBusy,
  ensureShellData,
  esc,
  icon,
  setBusy,
  state,
  toast,
} from "./core.js";

const view = document.getElementById("view");

export async function renderSettings(sequence) {
  await ensureShellData();
  if (sequence !== state.renderSeq) return;
  const data = await api("/api/settings");
  if (sequence !== state.renderSeq) return;
  const settings = data.settings;
  state.settings = settings;
  state.config = settings.config || state.config || {};
  applyShellSettings();

  const config = state.config || {};
  const mail = config.mail || {};
  const ai = config.ai || {};
  const missing = Array.isArray(mail.missing) ? mail.missing : [];
  const missingHost = missing.some((item) => item.startsWith("SMTP_HOST"));
  const missingFrom = missing.some((item) => item.startsWith("MAIL_FROM"));

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head-copy">
        <div class="eyebrow">Desk settings · mail, meet and cadence</div>
        <h1>Tune the <em>desk.</em></h1>
        <p class="lede">Set where the mail goes, which Meet room to reuse, and how long the next review cycle should be. Configuration that belongs to the server lives in environment variables.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-ghost" href="/outbox" data-link>${icon("mail")} Open outbox</a>
      </div>
    </div>

    <div class="settings-grid">
      <form class="form-card settings-form" id="settings-form">
        <h3>Review defaults</h3>
        <p class="field-hint">These values are stored in the desk database and apply to new invitations and debriefs.</p>

        <fieldset>
          <legend>Mail delivery</legend>
          <div class="switch-row">
            <div class="switch-copy"><strong>Test mode</strong><span>Redirect every email to the test inbox instead of the intern.</span></div>
            <label class="switch"><input type="checkbox" name="testMode" ${settings.testMode ? "checked" : ""}><span></span></label>
          </div>
          <div class="field" style="margin-top:13px">
            <label for="test-email">Test email address</label>
            <input class="input" id="test-email" name="testEmail" type="email" value="${esc(settings.testEmail)}" required>
            <span class="field-hint" id="test-mode-note">${settings.testMode ? "On: every outbound message is routed here." : "Off: messages go to each intern's own address."}</span>
          </div>
        </fieldset>

        <fieldset>
          <legend>Meet room</legend>
          <div class="field">
            <label for="default-meet">Default Google Meet link</label>
            <input class="input" id="default-meet" name="defaultMeetLink" type="url" value="${esc(settings.defaultMeetLink || "")}" placeholder="https://meet.google.com/xxx-xxxx-xxx">
            <span class="field-hint">Optional. When set, every invite and next-review email reuses this room. Leave blank to generate demo room codes. A real Calendar integration is not included.</span>
          </div>
        </fieldset>

        <fieldset>
          <legend>Review cadence</legend>
          <div class="field-row">
            <div class="field">
              <label for="review-duration">Review duration (minutes)</label>
              <input class="input" id="review-duration" name="reviewDurationMinutes" type="number" min="10" max="180" step="5" value="${esc(settings.reviewDurationMinutes)}">
            </div>
            <div class="field">
              <label for="next-review-days">Next review (days)</label>
              <input class="input" id="next-review-days" name="nextReviewDays" type="number" min="1" max="60" step="1" value="${esc(settings.nextReviewDays)}">
            </div>
          </div>
          <div class="switch-row">
            <div class="switch-copy"><strong>Send debrief automatically</strong><span>After the review runs, immediately email the corrections, next steps, next date and Meet link.</span></div>
            <label class="switch"><input type="checkbox" name="autoSendDebrief" ${settings.autoSendDebrief ? "checked" : ""}><span></span></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Letterhead</legend>
          <div class="field-row">
            <div class="field">
              <label for="company-name">Company name</label>
              <input class="input" id="company-name" name="companyName" type="text" value="${esc(settings.companyName)}" maxlength="120">
            </div>
            <div class="field">
              <label for="sender-name">Sender name</label>
              <input class="input" id="sender-name" name="senderName" type="text" value="${esc(settings.senderName)}" maxlength="120">
            </div>
          </div>
        </fieldset>

        <div class="settings-actions">
          <button type="submit" class="btn btn-dark" id="save-settings">${icon("check")} Save settings</button>
          <button type="button" class="btn btn-ghost" id="send-test-email">${icon("send")} Send test email</button>
        </div>
        <p class="settings-note">Links in emails use the current host unless <code>APP_URL</code> is set on the server. Set it before sending to real interns.</p>
      </form>

      <aside class="sheet-aside">
        <div class="config-card">
          <div class="card-head">
            <div><div class="mono">Live configuration</div><h3 style="margin-top:5px">Desk wiring</h3></div>
            <span class="chip chip-dark">ENV</span>
          </div>
          <div class="config-line"><span>Mail</span><span class="${mail.mode === "smtp" ? "config-value-ok" : "config-value-warn"}">${mail.mode === "smtp" ? `SMTP · ${esc(mail.host || "connected")}` : "Outbox only"}</span></div>
          <div class="config-line"><span>AI mentor</span><span class="${ai.configured ? "config-value-ok" : "config-value-warn"}">${ai.configured ? esc(ai.model || "configured") : "Rubric fallback"}</span></div>
          <div class="config-line"><span>GitHub</span><span class="${config.github ? "config-value-ok" : "config-value-warn"}">${config.github ? "Token set" : "Public only"}</span></div>
          <div class="config-line"><span>Dashboard auth</span><span class="${config.dashboardAuth ? "config-value-ok" : "config-value-warn"}">${config.dashboardAuth ? "Password set" : "Open on local"}</span></div>
          <div class="config-line"><span>APP_URL</span><span class="${config.appUrl ? "config-value-ok" : "config-value-warn"}">${config.appUrl ? esc(config.appUrl) : "Not set"}</span></div>
          <div class="config-line"><span>Data file</span><span>${esc(config.dataFile || "data/db.json")}</span></div>
          <div class="env-list">
            ${[
              ["SMTP_HOST", mail.mode === "smtp" || !missingHost],
              ["SMTP_USER", mail.mode === "smtp"],
              ["SMTP_PASS", mail.mode === "smtp"],
              ["MAIL_FROM", mail.mode === "smtp" || !missingFrom],
              ["OPENAI_API_KEY", ai.configured],
              ["GITHUB_TOKEN", config.github],
              ["DASHBOARD_PASSWORD", config.dashboardAuth],
              ["APP_URL", config.appUrl],
            ]
              .map(([name, isSet]) => `<span class="env-code ${isSet ? "is-set" : ""}">${name}</span>`)
              .join("")}
          </div>
          <p class="settings-note" style="color:var(--sage)">Mail is configured through environment variables. The desk never displays the SMTP password.</p>
        </div>

        <div class="panel">
          <div class="panel-head"><span class="panel-title">Test the connection</span><span class="mono">${mail.mode === "smtp" ? "Live SMTP" : "Outbox"}</span></div>
          <p class="field-hint" style="font-size:11.5px">A test message follows the same delivery path as invitations. With no SMTP configuration it is stored in the outbox and marked simulated.</p>
          <div class="test-email-box">
            <button type="button" class="btn btn-rust" id="send-test-email-2">${icon("mail")} Send test email</button>
            <p class="field-hint" style="margin-top:7px">${settings.testMode ? `Test mode is on: delivered to ${esc(settings.testEmail)}.` : "The test message still goes to the test email address."}</p>
          </div>
        </div>

        <div class="callout callout-warn">
          ${icon("alert")}
          <span><strong>Google Meet:</strong> links use the configured room or a generated demo code. Integrate Google Calendar / Meet before relying on these links in production.</span>
        </div>
      </aside>
    </div>`;

  applyLazyIcons(view);

  const form = document.getElementById("settings-form");
  const testModeInput = form.querySelector('[name="testMode"]');
  const testEmailInput = document.getElementById("test-email");
  const note = document.getElementById("test-mode-note");

  const updateNote = () => {
    note.textContent = testModeInput.checked
      ? `On: every outbound message is routed to ${testEmailInput.value || "the test inbox"}.`
      : "Off: messages go to each intern's own address.";
  };
  testModeInput.addEventListener("change", updateNote);
  testEmailInput.addEventListener("input", updateNote);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("save-settings");
    const payload = {
      testMode: form.querySelector('[name="testMode"]').checked,
      testEmail: form.querySelector('[name="testEmail"]').value.trim(),
      defaultMeetLink: form.querySelector('[name="defaultMeetLink"]').value.trim(),
      autoSendDebrief: form.querySelector('[name="autoSendDebrief"]').checked,
      nextReviewDays: Number(form.querySelector('[name="nextReviewDays"]').value),
      reviewDurationMinutes: Number(form.querySelector('[name="reviewDurationMinutes"]').value),
      companyName: form.querySelector('[name="companyName"]').value.trim(),
      senderName: form.querySelector('[name="senderName"]').value.trim(),
    };
    setBusy(button, "Saving settings");
    try {
      const response = await api("/api/settings", { method: "PUT", body: payload });
      state.settings = response.settings;
      state.config = response.settings.config || state.config;
      state.bootstrap = null;
      applyShellSettings();
      toast("Settings saved.", "success");
      clearBusy(button);
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
  });

  const sendTest = async (button) => {
    setBusy(button, "Sending test");
    try {
      const result = await api("/api/settings/test-email", { method: "POST" });
      const status = result.email?.status;
      if (status === "sent") toast(`Test email sent to ${result.email.deliveredTo}.`, "success");
      else if (status === "simulated") toast("SMTP is not configured. The test message is in the outbox.", "info");
      else toast(result.email?.error || "The test email failed.", "error");
      state.bootstrap = null;
      clearBusy(button);
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
  };

  document.getElementById("send-test-email")?.addEventListener("click", (event) => sendTest(event.currentTarget));
  document.getElementById("send-test-email-2")?.addEventListener("click", (event) => sendTest(event.currentTarget));
}
