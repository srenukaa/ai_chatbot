export const state = {
  bootstrap: null,
  settings: null,
  config: null,
  route: null,
  renderSeq: 0,
  upload: null,
  outbox: [],
};

export const toastRoot = document.getElementById("toast-root");
export const modalRoot = document.getElementById("modal-root");

export const STATUS_LABELS = {
  queued: "Queued",
  invited: "Invited",
  submitted: "Submitted",
  analyzed: "Analysis ready",
  debriefed: "Debrief sent",
};

export const STATUS_ORDER = { queued: 0, invited: 1, submitted: 2, analyzed: 3, debriefed: 4 };

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 15v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  "arrow-left": '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  "arrow-up-right": '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  "arrow-down": '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  check: '<path d="m5 12 4.5 4.5L19 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  spark: '<path d="m12 3-1.9 5.8L4 10.7l5.8 1.9L12 18.4l1.9-5.8L20 10.7l-6.1-1.9Z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  alert: '<path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L3 10"/><path d="M4 4v6h6"/><path d="M4 13a8 8 0 0 0 14.7 4L21 14"/><path d="M20 20v-6h-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 9-9M17 6l2 2M14 9l2 2"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  inbox: '<path d="M4 4h16l2 10v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4Z"/><path d="M2 14h6l2 3h4l2-3h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6"/>',
  "mail-open": '<path d="M3 8.5 12 3l9 5.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="m3 9 9 6 9-6"/>',
};

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function icon(name, cls = "") {
  const body = ICONS[name] || ICONS.info;
  return `<svg${cls ? ` class="${esc(cls)}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hydrateStaticIcons() {
  document.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = icon(element.dataset.icon);
  });
}

export function applyLazyIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    if (!element.firstElementChild) element.innerHTML = icon(element.dataset.icon);
  });
}

export function safeUrl(value) {
  const text = String(value ?? "");
  if (/^https?:\/\//i.test(text) || text.startsWith("/")) return esc(text);
  return "#";
}

export function statusKey(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? status : "queued";
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Unknown";
}

export function statusMarkup(status) {
  const key = statusKey(status);
  return `<span class="status status-${key}">${esc(statusLabel(key))}</span>`;
}

export function emailStatusLabel(status) {
  if (status === "sent") return "Delivered";
  if (status === "simulated") return "In outbox";
  if (status === "failed") return "Failed";
  return status || "Unknown";
}

export function emailStatusMarkup(status) {
  const key = ["sent", "simulated", "failed"].includes(status) ? status : "simulated";
  return `<span class="status status-${key}">${esc(emailStatusLabel(status))}</span>`;
}

export function wordCount(value) {
  return String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function istDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return `${new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date)} IST`;
}

export function topDate() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase();
}

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

export function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

export function listMarkup(items, className = "analysis-list") {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "";
  return `<ul class="${esc(className)}">${list.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) data = await response.json();
  else {
    const text = await response.text();
    data = { error: text || `Request failed with status ${response.status}.` };
  }
  if (!response.ok) {
    let message = data?.error || `Request failed with status ${response.status}.`;
    if (response.status === 401) message = "Sign in required. Reload the page and enter the dashboard password.";
    throw new ApiError(message, response.status);
  }
  return data;
}

export function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma < 0) {
        reject(new Error("The file could not be read."));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast toast-${type}`;
  const iconName = type === "error" ? "alert" : type === "info" ? "info" : "check";
  element.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  toastRoot.appendChild(element);
  window.setTimeout(() => {
    element.style.opacity = "0";
    element.style.transform = "translateY(8px)";
    window.setTimeout(() => element.remove(), 250);
  }, type === "error" ? 7000 : 4600);
}

export function pageLoader(label = "Opening the review desk") {
  return `<div class="page-loader"><span class="spinner"></span><span class="mono">${esc(label)}</span></div>`;
}

export function errorPanel(error) {
  return `
    <div class="panel">
      <div class="card-head">
        <div>
          <div class="eyebrow">Desk error</div>
          <h2 style="margin-top:8px;font-size:42px">Something slipped.</h2>
        </div>
        <span class="chip chip-rust">${icon("alert")} Request failed</span>
      </div>
      <p class="lede">${esc(error?.message || "The desk could not complete that request.")}</p>
      <div class="head-actions" style="margin-top:20px">
        <button class="btn btn-dark" data-action="reload">${icon("refresh")} Try again</button>
        <a class="btn btn-ghost" href="/" data-link>${icon("arrow-left")} Back to overview</a>
      </div>
    </div>`;
}

export function setBusy(button, label) {
  if (!button) return;
  button.dataset.originalHtml = button.innerHTML;
  button.classList.add("is-loading");
  button.disabled = true;
  button.innerHTML = `<span>${esc(label)}</span>`;
}

export function clearBusy(button) {
  if (!button) return;
  button.classList.remove("is-loading");
  button.disabled = false;
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

export function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export async function copyText(text, label = "Review link copied.") {
  const value = String(text || "");
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast(label, "success");
  } catch {
    toast("The link could not be copied. Select it manually instead.", "error");
  }
}

let modalPreviousFocus = null;

export function openModal(inner, { wide = false } = {}) {
  modalPreviousFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true">${inner}</div></div>`;
  document.body.classList.add("modal-open");
  const close = modalRoot.querySelector(".modal-close");
  if (close) close.focus();
}

export function closeModal() {
  if (!modalRoot.firstChild) return;
  modalRoot.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (modalPreviousFocus && typeof modalPreviousFocus.focus === "function") {
    modalPreviousFocus.focus();
  }
  modalPreviousFocus = null;
}

export async function ensureShellData(force = false) {
  if (!force && state.bootstrap && Date.now() - (state.bootstrap.loadedAt || 0) < 12000) return state.bootstrap;
  const data = await api("/api/bootstrap");
  data.loadedAt = Date.now();
  state.bootstrap = data;
  state.settings = data.settings;
  state.config = data.config || data.settings?.config || {};
  applyShellSettings();
  return data;
}

export function applyShellSettings() {
  const settings = state.settings;
  if (!settings) return;
  const config = state.config || {};
  const mailMode = config.mail?.mode || (config.mail?.configured ? "smtp" : "outbox");
  const testBanner = document.getElementById("test-banner");

  if (settings.testMode) {
    testBanner.hidden = false;
    const text = document.getElementById("test-banner-text");
    if (text) {
      text.innerHTML = `Every outbound email is redirected to <strong>${esc(settings.testEmail)}</strong> while test mode is on.`;
    }
  } else {
    testBanner.hidden = true;
  }

  const railMode = document.getElementById("rail-mode");
  const railText = document.getElementById("rail-mode-text");
  if (railMode && railText) {
    railMode.classList.remove("is-test", "is-live");
    if (settings.testMode) {
      railMode.classList.add("is-test");
      railText.textContent = "Test mode · mail redirected";
    } else if (mailMode === "smtp") {
      railMode.classList.add("is-live");
      railText.textContent = "SMTP connected · live";
    } else {
      railText.textContent = "Outbox mode · no SMTP";
    }
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

document.addEventListener("click", (event) => {
  if (!modalRoot.firstChild) return;
  if (event.target.classList.contains("modal-backdrop")) closeModal();
  else if (event.target.closest("[data-modal-close]")) closeModal();
});
