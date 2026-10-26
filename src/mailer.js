import net from "node:net";
import tls from "node:tls";
import os from "node:os";
import crypto from "node:crypto";
import { mutateDb } from "./db.js";
import { isValidEmail, normalizeEmail, plainTextFromHtml, randomId } from "./util.js";

function parseFrom(value) {
  const text = String(value ?? "").trim();
  if (!text) return { name: "", email: "" };
  const match = text.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/^"|"$/g, "").trim(), email: match[2].trim() };
  }
  return { name: "", email: text };
}

export function mailConfig() {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465;
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "");
  const fromRaw = String(process.env.MAIL_FROM ?? "").trim() || user;
  const from = parseFrom(fromRaw);
  const replyTo = String(process.env.MAIL_REPLY_TO ?? "").trim();
  const configured = Boolean(host && from.email && (!user || pass));
  const missing = [];
  if (!host) missing.push("SMTP_HOST");
  if (!from.email) missing.push("MAIL_FROM (or SMTP_USER)");
  if (user && !pass) missing.push("SMTP_PASS");

  return {
    configured,
    host,
    port,
    secure,
    user,
    pass,
    fromName: from.name || "Vulture Management Wings",
    fromEmail: from.email,
    replyTo,
    missing,
    rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !== "false",
  };
}

export function mailStatus() {
  const config = mailConfig();
  return {
    mode: config.configured ? "smtp" : "outbox",
    configured: config.configured,
    host: config.host || null,
    port: config.port,
    secure: config.secure,
    from: config.fromEmail || null,
    missing: config.missing,
  };
}

function assertHeaderValue(value, label) {
  if (/[\r\n]/.test(String(value ?? ""))) {
    throw new Error(`${label} contains an invalid line break.`);
  }
}

function encodeHeader(value) {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function wrapBase64(buffer) {
  return buffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function addressHeader(name, email) {
  const cleanName = String(name ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!cleanName) return `<${email}>`;
  return `${encodeHeader(cleanName)} <${email}>`;
}

export function composeMimeMessage({ fromName, fromEmail, to, subject, html, text, replyTo }) {
  assertHeaderValue(to, "Recipient");
  assertHeaderValue(subject, "Subject");
  assertHeaderValue(fromEmail, "Sender");
  const boundary = `vulture_${crypto.randomBytes(12).toString("hex")}`;
  const plain = text || plainTextFromHtml(html);
  const messageId = `<${crypto.randomBytes(12).toString("hex")}@vulture-review-desk>`;
  const lines = [
    `From: ${addressHeader(fromName, fromEmail)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(plain, "utf8")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(html, "utf8")),
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n").replace(/\r\n\./g, "\r\n..");
}

function createLineReader(socket) {
  let buffer = "";
  let queue = [];
  let pending = null;

  function tryResolve() {
    if (!pending) return;
    const index = queue.findIndex((line) => /^\d{3} /.test(line));
    if (index < 0) return;
    const lines = queue.slice(0, index + 1);
    queue = queue.slice(index + 1);
    const finalLine = lines[lines.length - 1];
    const result = { code: Number(finalLine.slice(0, 3)), text: lines.join("\n") };
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    current.resolve(result);
  }

  function onData(chunk) {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      let line = buffer.slice(0, newline);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      queue.push(line);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    tryResolve();
  }

  socket.on("data", onData);
  socket.on("error", (error) => {
    if (pending) {
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.reject(error);
    }
  });

  return {
    read(timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending = null;
          reject(new Error("The mail server stopped responding."));
        }, timeoutMs);
        pending = { resolve, reject, timer };
        tryResolve();
      });
    },
    detach() {
      socket.off("data", onData);
    },
  };
}

function connect(config) {
  return new Promise((resolve, reject) => {
    const options = { host: config.host, port: config.port };
    const socket = config.secure
      ? tls.connect({
          ...options,
          servername: config.host,
          rejectUnauthorized: config.rejectUnauthorized,
        })
      : net.connect(options);

    socket.setTimeout(30000, () => {
      socket.destroy();
      reject(new Error("The connection to the mail server timed out."));
    });
    socket.once("error", reject);
    socket.once(config.secure ? "secureConnect" : "connect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
  });
}

async function upgradeTls(socket, config) {
  const secureSocket = tls.connect({
    socket,
    servername: config.host,
    rejectUnauthorized: config.rejectUnauthorized,
  });
  await new Promise((resolve, reject) => {
    secureSocket.once("secureConnect", resolve);
    secureSocket.once("error", reject);
  });
  return secureSocket;
}

async function readExpected(reader, expected, label) {
  const reply = await reader.read();
  if (!expected.includes(reply.code)) {
    throw new Error(`${label} failed: ${reply.text}`);
  }
  return reply;
}

async function smtpSend(config, { fromName, fromEmail, to, subject, html, text, replyTo }) {
  let socket = await connect(config);
  let reader = createLineReader(socket);
  let capabilities = "";

  const command = async (line, expected, label = line.split(" ")[0]) => {
    socket.write(`${line}\r\n`);
    return readExpected(reader, expected, label);
  };

  try {
    await readExpected(reader, [220], "Server greeting");

    let hello = await command(`EHLO ${os.hostname().replace(/[^a-z0-9.-]/gi, "") || "localhost"}`, [250], "EHLO");
    capabilities = hello.text;

    if (!config.secure && /STARTTLS/i.test(capabilities)) {
      await command("STARTTLS", [220], "STARTTLS");
      reader.detach();
      socket = await upgradeTls(socket, config);
      reader = createLineReader(socket);
      hello = await command(`EHLO ${os.hostname().replace(/[^a-z0-9.-]/gi, "") || "localhost"}`, [250], "EHLO after STARTTLS");
      capabilities = hello.text;
    }

    if (config.user) {
      const authLine = capabilities
        .split("\n")
        .find((line) => /AUTH/i.test(line));
      const mechanisms = authLine ? authLine.toUpperCase() : "";
      if (mechanisms.includes("LOGIN") || !mechanisms.includes("PLAIN")) {
        await command("AUTH LOGIN", [334], "AUTH LOGIN");
        await command(Buffer.from(config.user, "utf8").toString("base64"), [334], "SMTP username");
        await command(Buffer.from(config.pass, "utf8").toString("base64"), [235], "SMTP password");
      } else {
        const token = Buffer.from(`\u0000${config.user}\u0000${config.pass}`, "utf8").toString("base64");
        await command(`AUTH PLAIN ${token}`, [235], "AUTH PLAIN");
      }
    }

    await command(`MAIL FROM:<${fromEmail}>`, [250], "MAIL FROM");
    await command(`RCPT TO:<${to}>`, [250, 251], "RCPT TO");
    await command("DATA", [354], "DATA");

    const message = composeMimeMessage({ fromName, fromEmail, to, subject, html, text, replyTo });
    socket.write(`${message}\r\n.\r\n`);
    await readExpected(reader, [250], "Message delivery");
    socket.write("QUIT\r\n");
    await readExpected(reader, [221], "QUIT").catch(() => {});
    return { messageId: crypto.randomBytes(12).toString("hex") };
  } finally {
    reader.detach();
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref?.();
  }
}

async function recordEmail(record) {
  return mutateDb((db) => {
    db.emails.unshift(record);
    db.emails = db.emails.slice(0, 300);
    return record;
  });
}

export async function deliverEmail({ student, type, subject, html, text, settings, intendedTo, fromName }) {
  const intended = normalizeEmail(intendedTo || student?.email);
  const delivered = normalizeEmail(settings.testMode ? settings.testEmail : intended);
  if (!isValidEmail(delivered)) {
    throw new Error("The delivery email address is not valid. Check the test email in Settings.");
  }

  const config = mailConfig();
  const record = {
    id: randomId("mail"),
    studentId: student?.id ?? null,
    studentName: student?.name ?? "",
    type,
    intendedTo: intended,
    deliveredTo: delivered,
    subject,
    html,
    text: text || plainTextFromHtml(html),
    status: "failed",
    provider: config.configured ? "smtp" : "outbox",
    error: null,
    testMode: Boolean(settings.testMode),
    createdAt: new Date().toISOString(),
  };

  if (!config.configured) {
    record.status = "simulated";
    record.error = "SMTP is not configured; the message is stored in the outbox.";
    return recordEmail(record);
  }

  try {
    await smtpSend(config, {
      fromName: fromName || config.fromName,
      fromEmail: config.fromEmail,
      to: delivered,
      subject,
      html,
      text: record.text,
      replyTo: config.replyTo ? config.replyTo : undefined,
    });
    record.status = "sent";
  } catch (error) {
    record.status = "failed";
    record.error = error.message;
  }

  return recordEmail(record);
}

export async function sendTestEmail(settings, origin) {
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const html = `<!doctype html><html><body style="margin:0;background:#f2ede1;font-family:Arial,sans-serif;color:#171a16;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#fbf8f0;border:1px solid #d8d0bf;border-radius:16px;overflow:hidden">
      <div style="background:#26352a;color:#f2ede1;padding:24px 28px">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c9502b">Vulture Management Wings</div>
        <h1 style="font-size:28px;margin:8px 0 0">Mail connection check</h1>
      </div>
      <div style="padding:28px">
        <p style="margin:0 0 16px">This is a test from the Intern Review Desk.</p>
        <p style="margin:0 0 8px;font-size:14px"><strong>Test mode:</strong> ${settings.testMode ? "on" : "off"}</p>
        <p style="margin:0 0 8px;font-size:14px"><strong>Delivery address:</strong> ${settings.testMode ? settings.testEmail : "the intern's address"}</p>
        <p style="margin:0;font-size:14px;color:#6c7065">Generated ${now} IST.</p>
      </div>
    </div>
  </body></html>`;

  const record = await deliverEmail({
    student: { id: null, name: "Mail connection check", email: settings.testEmail },
    type: "test",
    subject: `${settings.testMode ? "[TEST] " : ""}Vulture review desk · mail connection check`,
    html,
    text: `Vulture review desk mail connection check. Test mode: ${settings.testMode ? "on" : "off"}. Review room: ${origin || "local"}`,
    settings,
    intendedTo: settings.testEmail,
  });

  return record;
}

export function emailRecordView(record, { includeHtml = false } = {}) {
  if (!record) return null;
  return {
    id: record.id,
    studentId: record.studentId,
    studentName: record.studentName,
    type: record.type,
    intendedTo: record.intendedTo,
    deliveredTo: record.deliveredTo,
    subject: record.subject,
    status: record.status,
    provider: record.provider,
    error: record.error,
    testMode: record.testMode,
    createdAt: record.createdAt,
    preview: String(record.text ?? "").replace(/\s+/g, " ").slice(0, 220),
    ...(includeHtml ? { html: record.html, text: record.text } : {}),
  };
}


