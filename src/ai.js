import { formatDateTimeLong, formatDateTimeShort } from "./dates.js";
import { truncate } from "./util.js";

export function aiConfig() {
  const key = String(process.env.OPENAI_API_KEY ?? "").trim();
  const baseUrl = String(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1")
    .trim()
    .replace(/\/+$/, "");
  const model = String(process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
  return { configured: Boolean(key), key, baseUrl, model };
}

export function aiStatus() {
  const config = aiConfig();
  return { configured: config.configured, model: config.configured ? config.model : null };
}

async function callOpenAI({ messages, json = false, temperature = 0.35, maxTokens = 900, timeoutMs = 60000 }) {
  const config = aiConfig();
  if (!config.configured) throw new Error("The AI provider is not configured.");
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error?.message ?? "";
    } catch {
      // Ignore malformed error payloads.
    }
    throw new Error(`The AI provider returned ${response.status}${detail ? `: ${detail}` : "."}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI provider returned an empty response.");
  return content;
}

function systemPrompt(student, playbook, settings) {
  return `You are the internship review mentor at ${settings.companyName}. You are speaking inside the intern's personal review room with ${student.name} about the project "${student.projectTitle}". The review is scheduled for ${formatDateTimeLong(student.reviewDate)}.

Project brief:
${playbook.brief}

${playbook.clarification ? `Important technical clarification: ${playbook.clarification}\n` : ""}
Objectives:
${playbook.objectives.map((item) => `- ${item}`).join("\n")}

Deliverables:
${playbook.deliverables.map((item) => `- ${item}`).join("\n")}

Evaluation rubric:
${playbook.rubric.map((item) => `- ${item.criterion} (${item.weight}%): ${item.detail}`).join("\n")}

Reference shelf:
${playbook.references.map((item) => `- ${item.label}: ${item.url} (${item.note})`).join("\n")}

Rules:
- Be specific, practical and calm. No hype, no filler, no emojis.
- Use short paragraphs and bullets. Keep most replies under 180 words unless the student asks for a full explanation.
- You have not reviewed their work until they submit a GitHub link, DOCX or notes in the room. Never invent findings. If they ask for feedback before submitting, ask for the evidence.
- Correct factual mistakes kindly and precisely. For example, Whisper transcribes audio; it does not classify sentiment by itself.
- Only cite links from the reference shelf. Do not invent URLs.
- Today is ${new Date().toISOString().slice(0, 10)}.`;
}

export function mentorIntro(student, playbook, settings) {
  const first = student.name.split(/\s+/)[0] || student.name;
  const lines = [
    `Hi ${first} — I'm your review mentor for the **${playbook.title}** session at ${settings.companyName}.`,
    "",
    `We are booked for **${formatDateTimeShort(student.reviewDate)}** for about ${settings.reviewDurationMinutes || 30} minutes. I've already matched this room to you and your project, so you don't need to introduce the basics.`,
    "",
    "**What we're building**",
    playbook.brief,
  ];

  if (playbook.clarification) {
    lines.push("", "**One important clarification**", playbook.clarification);
  }

  lines.push(
    "",
    "**What I'll be looking for**",
    ...playbook.objectives.slice(0, 5).map((item) => `- ${item}`),
    "",
    "**What to bring**",
    ...playbook.deliverables.slice(0, 4).map((item) => `- ${item}`),
    "",
    "**How this works**",
    "1. Ask me anything about the scope, dataset, model or evaluation.",
    "2. When you're ready, submit a GitHub link, a DOCX, or written notes in the work panel.",
    "3. I review the evidence against the rubric, show the debrief here, and email you the summary, corrections and next review date.",
    "",
    "**Reference shelf**",
    ...playbook.references.slice(0, 4).map((item) => `- [${item.label}](${item.url}) — ${item.note}`),
    "",
    "Start with a question, or submit your work when you're ready.",
  );

  return lines.join("\n");
}

function sections(items, limit = 6) {
  return items
    .slice(0, limit)
    .map((item) => `- ${item}`)
    .join("\n");
}

export function localMentorReply({ student, playbook, message, settings }) {
  const text = String(message ?? "").toLowerCase();
  const first = student.name.split(/\s+/)[0] || student.name;
  const hasWhisper = /whisper|audio|speech|transcri/.test(text);
  const asksSubmit = /submit|github|repo|document|docx|upload|link/.test(text);
  const asksRequirements = /requirement|objective|scope|what.*(need|do|build)|brief|task/.test(text);
  const asksEvaluation = /evaluat|rubric|score|feedback|marks|review|criteria|assess/.test(text);
  const asksReferences = /reference|resource|dataset|paper|link|tutorial|learn/.test(text);
  const asksMeet = /meet|join|call|session|meeting/.test(text);
  const asksDate = /date|time|when|schedule|deadline/.test(text);
  const asksFix = /fix|improve|wrong|mistake|next|better|correct/.test(text);
  const greeting = /^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(text.trim());

  if (hasWhisper && playbook.clarification) {
    return [
      playbook.clarification,
      "",
      "For this review, show the pipeline as two testable stages:",
      "1. **Transcription** — Whisper, with sample audio and a word-error-rate or spot-check.",
      "2. **Sentiment scoring** — a text model such as TF-IDF + Logistic Regression or DistilBERT, evaluated on labelled text.",
      "",
      "If you are only working with text, drop the audio stage and say so clearly in the README.",
    ].join("\n");
  }

  if (asksSubmit) {
    return [
      "Submit one of three evidence types in the work panel on the right:",
      "",
      "1. **GitHub repository link** — best, because I can inspect the README, file tree and tests.",
      "2. **DOCX or TXT** — include the method, results, metrics and failure analysis.",
      "3. **Written notes** — only if the code is not accessible; be specific about what was built and measured.",
      "",
      `For this project, the strongest packet is: ${playbook.deliverables
        .slice(0, 3)
        .map((item) => item.replace(/\.$/, ""))
        .join("; ")}.`,
      "",
      "Once it is submitted, press **Run review** and I will compare it against the rubric.",
    ].join("\n");
  }

  if (asksEvaluation) {
    return [
      "I score the work against the project rubric, not against effort alone:",
      "",
      ...playbook.rubric.map((item) => `- **${item.criterion} — ${item.weight}%.** ${item.detail}`),
      "",
      "The debrief will name the strongest parts, the gaps that matter, the corrections to make and the focus for the next review. It is sent to you by email and stays in this room.",
    ].join("\n");
  }

  if (asksRequirements) {
    return [
      `Here is the working scope for **${student.projectTitle}**:`,
      "",
      sections(playbook.objectives, 7),
      "",
      "**Before the review, make sure these exist:**",
      sections(playbook.requirements, 5),
    ].join("\n");
  }

  if (asksReferences) {
    return [
      "Use this shelf rather than random tutorials:",
      "",
      ...playbook.references.map((item) => `- [${item.label}](${item.url}) — ${item.note}`),
      "",
      "If you tell me which part you are stuck on, I can narrow this to the one reference that matters.",
    ].join("\n");
  }

  if (asksMeet) {
    return [
      `The Google Meet room is in your invite and in the session panel: ${student.meetLink}.`,
      "",
      "This review room is the place for the written work and the debrief. Join the Meet for the live conversation; submit the GitHub link or DOCX here before or during the call.",
      student.meetLinkGenerated
        ? "\nThe meeting link was assigned by the review desk. If it does not open, contact your coordinator."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (asksDate) {
    return `Your review is booked for **${formatDateTimeShort(student.reviewDate)}**. The invite has the Meet link, and the work panel stays open until the review is complete.\n\nIf you need to move it, contact your coordinator — I cannot reschedule the calendar from this room.`;
  }

  if (asksFix) {
    return [
      "The three fixes that usually move this project forward:",
      "",
      sections(playbook.tips, 5),
      "",
      "Submit the current version and I will tell you which of these actually applies to your work, with evidence from the repository or document.",
    ].join("\n");
  }

  if (greeting) {
    return [
      `Hello ${first}. You're in the right room — this session is for **${student.projectTitle}** on ${formatDateTimeShort(student.reviewDate)}.`,
      "",
      "You can ask me about the scope, dataset, model, evaluation or references. When your work is ready, submit the GitHub link or DOCX in the panel on the right.",
      "",
      `A good first check: ${playbook.objectives[0]}`,
    ].join("\n");
  }

  return [
    `I've got your project context: **${student.projectTitle}**. ${playbook.brief}`,
    "",
    "To keep this useful, tell me which part you want to work through: problem framing, data, model, evaluation, the demo, or the submission itself.",
    "",
    `A useful default next move: ${playbook.nextSteps[0]}`,
    "",
    `You can also submit your work now and I will review it against the rubric.`,
  ].join("\n");
}

export async function mentorReply({ student, playbook, message, history, settings }) {
  const config = aiConfig();
  const fallback = () => ({
    reply: localMentorReply({ student, playbook, message, settings }),
    mode: "local",
    degraded: false,
  });

  if (!config.configured) return fallback();

  const safeHistory = Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim(),
        )
        .slice(-10)
        .map((item) => ({ role: item.role, content: truncate(item.content, 3500) }))
    : [];

  try {
    const reply = await callOpenAI({
      messages: [
        { role: "system", content: systemPrompt(student, playbook, settings) },
        ...safeHistory,
        { role: "user", content: truncate(message, 4000) },
      ],
      temperature: 0.4,
      maxTokens: 700,
    });
    return { reply: reply.trim(), mode: "ai", degraded: false };
  } catch {
    return { ...fallback(), degraded: true, mode: "local" };
  }
}

export async function generateAnalysisJson({ prompt, maxTokens = 1600 }) {
  const content = await callOpenAI({
    messages: [
      {
        role: "system",
        content:
          "You are a precise internship project reviewer. You return only valid JSON matching the requested schema, with no markdown fences and no commentary.",
      },
      { role: "user", content: prompt },
    ],
    json: true,
    temperature: 0.25,
    maxTokens,
    timeoutMs: 90000,
  });

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}
