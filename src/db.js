import fs from "node:fs/promises";
import path from "node:path";
import { createSeedDatabase } from "./seed.js";
import { DEFAULT_SETTINGS } from "./defaults.js";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

let database = null;
let loadPromise = null;
let writeChain = Promise.resolve();

function normalizeDatabase(value) {
  if (!value || typeof value !== "object") throw new Error("The data file is not a valid database.");
  if (!Array.isArray(value.students)) value.students = [];
  if (!Array.isArray(value.emails)) value.emails = [];
  value.settings = { ...DEFAULT_SETTINGS, ...(value.settings ?? {}) };
  value.version = value.version ?? 1;
  return value;
}

async function persist(value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  value.updatedAt = new Date().toISOString();
  const temporary = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, DB_PATH);
}

export async function getDb() {
  if (database) return database;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DB_PATH, "utf8");
      database = normalizeDatabase(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`Could not read ${DB_PATH}: ${error.message}`);
      }
      database = createSeedDatabase();
      await persist(database);
    }
    return database;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export function mutateDb(mutator) {
  const run = writeChain.then(async () => {
    const db = await getDb();
    const result = await mutator(db);
    await persist(db);
    return result;
  });
  writeChain = run.catch(() => {});
  return run;
}

export async function readDb() {
  return getDb();
}

export function dbLocation() {
  return DB_PATH;
}

export async function resetDatabase() {
  database = createSeedDatabase();
  await persist(database);
  return database;
}
