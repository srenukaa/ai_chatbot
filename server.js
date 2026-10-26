import "./src/env.js";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getOrigin,
  httpError,
  readJsonBody,
  sendJson,
  sendText,
  timingSafeEqualString,
} from "./src/util.js";
import { getDb, dbLocation, mutateDb } from "./src/db.js";
import { buildSampleCsv, buildSampleXlsx } from "./src/excel.js";
import { emailRecordView, mailStatus, sendTestEmail } from "./src/mailer.js";
import { aiStatus, mentorReply } from "./src/ai.js";
import {
  analyzeStudent,
  getBootstrap,
  getEmail,
  getOutbox,
  getReviewSession,
  getStudent,
  importRoster,
  listStudents,
  previewImport,
  sendDebrief,
  sendInvite,
  sendInviteAll,
  submitWork,
  updateStudent,
} from "./src/workflow.js";
import { isValidEmail, safeHttpsUrl } from "./src/util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DASHBOARD_PASSWORD = String(process.env.DASHBOARD_PASSWORD ?? "");
const DASHBOARD_USER = String(process.env.DASHBOARD_USER ?? "vulture");
const MAX_IMPORT_BODY = 42 * 1024 * 1024;
const MAX_SUBMIT_BODY = 26 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const buckets = new Map();
const analyzeLocks = new Set();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw httpError(429, "That action is happening too often. Wait a moment and try again.");
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

function isPublicPath(pathname) {
  return (
    pathname === "/api/health" ||
    pathname.startsWith("/api/review/") ||
    pathname.startsWith("/review/") ||
    pathname === "/app.js" ||
    pathname.startsWith("/js/") ||
    pathname === "/styles.css" ||
    pathname === "/favicon.svg" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/fonts/")
  );
}

function requireDashboardAuth(req, res, pathname) {
  if (!DASHBOARD_PASSWORD || isPublicPath(pathname)) return true;
  const header = String(req.headers.authorization ?? "");
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch {
      decoded = "";
    }
    const separator = decoded.indexOf(":");
    if (separator >= 0) {
      const user = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);
      if (timingSafeEqualString(user, DASHBOARD_USER) && timingSafeEqualString(password, DASHBOARD_PASSWORD)) {
        return true;
      }
    }
  }

  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Vulture Review Desk", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end("Authentication required.");
  return false;
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-src 'self' data: about:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
}

function settingsPayload(settings) {
  return {
    ...settings,
    config: {
      mail: mailStatus(),
      ai: aiStatus(),
      github: Boolean(process.env.GITHUB_TOKEN),
      dashboardAuth: Boolean(DASHBOARD_PASSWORD),
      appUrl: process.env.APP_URL || null,
      dataFile: path.relative(process.cwd(), dbLocation()),
    },
  };
}

async function parseImportBody(req) {
  const body = await readJsonBody(req, MAX_IMPORT_BODY);
  const filename = path.basename(String(body.filename ?? "roster.xlsx")).slice(0, 180);
  const raw = String(body.dataBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
  if (!raw) throw httpError(400, "Choose an .xlsx or .csv roster file to upload.");
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw httpError(400, "The uploaded file could not be decoded.");
  }
  if (!buffer.length) throw httpError(400, "The uploaded file is empty.");
  if (buffer.length > 12 * 1024 * 1024) {
    throw httpError(413, "The roster file is too large. The limit is 12 MB.");
  }
  return { filename, buffer, dryRun: Boolean(body.dryRun), sendInvites: Boolean(body.sendInvites) };
}

function methodNotAllowed(res, allowed) {
  res.writeHead(405, { "Allow": allowed, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: `Method not allowed. Use ${allowed}.` }));
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const origin = getOrigin(req);
  const method = req.method || "GET";

  if (pathname === "/api/health") {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    return sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      mail: mailStatus(),
      ai: aiStatus(),
    });
  }

  if (pathname === "/api/sample.xlsx") {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const file = buildSampleXlsx();
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="vulture-roster-sample.xlsx"',
      "Content-Length": file.length,
      "Cache-Control": "no-store",
    });
    return res.end(file);
  }

  if (pathname === "/api/sample.csv") {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const file = Buffer.from(buildSampleCsv(), "utf8");
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vulture-roster-sample.csv"',
      "Content-Length": file.length,
      "Cache-Control": "no-store",
    });
    return res.end(file);
  }

  if (pathname === "/api/bootstrap") {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const db = await getDb();
    const data = await getBootstrap(origin);
    const settings = settingsPayload(db.settings);
    return sendJson(res, 200, {
      ...data,
      settings,
      config: settings.config,
    });
  }

  if (pathname === "/api/students") {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const students = await listStudents(origin);
    return sendJson(res, 200, { students });
  }

  if (pathname === "/api/students/import") {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    const { filename, buffer, dryRun, sendInvites } = await parseImportBody(req);
    try {
      if (dryRun) {
        return sendJson(res, 200, await previewImport({ filename, buffer }));
      }
      const result = await importRoster({ filename, buffer, sendInvites, origin });
      return sendJson(res, 200, result);
    } catch (error) {
      if (!error.status) error.status = 400;
      throw error;
    }
  }

  if (pathname === "/api/students/invite-all") {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    rateLimit(`invite-all:${req.socket.remoteAddress}`, 5, 60_000);
    return sendJson(res, 200, await sendInviteAll({ origin }));
  }

  let match = pathname.match(/^\/api\/students\/([^/]+)\/invite$/);
  if (match) {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    rateLimit(`invite:${match[1]}:${req.socket.remoteAddress}`, 10, 60_000);
    return sendJson(res, 200, await sendInvite(decodeURIComponent(match[1]), { origin }));
  }

  match = pathname.match(/^\/api\/students\/([^/]+)\/debrief$/);
  if (match) {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    rateLimit(`debrief:${match[1]}:${req.socket.remoteAddress}`, 8, 60_000);
    return sendJson(res, 200, await sendDebrief(decodeURIComponent(match[1]), { origin }));
  }

  match = pathname.match(/^\/api\/students\/([^/]+)$/);
  if (match) {
    const studentId = decodeURIComponent(match[1]);
    if (method === "GET") {
      return sendJson(res, 200, { student: await getStudent(studentId, origin) });
    }
    if (method === "PATCH") {
      const body = await readJsonBody(req, 64 * 1024);
      if (body.email && !isValidEmail(body.email)) throw httpError(400, "That email address is not valid.");
      const student = await updateStudent(studentId, body, origin);
      return sendJson(res, 200, { student });
    }
    return methodNotAllowed(res, "GET, PATCH");
  }

  match = pathname.match(/^\/api\/review\/([^/]+)$/);
  if (match) {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const session = await getReviewSession(decodeURIComponent(match[1]));
    if (!session) throw httpError(404, "This review link is not valid, or the session was removed.");
    return sendJson(res, 200, session);
  }

  match = pathname.match(/^\/api\/review\/([^/]+)\/chat$/);
  if (match) {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    const token = decodeURIComponent(match[1]);
    rateLimit(`chat:${token}:${req.socket.remoteAddress}`, 30, 10 * 60_000);
    const body = await readJsonBody(req, 256 * 1024);
    const message = String(body.message ?? "").trim();
    if (!message) throw httpError(400, "Write a message before sending.");
    if (message.length > 4000) throw httpError(400, "Keep the message under 4,000 characters.");
    const session = await getReviewSession(token);
    if (!session) throw httpError(404, "This review link is not valid.");
    const result = await mentorReply({
      student: session.student,
      playbook: session.playbook,
      message,
      history: Array.isArray(body.history) ? body.history : [],
      settings: session.settings,
    });
    return sendJson(res, 200, result);
  }

  match = pathname.match(/^\/api\/review\/([^/]+)\/submit$/);
  if (match) {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    const token = decodeURIComponent(match[1]);
    rateLimit(`submit:${token}:${req.socket.remoteAddress}`, 8, 60 * 60_000);
    const body = await readJsonBody(req, MAX_SUBMIT_BODY);
    const result = await submitWork({
      token,
      githubUrl: body.githubUrl,
      docName: body.docName,
      docBase64: body.docBase64,
      notes: body.notes,
    });
    return sendJson(res, 200, result);
  }

  match = pathname.match(/^\/api\/review\/([^/]+)\/analyze$/);
  if (match) {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    const token = decodeURIComponent(match[1]);
    if (analyzeLocks.has(token)) {
      throw httpError(429, "The review is already running. Give it a moment.");
    }
    analyzeLocks.add(token);
    try {
      rateLimit(`analyze:${token}:${req.socket.remoteAddress}`, 6, 60 * 60_000);
      const db = await getDb();
      const student = db.students.find((item) => item.token === token);
      if (!student) throw httpError(404, "This review link is not valid.");
      const result = await analyzeStudent(student.id, { origin });
      return sendJson(res, 200, result);
    } finally {
      analyzeLocks.delete(token);
    }
  }

  if (pathname === "/api/outbox") {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const type = String(searchParams.get("type") ?? "");
    const emails = await getOutbox({ type, limit: 120 });
    return sendJson(res, 200, {
      emails,
      counts: {
        all: emails.length,
        invite: emails.filter((email) => email.type === "invite").length,
        debrief: emails.filter((email) => email.type === "debrief").length,
        test: emails.filter((email) => email.type === "test").length,
        failed: emails.filter((email) => email.status === "failed").length,
      },
    });
  }

  match = pathname.match(/^\/api\/outbox\/([^/]+)$/);
  if (match) {
    if (method !== "GET") return methodNotAllowed(res, "GET");
    const record = await getEmail(decodeURIComponent(match[1]));
    return sendJson(res, 200, { email: emailRecordView(record, { includeHtml: true }) });
  }

  if (pathname === "/api/settings") {
    if (method === "GET") {
      const db = await getDb();
      return sendJson(res, 200, { settings: settingsPayload(db.settings) });
    }
    if (method === "PUT") {
      const body = await readJsonBody(req, 64 * 1024);
      if (body.testEmail !== undefined && !isValidEmail(body.testEmail)) {
        throw httpError(400, "The test email address is not valid.");
      }
      if (body.defaultMeetLink) {
        const link = safeHttpsUrl(body.defaultMeetLink);
        if (!link) throw httpError(400, "The default Meet link must be a full https:// URL.");
      }
      if (body.nextReviewDays !== undefined) {
        const days = Number(body.nextReviewDays);
        if (!Number.isFinite(days) || days < 1 || days > 60) {
          throw httpError(400, "The next review interval must be between 1 and 60 days.");
        }
      }
      if (body.reviewDurationMinutes !== undefined) {
        const minutes = Number(body.reviewDurationMinutes);
        if (!Number.isFinite(minutes) || minutes < 10 || minutes > 180) {
          throw httpError(400, "The review duration must be between 10 and 180 minutes.");
        }
      }

      const updated = await mutateDb((database) => {
        if (body.testMode !== undefined) database.settings.testMode = Boolean(body.testMode);
        if (body.testEmail !== undefined) database.settings.testEmail = String(body.testEmail).trim().toLowerCase();
        if (body.defaultMeetLink !== undefined) {
          database.settings.defaultMeetLink = safeHttpsUrl(body.defaultMeetLink) || "";
        }
        if (body.autoSendDebrief !== undefined) database.settings.autoSendDebrief = Boolean(body.autoSendDebrief);
        if (body.nextReviewDays !== undefined) database.settings.nextReviewDays = Math.round(Number(body.nextReviewDays));
        if (body.reviewDurationMinutes !== undefined) {
          database.settings.reviewDurationMinutes = Math.round(Number(body.reviewDurationMinutes));
        }
        if (body.companyName !== undefined) {
          database.settings.companyName = String(body.companyName).trim().slice(0, 120) || database.settings.companyName;
        }
        if (body.senderName !== undefined) {
          database.settings.senderName = String(body.senderName).trim().slice(0, 120) || database.settings.senderName;
        }
        return database.settings;
      });
      return sendJson(res, 200, { settings: settingsPayload(updated) });
    }
    return methodNotAllowed(res, "GET, PUT");
  }

  if (pathname === "/api/settings/test-email") {
    if (method !== "POST") return methodNotAllowed(res, "POST");
    rateLimit(`test-email:${req.socket.remoteAddress}`, 5, 60_000);
    const db = await getDb();
    const record = await sendTestEmail(db.settings, origin);
    return sendJson(res, 200, {
      email: emailRecordView(record),
      delivered: record.status === "sent" || record.status === "simulated",
      testMode: db.settings.testMode,
    });
  }

  throw httpError(404, "API route not found.");
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(safePath);
  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendText(res, 403, "Forbidden");
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
    const data = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      ...securityHeaders(),
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=0, must-revalidate",
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    return res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") return sendText(res, 404, "Not found");
    throw error;
  }
}

async function serveIndex(req, res) {
  const file = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
  res.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": file.length,
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD") return res.end();
  res.end(file);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    if (process.env.QUIET !== "true") {
      console.log(`${req.method} ${req.url?.split("?")[0]} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (!requireDashboardAuth(req, res, pathname)) return;

    if (req.method === "OPTIONS") {
      res.writeHead(204, { Allow: "GET, POST, PUT, PATCH, HEAD, OPTIONS" });
      return res.end();
    }

    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendText(res, 405, "Method not allowed");
    }

    const extension = path.extname(pathname);
    if (extension) {
      return await serveStatic(req, res, pathname);
    }

    if (pathname === "/" || /^\/(roster|upload|outbox|settings|review\/[^/]+)\/?$/.test(pathname)) {
      return await serveIndex(req, res);
    }

    return await serveIndex(req, res);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(error);
    if (res.headersSent) return res.end();
    if (req.url?.startsWith("/api/")) {
      return sendJson(res, status, {
        error: status >= 500 ? "The review desk hit an unexpected error. Check the server log." : error.message,
      });
    }
    return sendText(res, status, status >= 500 ? "Something went wrong." : error.message);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set PORT to another value and restart.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

const startupDb = await getDb();
server.listen(PORT, HOST, () => {
  const mail = mailStatus();
  const ai = aiStatus();
  console.log("");
  console.log("  VULTURE / INTERN REVIEW DESK");
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Data: ${dbLocation()}`);
  console.log(`  Mail: ${mail.configured ? `SMTP via ${mail.host}:${mail.port}` : "outbox only (SMTP not configured)"}`);
  console.log(`  AI: ${ai.configured ? `AI provider (${ai.model})` : "local rubric mentor (no AI key)"}`);
  console.log(
    `  Test mode: ${startupDb.settings.testMode ? `on → ${startupDb.settings.testEmail}` : "off (real intern addresses)"}`,
  );
  if (DASHBOARD_PASSWORD) console.log("  Dashboard password: enabled");
  console.log("");
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
