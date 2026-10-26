import {
  api,
  clearBusy,
  closeModal,
  copyText,
  hydrateStaticIcons,
  pageLoader,
  errorPanel,
  setBusy,
  state,
  toast,
  topDate,
} from "./js/core.js";
import {
  navigate,
  parseRoute,
  refresh,
  setActiveNav,
  setBreadcrumb,
  setRenderer,
  setRouteTitle,
} from "./js/router.js";
import { renderDashboard, renderNotFound, renderRoster } from "./js/dashboard.js";
import { renderUpload } from "./js/intake.js";
import { openEmailPreview, renderOutbox } from "./js/outbox.js";
import { renderSettings } from "./js/settings.js";
import { renderReview } from "./js/review.js";

const view = document.getElementById("view");
const crumbs = {
  dashboard: "Overview",
  roster: "Roster",
  upload: "Roster intake",
  outbox: "Outbox",
  settings: "Settings",
  notfound: "Not found",
};

async function render(route = parseRoute()) {
  state.route = route;
  state.renderSeq += 1;
  const sequence = state.renderSeq;
  const isReview = route.name === "review";
  document.body.classList.toggle("review-mode", isReview);
  closeModal();
  hydrateStaticIcons();

  if (isReview) {
    setActiveNav("");
    setBreadcrumb("Review room");
    setRouteTitle("review");
    view.innerHTML = pageLoader("Opening your review room");
    window.scrollTo(0, 0);
    try {
      await renderReview(route.token, sequence, render);
    } catch (error) {
      if (sequence === state.renderSeq) view.innerHTML = errorPanel(error);
    }
    return;
  }

  setActiveNav(route.name);
  setBreadcrumb(crumbs[route.name] || "Review desk");
  setRouteTitle(route.name);
  window.scrollTo(0, 0);

  try {
    if (route.name === "dashboard") await renderDashboard(sequence);
    else if (route.name === "roster") await renderRoster(sequence);
    else if (route.name === "upload") await renderUpload(sequence);
    else if (route.name === "outbox") await renderOutbox(sequence);
    else if (route.name === "settings") await renderSettings(sequence);
    else await renderNotFound(sequence);
  } catch (error) {
    if (sequence !== state.renderSeq) return;
    view.innerHTML = errorPanel(error);
  }
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action) return;

  if (action === "reload") {
    refresh();
    return;
  }

  if (action === "copy-link") {
    await copyText(button.dataset.url || "", "Review link copied.");
    return;
  }

  if (action === "open-email") {
    await openEmailPreview(button.dataset.emailId);
    return;
  }

  if (action === "invite") {
    setBusy(button, "Sending invite");
    try {
      const result = await api(`/api/students/${encodeURIComponent(button.dataset.id)}/invite`, { method: "POST" });
      const status = result.email?.status;
      if (status === "failed") {
        toast(result.email?.error || "The invitation failed to send.", "error");
        clearBusy(button);
        return;
      }
      if (result.testMode) {
        toast(`Invitation recorded for the test inbox (${result.email?.deliveredTo}).`, "success");
      } else {
        toast(`Invitation ${status === "sent" ? `sent to ${result.email?.deliveredTo}` : "stored in the outbox"}.`, "success");
      }
      state.bootstrap = null;
      refresh();
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
    return;
  }

  if (action === "invite-all") {
    setBusy(button, "Sending invitations");
    try {
      const result = await api("/api/students/invite-all", { method: "POST" });
      if (!result.total) {
        toast("There are no queued interns to invite.", "info");
      } else if (result.failed) {
        toast(`${result.sent} invitation${result.sent === 1 ? "" : "s"} recorded, ${result.failed} failed.`, "error");
      } else {
        toast(`${result.sent} invitation${result.sent === 1 ? "" : "s"} processed.`, "success");
      }
      state.bootstrap = null;
      refresh();
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
    return;
  }

  if (action === "send-debrief") {
    setBusy(button, "Sending debrief");
    try {
      const result = await api(`/api/students/${encodeURIComponent(button.dataset.id)}/debrief`, { method: "POST" });
      const status = result.email?.status;
      if (status === "failed") {
        toast(result.email?.error || "The debrief failed to send.", "error");
        clearBusy(button);
        return;
      }
      if (result.testMode) {
        toast(`Debrief recorded for the test inbox (${result.email?.deliveredTo}).`, "success");
      } else {
        toast(`Debrief ${status === "sent" ? `sent to ${result.email?.deliveredTo}` : "stored in the outbox"}.`, "success");
      }
      state.bootstrap = null;
      refresh();
    } catch (error) {
      clearBusy(button);
      toast(error.message, "error");
    }
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (!link) return;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target === "_blank") return;
  const href = link.getAttribute("href");
  if (!href || /^https?:\/\//i.test(href)) return;
  event.preventDefault();
  navigate(href);
});

view.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  event.preventDefault();
  handleAction(button);
});

window.addEventListener("popstate", () => render(parseRoute()));

setRenderer(render);
hydrateStaticIcons();
const dateElement = document.getElementById("topbar-date");
if (dateElement) dateElement.textContent = topDate();
render(parseRoute());
