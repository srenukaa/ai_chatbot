const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function istParts(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

export function fromIstParts({ year, month, day, hour = 0, minute = 0 }) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MS);
}

export function toDate(input) {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function iso(input) {
  const date = toDate(input);
  return date ? date.toISOString() : null;
}

export function formatDateShort(input) {
  const parts = istParts(input);
  if (!parts) return "—";
  return `${WEEKDAYS_SHORT[parts.weekday]}, ${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

export function formatDateLong(input) {
  const parts = istParts(input);
  if (!parts) return "—";
  return `${WEEKDAYS_LONG[parts.weekday]}, ${parts.day} ${MONTHS_LONG[parts.month - 1]} ${parts.year}`;
}

export function formatTime(input) {
  const parts = istParts(input);
  if (!parts) return "—";
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${suffix}`;
}

export function formatDateTimeShort(input) {
  const date = toDate(input);
  if (!date) return "—";
  return `${formatDateShort(date)} · ${formatTime(date)} IST`;
}

export function formatDateTimeLong(input) {
  const date = toDate(input);
  if (!date) return "—";
  return `${formatDateLong(date)} at ${formatTime(date)} IST`;
}

export function formatDayParts(input) {
  const parts = istParts(input);
  if (!parts) {
    return { day: "—", month: "—", weekday: "—", time: "—", date: "—" };
  }
  return {
    day: String(parts.day).padStart(2, "0"),
    month: MONTHS_SHORT[parts.month - 1].toUpperCase(),
    weekday: WEEKDAYS_SHORT[parts.weekday].toUpperCase(),
    time: formatTime(input),
    date: formatDateShort(input),
  };
}

export function relativeDayLabel(input) {
  const date = toDate(input);
  if (!date) return "Not scheduled";
  const now = istParts();
  const target = istParts(date);
  if (!now || !target) return formatDateShort(date);
  const todayUtc = Date.UTC(now.year, now.month - 1, now.day);
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const diff = Math.round((targetUtc - todayUtc) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 6) return `In ${diff} days`;
  if (diff === -1) return "Yesterday";
  if (diff < -1 && diff >= -6) return `${Math.abs(diff)} days ago`;
  return formatDateShort(date);
}

export function nextWeekdayAt({ hour = 10, minute = 0, from = new Date(), minimumDays = 1 } = {}) {
  const start = istParts(from) ?? istParts(new Date());
  let year = start.year;
  let month = start.month;
  let day = start.day + Math.max(0, minimumDays);
  let guard = 0;

  while (guard < 370) {
    guard += 1;
    const probe = fromIstParts({ year, month, day, hour: 12, minute: 0 });
    const probeParts = istParts(probe);
    if (!probeParts) break;
    year = probeParts.year;
    month = probeParts.month;
    day = probeParts.day;
    if (probeParts.weekday >= 1 && probeParts.weekday <= 5) {
      const candidate = fromIstParts({ year, month, day, hour, minute });
      if (candidate.getTime() > from.getTime()) return candidate;
    }
    day += 1;
  }

  return fromIstParts({ ...start, hour, minute });
}

export function parseFlexibleDate(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.round(value * 86400000));
    return fromIstParts({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: 10,
      minute: 0,
    });
  }

  const text = String(value).trim();
  if (!text) return fallback;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (match) {
    return fromIstParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: match[4] !== undefined ? Number(match[4]) : 10,
      minute: match[5] !== undefined ? Number(match[5]) : 0,
    });
  }

  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ ,T](\d{1,2}):(\d{2}))?/);
  if (match) {
    return fromIstParts({
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
      hour: match[4] !== undefined ? Number(match[4]) : 10,
      minute: match[5] !== undefined ? Number(match[5]) : 0,
    });
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return fromIstParts({
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate(),
      hour: 10,
      minute: 0,
    });
  }

  return fallback;
}

export function scheduleReview({ minimumDays = 1, addDays = 0, hour = 10, minute = 0, from = new Date() } = {}) {
  return nextWeekdayAt({ hour, minute, from, minimumDays: Math.max(1, minimumDays + addDays) });
}

export function nextReviewSchedule(settings, from = new Date()) {
  const interval = Number(settings?.nextReviewDays);
  const days = Number.isFinite(interval) && interval > 0 ? Math.round(interval) : 7;
  return nextWeekdayAt({ hour: 10, minute: 0, from, minimumDays: days });
}

export { MONTHS_SHORT, MONTHS_LONG, WEEKDAYS_SHORT, WEEKDAYS_LONG };
