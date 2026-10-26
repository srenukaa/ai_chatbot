import { escapeHtml, plainTextFromHtml, safeHttpsUrl } from "./util.js";
import { formatDateTimeLong, formatDateShort, formatTime } from "./dates.js";

const COLORS = {
  bone: "#f2ede1",
  paper: "#fbf8f0",
  ink: "#171a16",
  moss: "#26352a",
  rust: "#c9502b",
  rustDark: "#9e3a1d",
  line: "#d8d0bf",
  muted: "#6c7065",
  sage: "#aeb7a3",
};

function h(value) {
  return escapeHtml(value);
}

function testBanner(settings, student) {
  if (!settings.testMode) return "";
  const intended = student?.email ?? "";
  return `<div style="background:${COLORS.rust};color:#fff8ed;padding:12px 26px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6">
    <strong style="letter-spacing:.08em">TEST MODE</strong> &nbsp; Redirected to ${h(
      settings.testEmail,
    )}. This message was intended for ${h(intended || "the intern")}.
  </div>`;
}

function emailShell({ settings, preheader, headerEyebrow, headerTitle, content, settingsForFooter }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(headerTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bone};color:${COLORS.ink};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${h(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bone};padding:28px 14px;">
  <tr>
    <td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:${COLORS.paper};border:1px solid ${COLORS.line};border-radius:14px;overflow:hidden;">
        <tr><td style="padding:0">${testBanner(settings, settingsForFooter.student)}</td></tr>
        <tr>
          <td style="background:${COLORS.moss};padding:24px 30px 22px;border-bottom:4px solid ${COLORS.rust};">
            <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.22em;color:${COLORS.sage};text-transform:uppercase;">${h(
              settings.companyName,
            )}</div>
            <div style="height:10px"></div>
            <div style="font-family:'Arial Black',Arial,sans-serif;font-size:20px;letter-spacing:.06em;color:${COLORS.bone};text-transform:uppercase;">VULTURE <span style="color:${COLORS.rust};font-weight:400">/</span> INTERN REVIEW DESK</div>
            <div style="height:18px"></div>
            <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.16em;color:${COLORS.rust};text-transform:uppercase;">${h(
              headerEyebrow,
            )}</div>
            <div style="font-family:'Arial Black',Arial,sans-serif;font-size:27px;line-height:1.16;color:${COLORS.bone};margin-top:7px;">${h(
              headerTitle,
            )}</div>
          </td>
        </tr>
        <tr><td style="padding:30px">${content}</td></tr>
        <tr>
          <td style="padding:22px 30px 28px;border-top:1px solid ${COLORS.line};background:${COLORS.paper};">
            <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.muted};font-family:Arial,sans-serif;">${h(
              settings.companyName,
            )} · Internship review operations</div>
            <div style="height:8px"></div>
            <div style="font-size:12px;line-height:1.7;color:${COLORS.muted};font-family:Arial,sans-serif;">
              This message was sent from the Vulture review desk. If something looks wrong, reply to your coordinator rather than the automated sender.
            </div>
            ${
              settings.testMode
                ? `<div style="height:10px"></div><div style="font-size:11px;line-height:1.6;color:${COLORS.rustDark};font-family:Arial,sans-serif;"><strong>Test mode:</strong> no student inbox was contacted. The delivery address is ${h(
                    settings.testEmail,
                  )}.</div>`
                : ""
            }
          </td>
        </tr>
      </table>
      <div style="max-width:640px;padding:14px 8px 0;font-size:10px;line-height:1.6;color:${COLORS.muted};font-family:Arial,sans-serif;text-align:center;">
        ${h(settings.companyName)} · Review desk · ${new Date().getFullYear()}
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function button(href, label, { dark = true } = {}) {
  const url = safeHttpsUrl(href) || href;
  return `<a href="${h(url)}" style="display:inline-block;background:${
    dark ? COLORS.moss : COLORS.paper
  };color:${dark ? COLORS.bone : COLORS.ink};border:1px solid ${
    dark ? COLORS.moss : COLORS.line
  };border-radius:7px;padding:13px 20px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.04em;text-decoration:none;">${h(
    label,
  )}</a>`;
}

function infoRow(label, value, { last = false } = {}) {
  return `<tr>
    <td style="padding:11px 0;border-bottom:${last ? "0" : `1px solid ${COLORS.line}`};font-family:Arial,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${COLORS.muted};width:110px;vertical-align:top;">${h(
      label,
    )}</td>
    <td style="padding:11px 0;border-bottom:${last ? "0" : `1px solid ${COLORS.line}`};font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:${COLORS.ink};">${value}</td>
  </tr>`;
}

function sectionLabel(text) {
  return `<div style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${COLORS.rustDark};font-weight:700;">${h(
    text,
  )}</div>`;
}

function listItems(items, { ordered = false } = {}) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag} style="margin:0;padding-left:20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:${COLORS.ink};">${items
    .map((item) => `<li style="padding:3px 0;">${h(item)}</li>`)
    .join("")}</${tag}>`;
}

function referencesBlock(references) {
  return references
    .map((reference) => {
      const url = safeHttpsUrl(reference.url);
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};vertical-align:top;">
          <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:${COLORS.ink};">
            ${url ? `<a href="${h(url)}" style="color:${COLORS.rustDark};text-decoration:underline;">${h(reference.label)}</a>` : h(reference.label)}
          </div>
          <div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:${COLORS.muted};margin-top:3px;">${h(
            reference.note,
          )}</div>
        </td>
      </tr>`;
    })
    .join("");
}

export function buildInviteEmail({ student, playbook, settings, origin }) {
  const roomUrl = `${origin.replace(/\/+$/, "")}/review/${student.token}`;
  const meetUrl = safeHttpsUrl(student.meetLink);
  const subject = `${settings.testMode ? "[TEST] " : ""}Review invite · ${student.name} · ${student.projectTitle}`;
  const duration = Number(settings.reviewDurationMinutes) || 30;
  const dateLong = formatDateTimeLong(student.reviewDate);

  const content = `
    <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:${COLORS.ink};">
      Hello ${h(student.name)},
    </p>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:${COLORS.ink};">
      Your project review is booked. This email has the project brief, the meeting room, the review room and the reference shelf you need before we meet.
    </p>

    <div style="background:${COLORS.moss};border-radius:10px;padding:22px 24px;margin:0 0 24px;">
      <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${COLORS.sage};">Project under review · ${h(
        playbook.badge,
      )}</div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:24px;line-height:1.2;color:${COLORS.bone};margin-top:8px;">${h(
        student.projectTitle,
      )}</div>
      <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:${COLORS.sage};margin-top:9px;">${dateLong} · ${duration} minutes</div>
    </div>

    ${sectionLabel("Session details")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${infoRow("Date", `${h(formatDateShort(student.reviewDate))} · ${h(formatTime(student.reviewDate))} IST`)}
      ${infoRow("Duration", `${duration} minutes`)}
      ${infoRow(
        "Google Meet",
        meetUrl
          ? `<a href="${h(meetUrl)}" style="color:${COLORS.rustDark};text-decoration:underline;">Join the meeting room</a>${
              student.meetLinkGenerated
                ? `<div style="font-size:11px;color:${COLORS.muted};margin-top:4px;">Meeting link assigned by the review desk.</div>`
                : ""
            }`
          : "Your coordinator will share the meeting room.",
      )}
      ${infoRow("Review room", `<a href="${h(roomUrl)}" style="color:${COLORS.rustDark};text-decoration:underline;">Open your personal review room</a>`, { last: true })}
    </table>

    ${
      meetUrl
        ? `<div style="margin:0 0 26px;">${button(meetUrl, "Join Google Meet")} &nbsp; ${button(roomUrl, "Enter review room", { dark: false })}</div>`
        : `<div style="margin:0 0 26px;">${button(roomUrl, "Enter review room")}</div>`
    }

    ${sectionLabel("What we are reviewing")}
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.75;color:${COLORS.ink};">${h(
      playbook.brief,
    )}</p>
    ${
      playbook.clarification
        ? `<div style="background:#f7f1e4;border-left:3px solid ${COLORS.rust};padding:13px 16px;margin:0 0 22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:${COLORS.ink};">${h(
            playbook.clarification,
          )}</div>`
        : ""
    }

    ${sectionLabel("How the session runs")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${playbook.agenda
        .map(
          (item) => `<tr>
            <td style="width:66px;padding:9px 12px 9px 0;vertical-align:top;font-family:Arial,sans-serif;font-size:11px;color:${COLORS.rustDark};white-space:nowrap;">${h(
              item.minutes,
            )} min</td>
            <td style="padding:9px 0;border-bottom:1px solid ${COLORS.line};font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:${COLORS.ink};">
              <strong>${h(item.title)}</strong><br><span style="color:${COLORS.muted}">${h(item.detail)}</span>
            </td>
          </tr>`,
        )
        .join("")}
    </table>

    ${sectionLabel("Bring to the review")}
    <div style="margin:0 0 24px;">${listItems(playbook.deliverables)}</div>

    <div style="background:#f7f1e4;border:1px solid ${COLORS.line};border-radius:9px;padding:18px 20px;margin:0 0 26px;">
      <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.rustDark};font-weight:700;">After the call</div>
      <p style="margin:7px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:${COLORS.ink};">
        Open your review room to submit a GitHub link or upload your DOCX. The desk reviews the work against the rubric, prepares a written debrief and emails the next steps and next review date.
      </p>
      <div style="margin-top:12px;">${button(roomUrl, "Submit work in the review room", { dark: false })}</div>
    </div>

    ${sectionLabel("Reference shelf")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      ${referencesBlock(playbook.references)}
    </table>

    <p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:${COLORS.ink};">See you at the review,</p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:${COLORS.ink};"><strong>${h(
      settings.senderName,
    )}</strong><br><span style="color:${COLORS.muted}">${h(settings.companyName)}</span></p>
  `;

  const html = emailShell({
    settings,
    preheader: `${student.projectTitle} · ${dateLong}. Your review room, Meet link and reference shelf are inside.`,
    headerEyebrow: "Project review invitation",
    headerTitle: "Your review is booked.",
    content,
    settingsForFooter: { student },
  });

  const text = [
    `Hello ${student.name},`,
    "",
    `Your project review for "${student.projectTitle}" is booked for ${dateLong} (${duration} minutes).`,
    meetUrl ? `Google Meet: ${meetUrl}` : "Google Meet: your coordinator will share the room.",
    `Personal review room: ${roomUrl}`,
    "",
    "What we are reviewing:",
    playbook.brief,
    playbook.clarification ? `\nNote: ${playbook.clarification}` : "",
    "",
    "How the session runs:",
    ...playbook.agenda.map((item) => `- ${item.minutes} min — ${item.title}: ${item.detail}`),
    "",
    "Bring to the review:",
    ...playbook.deliverables.map((item) => `- ${item}`),
    "",
    "After the call, submit your GitHub link or DOCX in the review room. You will receive a written debrief with the next steps and next review date.",
    "",
    "Reference shelf:",
    ...playbook.references.map((reference) => `- ${reference.label}: ${reference.url}`),
    "",
    `${settings.senderName}`,
    `${settings.companyName}`,
    settings.testMode ? `\nTest mode: this email was redirected to ${settings.testEmail}. It was intended for ${student.email}.` : "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text, roomUrl, meetUrl };
}

export function buildDebriefEmail({ student, playbook, analysis, settings, origin, nextReviewDate, nextMeetLink }) {
  const roomUrl = `${origin.replace(/\/+$/, "")}/review/${student.token}`;
  const meetUrl = safeHttpsUrl(nextMeetLink || student.meetLink);
  const subject = `${settings.testMode ? "[TEST] " : ""}Project debrief · ${student.name} · ${student.projectTitle}`;
  const nextDate = nextReviewDate ? formatDateTimeLong(nextReviewDate) : "To be scheduled";
  const submission = student.submission;
  const correctionItems = Array.isArray(analysis.corrections) ? analysis.corrections : [];
  const sources = [];
  if (submission?.github?.repo?.fullName) {
    sources.push(`GitHub · ${submission.github.repo.fullName}${submission.github.repo.language ? ` (${submission.github.repo.language})` : ""}`);
  }
  if (submission?.docName) sources.push(`${submission.docName} · ${submission.docWordCount || 0} words`);
  if (submission?.notes) sources.push("Written notes from the review room");

  const content = `
    <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:${COLORS.ink};">Hello ${h(
      student.name,
    )},</p>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:${COLORS.ink};">
      Your work on <strong>${h(student.projectTitle)}</strong> has been reviewed. Here is the debrief: what you built, what needs correcting, what comes next, and when we meet again.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${COLORS.moss};border-radius:10px;">
      <tr>
        <td style="padding:22px 24px;vertical-align:middle;width:118px;">
          <div style="font-family:'Arial Black',Arial,sans-serif;font-size:44px;line-height:1;color:${COLORS.bone};">${h(
            String(analysis.score ?? "—"),
          )}<span style="font-family:Arial,sans-serif;font-size:13px;color:${COLORS.sage};font-weight:400;">/100</span></div>
          <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${COLORS.rust};margin-top:5px;">Review score</div>
        </td>
        <td style="padding:22px 24px 22px 0;vertical-align:middle;border-left:1px solid rgba(242,237,225,.2);">
          <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${COLORS.sage};">Review verdict</div>
          <div style="font-family:'Arial Black',Arial,sans-serif;font-size:20px;line-height:1.25;color:${COLORS.bone};margin-top:6px;">${h(
            analysis.verdict,
          )}</div>
          <div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${COLORS.sage};margin-top:7px;">${h(
            analysis.generatedBy === "ai" ? "AI-assisted review against the project rubric" : "Rubric-based review of the submitted work",
          )}</div>
        </td>
      </tr>
    </table>

    ${
      sources.length
        ? `<div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.7;color:${COLORS.muted};margin:-10px 0 22px;">Reviewed: ${h(
            sources.join(" · "),
          )}</div>`
        : ""
    }

    ${sectionLabel("Summary")}
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.75;color:${COLORS.ink};">${h(
      analysis.summary,
    )}</p>

    ${sectionLabel("What is working")}
    <div style="margin:0 0 24px;">${listItems(analysis.strengths ?? [])}</div>

    ${sectionLabel("What to correct next")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${correctionItems
        .map(
          (item, index) => `<tr>
            <td style="width:28px;padding:10px 0;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;color:${COLORS.rustDark};font-weight:700;">${String(
              index + 1,
            ).padStart(2, "0")}</td>
            <td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};">
              <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.55;color:${COLORS.ink};font-weight:700;">${h(
                item.issue,
              )}</div>
              <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:${COLORS.muted};margin-top:3px;">${h(
                item.fix,
              )}</div>
            </td>
          </tr>`,
        )
        .join("")}
    </table>

    ${sectionLabel("Your next moves")}
    <div style="margin:0 0 24px;">${listItems(analysis.nextSteps ?? [], { ordered: true })}</div>

    ${sectionLabel("Keep in mind")}
    <div style="margin:0 0 26px;">${listItems(analysis.tips ?? [])}</div>

    <div style="background:#f7f1e4;border:1px solid ${COLORS.line};border-radius:9px;padding:20px 22px;margin:0 0 26px;">
      <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${COLORS.rustDark};font-weight:700;">Next review</div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:20px;line-height:1.3;color:${COLORS.ink};margin-top:7px;">${h(
        nextDate,
      )}</div>
      ${
        Array.isArray(analysis.nextReviewFocus) && analysis.nextReviewFocus.length
          ? `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:${COLORS.muted};margin-top:7px;">Focus: ${h(
              analysis.nextReviewFocus.join(" · "),
            )}</div>`
          : ""
      }
      <div style="margin-top:14px;">
        ${meetUrl ? button(meetUrl, "Join next Google Meet") + " " : ""}${button(roomUrl, "Open review room", { dark: !meetUrl })}
      </div>
      ${
        student.nextMeetLinkGenerated || student.meetLinkGenerated
          ? `<div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:${COLORS.muted};margin-top:10px;">Meeting link assigned by the review desk. Your coordinator can update it before the next session.</div>`
          : ""
      }
    </div>

    <p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:${COLORS.ink};">Keep going,</p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:${COLORS.ink};"><strong>${h(
      settings.senderName,
    )}</strong><br><span style="color:${COLORS.muted}">${h(settings.companyName)}</span></p>
  `;

  const html = emailShell({
    settings,
    preheader: `Your debrief for ${student.projectTitle}: ${analysis.score}/100. Corrections, next steps and the next review date are inside.`,
    headerEyebrow: "Project debrief",
    headerTitle: "What you built. What comes next.",
    content,
    settingsForFooter: { student },
  });

  const text = [
    `Hello ${student.name},`,
    "",
    `Your work on "${student.projectTitle}" has been reviewed.`,
    `Score: ${analysis.score}/100 — ${analysis.verdict}`,
    "",
    "Summary:",
    analysis.summary,
    "",
    "What is working:",
    ...(analysis.strengths ?? []).map((item) => `- ${item}`),
    "",
    "What to correct next:",
    ...correctionItems.map((item, index) => `${index + 1}. ${item.issue}\n   Fix: ${item.fix}`),
    "",
    "Your next moves:",
    ...(analysis.nextSteps ?? []).map((item) => `- ${item}`),
    "",
    "Keep in mind:",
    ...(analysis.tips ?? []).map((item) => `- ${item}`),
    "",
    `Next review: ${nextDate}`,
    meetUrl ? `Google Meet: ${meetUrl}` : "",
    `Review room: ${roomUrl}`,
    "",
    `— ${settings.senderName}, ${settings.companyName}`,
    settings.testMode ? `\nTest mode: this email was redirected to ${settings.testEmail}. It was intended for ${student.email}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text, roomUrl, meetUrl };
}
