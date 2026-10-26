let renderer = null;

export function setRenderer(fn) {
  renderer = fn;
}

export function parseRoute() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "dashboard" };
  if (path === "/roster") return { name: "roster" };
  if (path === "/upload") return { name: "upload" };
  if (path === "/outbox") return { name: "outbox" };
  if (path === "/settings") return { name: "settings" };
  const review = path.match(/^\/review\/([^/]+)$/);
  if (review) {
    let token = review[1];
    try {
      token = decodeURIComponent(token);
    } catch {
      token = review[1];
    }
    return { name: "review", token };
  }
  return { name: "notfound" };
}

export function navigate(path, { replace = false } = {}) {
  const target = new URL(path, location.origin);
  if (target.origin !== location.origin) {
    location.href = target.href;
    return;
  }
  const next = `${target.pathname}${target.search}${target.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next === current) return;
  if (replace) history.replaceState({}, "", next);
  else history.pushState({}, "", next);
  if (renderer) renderer(parseRoute());
}

export function refresh() {
  if (renderer) renderer(parseRoute());
}

export function setActiveNav(name) {
  document.querySelectorAll(".rail-nav a").forEach((link) => {
    if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

export function setBreadcrumb(text) {
  const element = document.getElementById("breadcrumb");
  if (element) element.textContent = text;
}

export function setRouteTitle(name) {
  const titles = {
    dashboard: "Overview",
    roster: "Roster",
    upload: "Roster intake",
    outbox: "Outbox",
    settings: "Settings",
    notfound: "Not found",
    review: "Review room",
  };
  document.title = `${titles[name] || "Review desk"} · Vulture Review Desk`;
}
