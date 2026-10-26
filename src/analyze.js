import { aiConfig, generateAnalysisJson } from "./ai.js";
import { clamp, truncate, wordCount } from "./util.js";

function unique(values, limit = 8) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const clean = String(value ?? "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function evidenceDescriptor(submission) {
  const parts = [];
  if (submission?.github?.repo?.fullName) {
    const repo = submission.github.repo;
    const files = submission.github.fileCount ?? 0;
    parts.push(
      `GitHub repository ${repo.fullName}${repo.language ? ` (${repo.language})` : ""} with ${files} files${
        submission.github.flags?.hasReadme ? " and a README" : ""
      }`,
    );
  }
  if (submission?.docName) {
    parts.push(`${submission.docName} (${submission.docWordCount || 0} words)`);
  }
  if (submission?.notes && wordCount(submission.notes) > 0) {
    parts.push(`${wordCount(submission.notes)} words of review notes`);
  }
  return parts.length ? parts.join("; ") : "no readable evidence";
}

function buildEvidenceText(submission) {
  const parts = [];
  if (submission?.github) {
    const github = submission.github;
    const repo = github.repo ?? {};
    parts.push(
      [
        "GITHUB EVIDENCE",
        `Repository: ${repo.fullName ?? ""}`,
        `Description: ${repo.description || "(none)"}`,
        `Primary language: ${repo.language || "(unknown)"}`,
        `Stars: ${repo.stars ?? 0}; forks: ${repo.forks ?? 0}`,
        `Files: ${github.fileCount ?? 0}; code files: ${github.flags?.codeFileCount ?? 0}; test files: ${github.flags?.testFileCount ?? 0}`,
        `Signals: README=${Boolean(github.flags?.hasReadme)}, tests=${Boolean(github.flags?.hasTests)}, requirements=${Boolean(
          github.flags?.hasRequirements,
        )}, Docker=${Boolean(github.flags?.hasDocker)}, CI=${Boolean(github.flags?.hasCI)}, notebooks=${Boolean(
          github.flags?.hasNotebook,
        )}`,
        `File sample: ${(github.files ?? []).slice(0, 160).join(", ")}`,
        "README:",
        github.readme || "(no README)",
      ].join("\n"),
    );
  }
  if (submission?.docText) {
    parts.push(`DOCUMENT: ${submission.docName || "submitted document"}\n${submission.docText}`);
  }
  if (submission?.notes) {
    parts.push(`STUDENT NOTES\n${submission.notes}`);
  }
  return truncate(parts.join("\n\n"), 32000);
}

function evidenceHaystack(submission) {
  const flags = submission?.github?.flags ?? {};
  const signals = [
    flags.hasReadme ? "readme documentation" : "",
    flags.hasTests ? "tests pytest unit test test_" : "",
    flags.hasRequirements ? "requirements.txt environment.yml" : "",
    flags.hasDocker ? "dockerfile" : "",
    flags.hasCI ? "github workflows ci" : "",
    flags.hasNotebook ? "notebook ipynb" : "",
    flags.hasModelFiles ? "model weights .pt .pth .onnx" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    submission?.github?.repo?.description,
    submission?.github?.readme,
    submission?.github?.files?.join(" "),
    submission?.docText,
    submission?.notes,
    signals,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function heuristicAnalysis({ student, playbook, submission }) {
  const haystack = evidenceHaystack(submission);
  const matched = [];
  const missing = [];

  for (const check of playbook.checks) {
    const found = check.patterns.some((pattern) => pattern.test(haystack));
    if (found) matched.push(check);
    else missing.push(check);
  }

  const totalWeight = playbook.checks.reduce((total, check) => total + check.weight, 0) || 1;
  const earned = matched.reduce((total, check) => total + check.weight, 0);
  const flags = submission?.github?.flags ?? {};
  let score = 30 + Math.round((earned / totalWeight) * 60);
  if (flags.codeFileCount > 0) score += 2;
  if (flags.hasTests) score += 2;
  if (flags.hasReadme) score += 2;
  if ((submission?.docWordCount ?? 0) > 1200) score += 2;
  if (wordCount(`${submission?.docText ?? ""} ${submission?.notes ?? ""}`) < 80 && !submission?.github?.readme) {
    score -= 8;
  }
  score = clamp(score, 28, 94);

  const verdict =
    score >= 85
      ? "Ready for the next milestone"
      : score >= 72
        ? "Solid base — focused revision"
        : score >= 58
          ? "Underway — another iteration needed"
          : score >= 45
            ? "Early build — tighten the evidence"
            : "Foundation needs attention";

  const sortedMissing = [...missing].sort((a, b) => b.weight - a.weight);
  const strengths = unique(
    [
      ...matched.map((check) => check.strength),
      ...(submission?.github?.repo?.fullName
        ? ["The GitHub repository gives the reviewer a real file tree and a reproducible place to inspect the work."]
        : []),
      ...(submission?.docName ? ["The written document gives the review a concrete account of the method and decisions."] : []),
      ...(submission?.notes ? ["The notes make the submission inspectable even where code is not linked."] : []),
    ],
    5,
  );

  const corrections = sortedMissing.slice(0, 5).map((check) => ({
    issue: `${check.label}: the submission does not show enough evidence here.`,
    fix: check.fix,
  }));

  if (corrections.length < 3) {
    corrections.push(
      {
        issue: "Evidence is present but not yet easy to verify.",
        fix: "Add exact commands, sample outputs and the test split used for every reported result.",
      },
      {
        issue: "The reviewer has to infer decisions from the code or prose.",
        fix: "Add a short decision log covering data, model, metrics and trade-offs.",
      },
    );
  }

  const nextSteps = unique(
    [
      ...sortedMissing.slice(0, 4).map((check) => check.fix),
      ...playbook.nextSteps,
    ],
    6,
  );

  const focus = sortedMissing.slice(0, 3).map((check) => check.label);
  const descriptor = evidenceDescriptor(submission);
  const strongest = matched.slice(0, 3).map((check) => check.label.toLowerCase());
  const summary = [
    `The submission covers ${descriptor}.`,
    strongest.length
      ? `The strongest evidence is around ${strongest.join(", ")}.`
      : "There is not yet enough project-specific evidence to validate the main claims.",
    sortedMissing.length
      ? `The main gaps are ${sortedMissing
          .slice(0, 3)
          .map((check) => check.label.toLowerCase())
          .join(", ")}.`
      : "The core evidence is present; the next step is refinement and honest limitations.",
  ].join(" ");

  return {
    score,
    verdict,
    summary,
    strengths: strengths.length ? strengths : ["A submission was made, which gives the review something concrete to work with."],
    corrections: corrections.slice(0, 5),
    nextSteps,
    tips: playbook.tips.slice(0, 5),
    nextReviewFocus: focus.length ? focus : playbook.nextReviewFocus,
    generatedBy: "rules",
    generatedAt: new Date().toISOString(),
    evidence: {
      descriptor,
      matched: matched.map((check) => check.id),
      missing: sortedMissing.map((check) => check.id),
    },
  };
}

function normalizeAiAnalysis(value, fallback) {
  if (!value || typeof value !== "object") return null;

  const toStringList = (input, fallbackList = []) => {
    if (!Array.isArray(input)) return fallbackList;
    const cleaned = unique(
      input.map((item) => (typeof item === "string" ? item : item?.text ?? "")),
      8,
    );
    return cleaned.length ? cleaned : fallbackList;
  };

  const corrections = Array.isArray(value.corrections)
    ? value.corrections
        .map((item) => {
          if (typeof item === "string") return { issue: "Correction", fix: item };
          if (!item || typeof item !== "object") return null;
          const issue = String(item.issue ?? item.problem ?? "").trim();
          const fix = String(item.fix ?? item.action ?? "").trim();
          if (!issue && !fix) return null;
          return { issue: issue || "Gap found during review", fix: fix || fallback.corrections[0].fix };
        })
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const scoreValue = Number(value.score);
  const score = Number.isFinite(scoreValue) ? clamp(Math.round(scoreValue), 0, 100) : fallback.score;
  const summary = String(value.summary ?? "").trim();
  const verdict = String(value.verdict ?? "").trim();

  if (!summary || !verdict) return null;

  return {
    score,
    verdict,
    summary,
    strengths: toStringList(value.strengths, fallback.strengths),
    corrections: corrections.length ? corrections : fallback.corrections,
    nextSteps: toStringList(value.nextSteps, fallback.nextSteps),
    tips: toStringList(value.tips, fallback.tips),
    nextReviewFocus: toStringList(value.nextReviewFocus, fallback.nextReviewFocus),
    generatedBy: "ai",
    generatedAt: new Date().toISOString(),
    evidence: fallback.evidence,
  };
}

function analysisPrompt({ student, playbook, submission }) {
  return `Review this internship submission and return JSON only.

STUDENT: ${student.name}
PROJECT: ${student.projectTitle}
SESSION: ${student.reviewDate}

PROJECT BRIEF:
${playbook.brief}
${playbook.clarification ? `\nTECHNICAL CLARIFICATION:\n${playbook.clarification}\n` : ""}
OBJECTIVES:
${playbook.objectives.map((item) => `- ${item}`).join("\n")}

REQUIREMENTS:
${playbook.requirements.map((item) => `- ${item}`).join("\n")}

RUBRIC:
${playbook.rubric.map((item) => `- ${item.criterion} (${item.weight}%): ${item.detail}`).join("\n")}

SUBMISSION EVIDENCE:
${buildEvidenceText(submission)}

Return exactly this JSON shape:
{
  "score": 0-100,
  "verdict": "max 8 words",
  "summary": "2-4 sentences: what they built, what the evidence supports, and the overall assessment",
  "strengths": ["3-5 specific strengths grounded in the evidence"],
  "corrections": [{"issue": "specific problem found", "fix": "specific correction"}],
  "nextSteps": ["4-6 concrete actions in priority order"],
  "tips": ["3-5 practical tips for this project"],
  "nextReviewFocus": ["3-4 short focus areas"]
}

Rules:
- Use only the evidence provided. Do not invent metrics, files or results.
- If something required is absent, say it is absent rather than assuming it exists.
- Be direct and fair. No praise padding. No markdown. No emojis.
- Scores: 90+ exceptional; 75-89 solid with focused gaps; 60-74 needs another iteration; below 60 fundamentals are missing.
- The summary must say what they did and what they still need to do.`;
}

export async function analyzeSubmission({ student, playbook, submission }) {
  const fallback = heuristicAnalysis({ student, playbook, submission });
  let aiAnalysis = null;
  let warning = null;

  if (aiConfig().configured) {
    try {
      const raw = await generateAnalysisJson({
        prompt: analysisPrompt({ student, playbook, submission }),
        maxTokens: 1700,
      });
      aiAnalysis = normalizeAiAnalysis(raw, fallback);
      if (!aiAnalysis) warning = "The AI response did not match the review schema; the rubric engine was used.";
    } catch (error) {
      warning = error.message;
    }
  }

  const result = aiAnalysis ?? fallback;
  result.sources = {
    github: submission?.github?.repo
      ? {
          fullName: submission.github.repo.fullName,
          url: submission.github.repo.htmlUrl,
          language: submission.github.repo.language,
          files: submission.github.fileCount,
          hasReadme: Boolean(submission.github.flags?.hasReadme),
          warnings: submission.github.warnings ?? [],
        }
      : null,
    document: submission?.docName
      ? { name: submission.docName, wordCount: submission.docWordCount ?? 0 }
      : null,
    notes: Boolean(submission?.notes),
  };
  result.submittedAt = submission?.submittedAt ?? null;
  if (warning) result.warning = warning;
  return result;
}
