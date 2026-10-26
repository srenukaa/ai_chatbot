import { mutateDb, readDb } from "./db.js";
import { parseSpreadsheet } from "./excel.js";
import { extractDocument } from "./docx.js";
import { fetchGithubEvidence } from "./github.js";
import { publicPlaybook, resolvePlaybook } from "./playbooks.js";
import { analyzeSubmission } from "./analyze.js";
import { mentorIntro } from "./ai.js";
import { buildDebriefEmail, buildInviteEmail } from "./emails.js";
import { deliverEmail } from "./mailer.js";
import {
  buildStudent,
  meetLinkFor,
  publicStudent,
  studentDTO,
  submissionSummary,
  sessionCode,
} from "./students.js";
import {
  formatDateTimeShort,
  nextReviewSchedule,
  nextWeekdayAt,
  parseFlexibleDate,
} from "./dates.js";
import { normalizeEmail, parseGithubUrl, safeHttpsUrl, truncate, wordCount } from "./util.js";

function validReviewDate(value, fallback) {
  const raw = typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  const parsed = parseFlexibleDate(raw, fallback);
  if (!parsed) return fallback;
  if (parsed.getTime() < Date.now() + 5 * 60 * 1000) return fallback;
  return parsed;
}

function importBaseDate() {
  return nextWeekdayAt({ hour: 10, minute: 0, minimumDays: 1 });
}

function proposedReviewDate(row, index, base) {
  const fallback = new Date(base.getTime() + index * 30 * 60 * 1000);
  return validReviewDate(row.reviewDateRaw, fallback);
}

function rowMeetLink(row, settings) {
  const configured = safeHttpsUrl(row.meetLinkRaw);
  if (configured) return { meetLink: configured, generated: false };
  return meetLinkFor(settings);
}

function findStudent(db, email) {
  const normalized = normalizeEmail(email);
  return db.students.find((student) => normalizeEmail(student.email) === normalized);
}

function findStudentByToken(db, token) {
  return db.students.find((student) => student.token === token);
}

function findStudentById(db, id) {
  return db.students.find((student) => student.id === id);
}

export async function previewImport({ filename, buffer }) {
  const parsed = parseSpreadsheet({ filename, buffer });
  const db = await readDb();
  const base = importBaseDate();
  const rows = parsed.rows.map((row, index) => {
    const existing = row.email ? findStudent(db, row.email) : null;
    const proposed = proposedReviewDate(row, index, base);
    const playbook = resolvePlaybook(row.projectTitle || existing?.projectTitle || "");
    const meet = rowMeetLink(row, db.settings);
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      email: row.email,
      projectTitle: row.projectTitle,
      reviewDate: proposed.toISOString(),
      reviewDateLabel: formatDateTimeShort(proposed),
      meetLink: meet.meetLink,
      meetLinkGenerated: meet.generated,
      projectBadge: playbook.badge,
      action: existing ? "update" : "new",
      existingStatus: existing?.status ?? null,
      existingStatusLabel: existing ? studentDTO(existing).statusLabel : null,
      issues: row.issues,
    };
  });

  return {
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => !row.issues.length).length,
      invalid: rows.filter((row) => row.issues.length).length,
      newStudents: rows.filter((row) => !row.issues.length && row.action === "new").length,
      updates: rows.filter((row) => !row.issues.length && row.action === "update").length,
    },
    testMode: db.settings.testMode,
    testEmail: db.settings.testEmail,
  };
}

export async function importRoster({ filename, buffer, sendInvites, origin }) {
  const parsed = parseSpreadsheet({ filename, buffer });
  if (!parsed.validRows.length) {
    return {
      imported: 0,
      updated: 0,
      invited: 0,
      skipped: parsed.invalidRows.length,
      rows: [],
      invites: [],
      message: "No valid rows were found. Fix the highlighted rows and try again.",
    };
  }

  const base = importBaseDate();
  const validRows = parsed.rows
    .map((row, index) => ({ ...row, proposedDate: proposedReviewDate(row, index, base) }))
    .filter((row) => !row.issues.length);

  const result = await mutateDb((db) => {
    const settings = db.settings;
    const created = [];
    const updated = [];
    const targets = [];

    for (const row of validRows) {
      const existing = findStudent(db, row.email);
      if (existing) {
        existing.name = row.name || existing.name;
        if (row.projectTitle) {
          existing.projectTitle = row.projectTitle;
          existing.projectKey = resolvePlaybook(row.projectTitle).key;
        }
        if (row.reviewDateRaw) {
          existing.reviewDate = validReviewDate(row.reviewDateRaw, new Date(existing.reviewDate)).toISOString();
        }
        const meet = safeHttpsUrl(row.meetLinkRaw);
        if (meet) {
          existing.meetLink = meet;
          existing.meetLinkGenerated = false;
        }
        updated.push(existing);
        if (sendInvites && (existing.status === "queued" || !existing.invitedAt)) {
          targets.push({ id: existing.id, name: existing.name, email: existing.email });
        }
      } else {
        const student = buildStudent({
          name: row.name,
          email: row.email,
          projectTitle: row.projectTitle,
          reviewDate: row.proposedDate,
          settings,
        });
        const meet = rowMeetLink(row, settings);
        student.meetLink = meet.meetLink;
        student.meetLinkGenerated = meet.generated;
        db.students.push(student);
        created.push(student);
        if (sendInvites) {
          targets.push({ id: student.id, name: student.name, email: student.email });
        }
      }
    }

    return {
      imported: created.length,
      updated: updated.length,
      skipped: parsed.rows.length - validRows.length,
      rows: [...created, ...updated].map((student) => studentDTO(student)),
      targetIds: targets.map((target) => target.id),
      targets,
    };
  });

  const invites = [];
  for (const target of result.targets) {
    try {
      const invite = await sendInvite(target.id, { origin });
      invites.push({
        studentId: target.id,
        name: target.name,
        email: target.email,
        ok: invite.email.status === "sent" || invite.email.status === "simulated",
        deliveryStatus: invite.email.status,
        deliveredTo: invite.email.deliveredTo,
        error: invite.email.error,
      });
    } catch (error) {
      invites.push({
        studentId: target.id,
        name: target.name,
        email: target.email,
        ok: false,
        deliveryStatus: "failed",
        error: error.message,
      });
    }
  }

  return {
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    invited: invites.filter((invite) => invite.ok).length,
    rows: result.rows,
    invites,
    message: `Imported ${result.imported} new intern${result.imported === 1 ? "" : "s"} and updated ${result.updated}.`,
  };
}

export async function sendInvite(studentId, { origin }) {
  const db = await readDb();
  const student = findStudentById(db, studentId);
  if (!student) throw Object.assign(new Error("That intern was not found."), { status: 404 });
  if (["submitted", "analyzed", "debriefed"].includes(student.status)) {
    throw Object.assign(
      new Error("This intern has already submitted work. Open the review room instead of resending the invite."),
      { status: 409 },
    );
  }

  const settings = db.settings;
  const playbook = resolvePlaybook(student.projectTitle);
  const email = buildInviteEmail({ student, playbook, settings, origin });
  const record = await deliverEmail({
    student,
    type: "invite",
    subject: email.subject,
    html: email.html,
    text: email.text,
    settings,
    intendedTo: student.email,
    fromName: settings.senderName,
  });

  let updatedStudent = student;
  if (record.status === "sent" || record.status === "simulated") {
    updatedStudent = await mutateDb((database) => {
      const target = findStudentById(database, studentId);
      target.invitedAt = new Date().toISOString();
      target.invitedEmailId = record.id;
      target.inviteEmail = {
        id: record.id,
        status: record.status,
        deliveredTo: record.deliveredTo,
        createdAt: record.createdAt,
      };
      if (target.status === "queued") target.status = "invited";
      return target;
    });
  }

  return {
    email: {
      id: record.id,
      status: record.status,
      provider: record.provider,
      deliveredTo: record.deliveredTo,
      intendedTo: record.intendedTo,
      error: record.error,
      subject: record.subject,
      createdAt: record.createdAt,
    },
    student: studentDTO(updatedStudent, origin),
    testMode: settings.testMode,
  };
}

export async function sendInviteAll({ origin }) {
  const db = await readDb();
  const queued = db.students.filter((student) => student.status === "queued");
  const results = [];
  for (const student of queued) {
    try {
      const result = await sendInvite(student.id, { origin });
      results.push({
        id: student.id,
        name: student.name,
        ok: result.email.status === "sent" || result.email.status === "simulated",
        status: result.email.status,
        error: result.email.error,
      });
    } catch (error) {
      results.push({ id: student.id, name: student.name, ok: false, status: "failed", error: error.message });
    }
  }
  return {
    total: queued.length,
    sent: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

export async function sendDebrief(studentId, { origin }) {
  const db = await readDb();
  const student = findStudentById(db, studentId);
  if (!student) throw Object.assign(new Error("That intern was not found."), { status: 404 });
  if (!student.analysis) {
    throw Object.assign(new Error("Run the project review before sending a debrief."), { status: 400 });
  }

  const settings = db.settings;
  const playbook = resolvePlaybook(student.projectTitle);
  let nextReviewDate = student.nextReviewDate ? new Date(student.nextReviewDate) : nextReviewSchedule(settings);
  if (Number.isNaN(nextReviewDate.getTime())) nextReviewDate = nextReviewSchedule(settings);

  let nextMeetLink = student.nextMeetLink;
  let nextMeetLinkGenerated = student.nextMeetLinkGenerated;
  if (!nextMeetLink) {
    const meet = meetLinkFor(settings);
    nextMeetLink = meet.meetLink;
    nextMeetLinkGenerated = meet.generated;
  }

  const emailStudent = {
    ...student,
    nextReviewDate: nextReviewDate.toISOString(),
    nextMeetLink,
    nextMeetLinkGenerated,
  };

  const email = buildDebriefEmail({
    student: emailStudent,
    playbook,
    analysis: student.analysis,
    settings,
    origin,
    nextReviewDate,
    nextMeetLink,
  });

  const record = await deliverEmail({
    student,
    type: "debrief",
    subject: email.subject,
    html: email.html,
    text: email.text,
    settings,
    intendedTo: student.email,
    fromName: settings.senderName,
  });

  const delivered = record.status === "sent" || record.status === "simulated";
  const updatedStudent = await mutateDb((database) => {
    const target = findStudentById(database, studentId);
    target.nextReviewDate = nextReviewDate.toISOString();
    target.nextMeetLink = nextMeetLink;
    target.nextMeetLinkGenerated = Boolean(nextMeetLinkGenerated);
    target.debriefEmail = {
      id: record.id,
      status: record.status,
      deliveredTo: record.deliveredTo,
      createdAt: record.createdAt,
      provider: record.provider,
      error: record.error,
    };
    if (delivered) {
      target.status = "debriefed";
      target.debriefedAt = new Date().toISOString();
      target.debriefEmailId = record.id;
    }
    return target;
  });

  return {
    email: {
      id: record.id,
      status: record.status,
      provider: record.provider,
      deliveredTo: record.deliveredTo,
      intendedTo: record.intendedTo,
      error: record.error,
      subject: record.subject,
      createdAt: record.createdAt,
    },
    student: studentDTO(updatedStudent, origin),
    testMode: settings.testMode,
    nextReviewDate: nextReviewDate.toISOString(),
    nextReviewLabel: formatDateTimeShort(nextReviewDate),
    nextMeetLink,
  };
}

export async function submitWork({ token, githubUrl, docName, docBase64, notes }) {
  const db = await readDb();
  const student = findStudentByToken(db, token);
  if (!student) throw Object.assign(new Error("This review link is not valid."), { status: 404 });
  if (student.status === "debriefed" || student.analysis) {
    throw Object.assign(
      new Error("This review already has a debrief. Contact your coordinator if you need a re-review."),
      { status: 409 },
    );
  }

  const warnings = [];
  let github = null;
  const cleanGithubUrl = String(githubUrl ?? "").trim();
  if (cleanGithubUrl) {
    if (!parseGithubUrl(cleanGithubUrl)) {
      throw Object.assign(
        new Error("Enter a full GitHub repository URL, for example https://github.com/owner/repo."),
        { status: 400 },
      );
    }
    try {
      github = await fetchGithubEvidence(cleanGithubUrl);
      warnings.push(...(github.warnings ?? []));
    } catch (error) {
      warnings.push(`GitHub could not be read: ${error.message}`);
    }
  }

  let document = null;
  if (docBase64 && docName) {
    let buffer;
    try {
      buffer = Buffer.from(String(docBase64), "base64");
    } catch {
      throw Object.assign(new Error("The document upload could not be decoded."), { status: 400 });
    }
    if (buffer.length > 15 * 1024 * 1024) {
      throw Object.assign(new Error("The document is too large. The limit is 15 MB."), { status: 413 });
    }
    document = extractDocument({ filename: docName, buffer });
  } else if (docBase64) {
    throw Object.assign(new Error("The uploaded document is missing its filename."), { status: 400 });
  }

  const cleanNotes = truncate(String(notes ?? "").trim(), 8000);
  if (!github && !document && wordCount(cleanNotes) < 15) {
    throw Object.assign(
      new Error("Add a GitHub link, upload a DOCX, or write at least a few notes about what you built."),
      { status: 400 },
    );
  }

  const submission = {
    githubUrl: cleanGithubUrl,
    github,
    docName: document ? docName : "",
    docText: document ? document.text : "",
    docWordCount: document ? document.wordCount : 0,
    notes: cleanNotes,
    submittedAt: new Date().toISOString(),
    warnings,
  };

  const updated = await mutateDb((database) => {
    const target = findStudentByToken(database, token);
    target.submission = submission;
    target.submittedAt = submission.submittedAt;
    target.status = "submitted";
    target.analysis = null;
    target.analyzedAt = null;
    target.debriefedAt = null;
    return target;
  });

  return {
    submission: submissionSummary(submission),
    student: publicStudent(updated),
    warnings,
  };
}

export async function analyzeStudent(studentId, { origin, force = false }) {
  const db = await readDb();
  const student = findStudentById(db, studentId);
  if (!student) throw Object.assign(new Error("That intern was not found."), { status: 404 });
  if (!student.submission) {
    throw Object.assign(new Error("There is no submitted work to review yet."), { status: 400 });
  }

  if (student.analysis && !force) {
    let emailResult = null;
    if (db.settings.autoSendDebrief && student.status !== "debriefed") {
      emailResult = await sendDebrief(student.id, { origin });
    }
    return {
      analysis: student.analysis,
      student: studentDTO(student, origin),
      email: emailResult?.email ?? null,
      alreadyReviewed: true,
    };
  }

  const playbook = resolvePlaybook(student.projectTitle);
  const analysis = await analyzeSubmission({ student, playbook, submission: student.submission });

  await mutateDb((database) => {
    const target = findStudentById(database, studentId);
    target.analysis = analysis;
    target.analyzedAt = analysis.generatedAt;
    target.status = "analyzed";
    return target;
  });

  let emailResult = null;
  if (db.settings.autoSendDebrief) {
    emailResult = await sendDebrief(studentId, { origin });
  }

  const refreshed = await readDb();
  const updated = findStudentById(refreshed, studentId);
  return {
    analysis,
    student: studentDTO(updated, origin),
    email: emailResult?.email ?? null,
    emailError: emailResult?.email?.status === "failed" ? emailResult.email.error : null,
    nextReviewDate: emailResult?.nextReviewDate ?? updated.nextReviewDate,
    alreadyReviewed: false,
  };
}

export async function getReviewSession(token) {
  const db = await readDb();
  const student = findStudentByToken(db, token);
  if (!student) return null;
  const playbook = publicPlaybook(resolvePlaybook(student.projectTitle));
  const settings = {
    companyName: db.settings.companyName,
    senderName: db.settings.senderName,
    reviewDurationMinutes: db.settings.reviewDurationMinutes,
    autoSendDebrief: db.settings.autoSendDebrief,
  };
  const session = publicStudent(student);
  return {
    student: session,
    playbook,
    settings,
    sessionCode: sessionCode(student),
    intro: mentorIntro(session, playbook, settings),
  };
}

export async function getBootstrap(origin) {
  const db = await readDb();
  const students = db.students
    .slice()
    .sort((left, right) => new Date(left.reviewDate) - new Date(right.reviewDate));
  const counts = {
    total: students.length,
    queued: students.filter((student) => student.status === "queued").length,
    invited: students.filter((student) => student.status === "invited").length,
    submitted: students.filter((student) => student.status === "submitted").length,
    analyzed: students.filter((student) => student.status === "analyzed").length,
    debriefed: students.filter((student) => student.status === "debriefed").length,
  };
  const upcoming = students
    .filter((student) => new Date(student.reviewDate).getTime() > Date.now() - 12 * 60 * 60 * 1000 || student.status !== "debriefed")
    .slice(0, 5)
    .map((student) => studentDTO(student, origin));
  const recentEmails = db.emails.slice(0, 6).map((record) => ({
    id: record.id,
    type: record.type,
    subject: record.subject,
    studentName: record.studentName,
    intendedTo: record.intendedTo,
    deliveredTo: record.deliveredTo,
    status: record.status,
    createdAt: record.createdAt,
  }));

  return {
    settings: db.settings,
    stats: counts,
    students: students.map((student) => studentDTO(student, origin)),
    upcoming,
    recentEmails,
    testMode: db.settings.testMode,
    testEmail: db.settings.testEmail,
  };
}

export async function listStudents(origin) {
  const db = await readDb();
  return db.students
    .slice()
    .sort((left, right) => new Date(left.reviewDate) - new Date(right.reviewDate))
    .map((student) => studentDTO(student, origin));
}

export async function updateStudent(studentId, patch, origin) {
  const updated = await mutateDb((db) => {
    const student = findStudentById(db, studentId);
    if (!student) throw Object.assign(new Error("That intern was not found."), { status: 404 });
    if (patch.name) student.name = String(patch.name).trim();
    if (patch.email) student.email = normalizeEmail(patch.email);
    if (patch.projectTitle) {
      student.projectTitle = String(patch.projectTitle).trim();
      student.projectKey = resolvePlaybook(student.projectTitle).key;
    }
    if (patch.reviewDate !== undefined) {
      const date = validReviewDate(patch.reviewDate, new Date(student.reviewDate));
      student.reviewDate = date.toISOString();
    }
    if (patch.meetLink !== undefined) {
      const link = safeHttpsUrl(patch.meetLink);
      if (link) {
        student.meetLink = link;
        student.meetLinkGenerated = false;
      } else if (!String(patch.meetLink || "").trim()) {
        const meet = meetLinkFor(db.settings);
        student.meetLink = meet.meetLink;
        student.meetLinkGenerated = meet.generated;
      }
    }
    return student;
  });
  return studentDTO(updated, origin);
}

export async function getStudent(studentId, origin) {
  const db = await readDb();
  const student = findStudentById(db, studentId);
  if (!student) throw Object.assign(new Error("That intern was not found."), { status: 404 });
  return studentDTO(student, origin);
}

export async function getOutbox({ type = "", limit = 80 } = {}) {
  const db = await readDb();
  return db.emails
    .filter((record) => !type || record.type === type)
    .slice(0, limit)
    .map((record) => ({
      id: record.id,
      type: record.type,
      subject: record.subject,
      studentName: record.studentName,
      intendedTo: record.intendedTo,
      deliveredTo: record.deliveredTo,
      status: record.status,
      provider: record.provider,
      error: record.error,
      testMode: record.testMode,
      createdAt: record.createdAt,
      preview: String(record.text ?? "").replace(/\s+/g, " ").slice(0, 200),
    }));
}

export async function getEmail(emailId) {
  const db = await readDb();
  const record = db.emails.find((email) => email.id === emailId);
  if (!record) throw Object.assign(new Error("That email was not found."), { status: 404 });
  return record;
}
