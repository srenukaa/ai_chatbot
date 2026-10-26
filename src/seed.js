import { DEFAULT_SETTINGS } from "./defaults.js";
import { buildStudent } from "./students.js";
import { nextWeekdayAt } from "./dates.js";

export function createSeedDatabase() {
  const settings = { ...DEFAULT_SETTINGS, createdAt: new Date().toISOString() };
  const first = nextWeekdayAt({ hour: 10, minute: 0, minimumDays: 1 });
  const second = nextWeekdayAt({ hour: 11, minute: 0, minimumDays: 1 });

  const students = [
    buildStudent({
      name: "Madhu",
      email: "madhushreemanikandan278@gmail.com",
      projectTitle: "AI based image classification",
      reviewDate: first,
      settings,
    }),
    buildStudent({
      name: "Renuka",
      email: "srenuka39903@gmail.com",
      projectTitle: "AI based sentimental analysis",
      reviewDate: second,
      settings,
    }),
  ];

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings,
    students,
    emails: [],
  };
}
