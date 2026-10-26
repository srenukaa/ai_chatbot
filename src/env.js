import fs from "node:fs";
import path from "node:path";

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n");
    values[match[1]] = value;
  }
  return values;
}

function loadFiles() {
  const candidates = [".env.local", ".env"];
  const loaded = new Set();
  for (const file of candidates) {
    const location = path.join(process.cwd(), file);
    if (!fs.existsSync(location)) continue;
    try {
      const values = parseEnvFile(fs.readFileSync(location, "utf8"));
      for (const [key, value] of Object.entries(values)) {
        if (process.env[key] === undefined) process.env[key] = value;
        loaded.add(key);
      }
    } catch (error) {
      console.warn(`Could not read ${file}: ${error.message}`);
    }
  }
  return loaded;
}

export const loadedEnvKeys = loadFiles();
