export const DEFAULT_SETTINGS = {
  companyName: "Vulture Management Wings",
  senderName: "Vulture Review Desk",
  testMode: true,
  testEmail: "srenuka39903@gmail.com",
  defaultMeetLink: "",
  autoSendDebrief: true,
  nextReviewDays: 7,
  reviewDurationMinutes: 30,
  timezone: "Asia/Kolkata",
};

export const STATUS_LABELS = {
  queued: "Queued",
  invited: "Invited",
  submitted: "Submitted",
  analyzed: "Analysis ready",
  debriefed: "Debrief sent",
};

export const STATUS_ORDER = ["queued", "invited", "submitted", "analyzed", "debriefed"];

export const EMAIL_TYPE_LABELS = {
  invite: "Review invite",
  debrief: "Project debrief",
  test: "Test message",
};
