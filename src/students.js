import { randomId, randomMeetCode, randomToken, safeHttpsUrl } from "./util.js";
import { resolvePlaybook } from "./playbooks.js";
import { formatDateShort, formatDateTimeShort, formatDayParts, formatTime, relativeDayLabel, scheduleReview } from "./dates.js";
import { STATUS_LABELS } from "./defaults.js";

export function meetLinkFor(settings) {
  const configured = safeHttpsUrl(settings?.defaultMeetLink);
  if (configured) return { meetLink: configured, generated: false };
  return { meetLink: `https://meet.google.com/${randomMeetCode()}`, generated: true };
}

export function buildStudent({ name, email, projectTitle, reviewDate, settings, minuteOffset = 0 }) {
  const cleanName = String(name ?? "").trim();
  const cleanTitle = String(projectTitle ?? "").trim();
  const playbook = resolvePlaybook(cleanTitle);
  const date =
    reviewDate ??
    scheduleReview({
      minimumDays: 1,
      minute: Math.min(59, Math.max(0, minuteOffset)),
    });
  const meet = meetLinkFor(settings);

  return {
    id: randomId("stu"),
    token: randomToken(18),
    name: cleanName,
    email: String(email ?? "").trim().toLowerCase(),
    projectTitle: cleanTitle,
    projectKey: playbook.key,
    reviewDate: date.toISOString(),
    meetLink: meet.meetLink,
    meetLinkGenerated: meet.generated,
    status: "queued",
    createdAt: new Date().toISOString(),
    invitedAt: null,
    submittedAt: null,
    analyzedAt: null,
    debriefedAt: null,
    nextReviewDate: null,
    nextMeetLink: null,
    nextMeetLinkGenerated: null,
    submission: null,
    analysis: null,
    invitedEmailId: null,
    debriefEmailId: null,
  };
}

export function sessionCode(student) {
  const source = String(student?.token ?? student?.id ?? "000000");
  return source.replace(/[-_]/g, "").slice(0, 6).toUpperCase();
}

export function submissionSummary(submission) {
  if (!submission) return null;
  return {
    githubUrl: submission.githubUrl || "",
    githubRepo: submission.github?.repo?.fullName || "",
    githubLanguage: submission.github?.repo?.language || "",
    githubStars: submission.github?.repo?.stars ?? null,
    githubFiles: submission.github?.fileCount ?? null,
    githubHasReadme: Boolean(submission.github?.flags?.hasReadme),
    docName: submission.docName || "",
    docWordCount: submission.docWordCount || 0,
    notesWords: submission.notes ? submission.notes.trim().split(/\s+/).filter(Boolean).length : 0,
    submittedAt: submission.submittedAt || null,
    warnings: Array.isArray(submission.warnings) ? submission.warnings : [],
  };
}

export function analysisSummary(analysis) {
  if (!analysis) return null;
  return {
    score: analysis.score,
    verdict: analysis.verdict,
    generatedBy: analysis.generatedBy,
    generatedAt: analysis.generatedAt,
    nextReviewFocus: analysis.nextReviewFocus ?? [],
  };
}

export function studentDTO(student, origin = "") {
  const playbook = resolvePlaybook(student.projectTitle);
  const day = formatDayParts(student.reviewDate);
  return {
    id: student.id,
    token: student.token,
    roomUrl: origin ? `${origin}/review/${student.token}` : `/review/${student.token}`,
    name: student.name,
    email: student.email,
    projectTitle: student.projectTitle,
    projectKey: student.projectKey,
    projectBadge: playbook.badge,
    reviewDate: student.reviewDate,
    reviewDateTimeLabel: formatDateTimeShort(student.reviewDate),
    reviewDateLabel: formatDateShort(student.reviewDate),
    reviewTimeLabel: formatTime(student.reviewDate),
    reviewRelative: relativeDayLabel(student.reviewDate),
    reviewDay: day,
    meetLink: student.meetLink,
    meetLinkGenerated: Boolean(student.meetLinkGenerated),
    status: student.status,
    statusLabel: STATUS_LABELS[student.status] ?? student.status,
    createdAt: student.createdAt,
    invitedAt: student.invitedAt,
    submittedAt: student.submittedAt,
    analyzedAt: student.analyzedAt,
    debriefedAt: student.debriefedAt,
    nextReviewDate: student.nextReviewDate,
    nextReviewLabel: student.nextReviewDate ? formatDateTimeShort(student.nextReviewDate) : null,
    nextMeetLink: student.nextMeetLink,
    submission: submissionSummary(student.submission),
    analysis: analysisSummary(student.analysis),
    inviteEmail: student.inviteEmail ?? null,
    debriefEmail: student.debriefEmail ?? null,
    sessionCode: sessionCode(student),
  };
}

export function publicStudent(student) {
  const playbook = resolvePlaybook(student.projectTitle);
  return {
    name: student.name,
    projectTitle: student.projectTitle,
    projectBadge: playbook.badge,
    reviewDate: student.reviewDate,
    reviewDateTimeLabel: formatDateTimeShort(student.reviewDate),
    reviewDateLabel: formatDateShort(student.reviewDate),
    meetLink: student.meetLink,
    meetLinkGenerated: Boolean(student.meetLinkGenerated),
    status: student.status,
    statusLabel: STATUS_LABELS[student.status] ?? student.status,
    sessionCode: sessionCode(student),
    submittedAt: student.submittedAt,
    analyzedAt: student.analyzedAt,
    debriefedAt: student.debriefedAt,
    nextReviewDate: student.nextReviewDate,
    nextReviewLabel: student.nextReviewDate ? formatDateTimeShort(student.nextReviewDate) : null,
    nextMeetLink: student.nextMeetLink,
    submission: submissionSummary(student.submission),
    analysis: student.analysis,
    analysisSummary: analysisSummary(student.analysis),
    invitedAt: student.invitedAt,
    inviteEmail: student.inviteEmail ?? null,
    debriefEmail: student.debriefEmail ?? null,
  };
}

export function reviewEmailSummary(student) {
  if (!student?.debriefEmail) return null;
  return student.debriefEmail;
}
