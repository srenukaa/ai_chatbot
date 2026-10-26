import path from "node:path";
import { readZipEntries, writeZip } from "./zip.js";
import { decodeXml, escapeXml, normalizeHeader } from "./util.js";

const HEADER_ALIASES = {
  name: ["name", "student name", "intern name", "full name", "candidate", "student"],
  email: ["email", "email id", "emailid", "mail", "mail id", "e mail", "email address"],
  project: ["project", "project title", "project name", "topic", "assignment", "project topic"],
  reviewDate: ["review date", "date", "meeting date", "review on", "session date", "review at"],
  meetLink: ["meet link", "meeting link", "google meet", "meet", "meeting url"],
};

function columnIndex(letters) {
  let total = 0;
  for (const letter of letters.toUpperCase()) {
    total = total * 26 + (letter.charCodeAt(0) - 64);
  }
  return total - 1;
}

function textOf(entries, name) {
  const entry = entries.get(name);
  return entry ? entry.toString("utf8") : "";
}

function parseSharedStrings(xml) {
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    values.push(parts.join(""));
  }
  return values;
}

function parseRelationships(xml) {
  const map = new Map();
  if (!xml) return map;
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = match[1];
    const id = (attrs.match(/\bId="([^"]+)"/) ?? [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/) ?? [])[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

function firstWorksheetPath(entries) {
  const workbook = textOf(entries, "xl/workbook.xml");
  const rels = parseRelationships(textOf(entries, "xl/_rels/workbook.xml.rels"));
  const sheetTags = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)];
  for (const tag of sheetTags) {
    const attrs = tag[1];
    const relId = (attrs.match(/\br:id="([^"]+)"/) ?? [])[1];
    if (relId && rels.has(relId)) {
      const target = rels.get(relId);
      const normalized = target.startsWith("/")
        ? target.slice(1)
        : path.posix.normalize(path.posix.join("xl", target));
      if (entries.has(normalized)) return normalized;
    }
  }

  const candidates = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => {
      const left = Number(a.match(/sheet(\d+)\.xml/)?.[1] ?? 0);
      const right = Number(b.match(/sheet(\d+)\.xml/)?.[1] ?? 0);
      return left - right;
    });
  return candidates[0] ?? "";
}

function workbookSheetName(entries) {
  const workbook = textOf(entries, "xl/workbook.xml");
  const match = workbook.match(/<sheet\b[^>]*\bname="([^"]+)"/);
  return match ? decodeXml(match[1]) : "Sheet1";
}

function extractInlineText(inner) {
  const parts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
  return parts.join("");
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    let cursor = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const reference = (attrs.match(/\br="([A-Z]+)\d+"/i) ?? [])[1];
      const column = reference ? columnIndex(reference) : cursor;
      cursor = column + 1;
      const type = (attrs.match(/\bt="([^"]+)"/) ?? [])[1] ?? "";
      let value = "";

      if (type === "inlineStr") {
        value = extractInlineText(inner);
      } else {
        const rawMatch = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        if (rawMatch) {
          const raw = decodeXml(rawMatch[1]);
          if (type === "s") {
            value = sharedStrings[Number(raw)] ?? "";
          } else if (type === "b") {
            value = raw === "1" ? "TRUE" : "FALSE";
          } else {
            value = raw;
          }
        } else {
          value = extractInlineText(inner);
        }
      }
      cells[column] = String(value).trim();
    }
    rows.push(cells);
  }
  return rows;
}

function parseDelimitedText(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = normalized.split("\n").find((line) => line.trim()) ?? "";
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (quoted) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows;
}

function detectMapping(headerCells) {
  const normalized = headerCells.map((cell) => normalizeHeader(cell));
  const mapping = { name: -1, email: -1, project: -1, reviewDate: -1, meetLink: -1 };
  const matches = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    mapping[field] = index;
    if (index >= 0) matches[field] = index;
  }

  const recognized = Object.keys(matches).length;
  return { mapping, recognized };
}

function cellValue(row, index) {
  if (index === undefined || index < 0) return "";
  return String(row[index] ?? "").trim();
}

export function parseSpreadsheet({ filename = "", buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("The uploaded file is empty.");
  }

  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  let rows = [];
  let headers = [];
  let headerRowIndex = -1;
  let mapping = { name: 0, email: 1, project: 2, reviewDate: 3, meetLink: 4 };
  let sheetName = "Sheet1";

  if (isZip) {
    let entries;
    try {
      entries = readZipEntries(buffer);
    } catch (error) {
      throw new Error(`That spreadsheet could not be opened: ${error.message}`);
    }

    const sheetPath = firstWorksheetPath(entries);
    if (!sheetPath) {
      throw new Error("No worksheet was found in this .xlsx file.");
    }

    const sharedStrings = parseSharedStrings(textOf(entries, "xl/sharedStrings.xml"));
    const sheetXml = textOf(entries, sheetPath);
    const matrix = parseSheetRows(sheetXml, sharedStrings).map((row) =>
      Array.from(row, (cell) => String(cell ?? "").trim()),
    );

    const firstNonEmpty = matrix.findIndex((row) => row.some((cell) => cell));
    if (firstNonEmpty < 0) throw new Error("The spreadsheet has no rows.");

    const headerCandidate = matrix[firstNonEmpty];
    const detected = detectMapping(headerCandidate);
    if (detected.recognized >= 2) {
      headerRowIndex = firstNonEmpty;
      mapping = detected.mapping;
      headers = headerCandidate;
    } else {
      headerRowIndex = firstNonEmpty - 1;
      mapping = { name: 0, email: 1, project: 2, reviewDate: 3, meetLink: 4 };
      headers = ["Name", "Email", "Project", "Review date", "Meet link"];
    }

    sheetName = workbookSheetName(entries);

    for (let index = 0; index < matrix.length; index += 1) {
      if (index <= headerRowIndex) continue;
      const cells = matrix[index];
      if (!cells || cells.every((cell) => !cell)) continue;
      const name = cellValue(cells, mapping.name) || cellValue(cells, 0);
      const email = cellValue(cells, mapping.email) || cellValue(cells, 1);
      const projectTitle = cellValue(cells, mapping.project) || cellValue(cells, 2);
      const reviewDateRaw = cellValue(cells, mapping.reviewDate) || cellValue(cells, 3);
      const meetLinkRaw = cellValue(cells, mapping.meetLink) || cellValue(cells, 4);
      rows.push({
        rowNumber: index + 1,
        name,
        email: email.toLowerCase(),
        projectTitle,
        reviewDateRaw,
        meetLinkRaw,
        issues: [],
      });
    }
  } else {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".xls") {
      throw new Error("Legacy .xls files are not supported. Save the sheet as .xlsx or .csv.");
    }
    let text;
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      text = buffer.toString("utf16le");
    } else {
      text = buffer.toString("utf8");
    }

    const matrix = parseDelimitedText(text);
    const firstNonEmpty = matrix.findIndex((row) => row.some((cell) => cell));
    if (firstNonEmpty < 0) throw new Error("The sheet has no rows.");

    const headerCandidate = matrix[firstNonEmpty];
    const detected = detectMapping(headerCandidate);
    if (detected.recognized >= 2) {
      headerRowIndex = firstNonEmpty;
      mapping = detected.mapping;
      headers = headerCandidate;
    } else {
      headerRowIndex = firstNonEmpty - 1;
      mapping = { name: 0, email: 1, project: 2, reviewDate: 3, meetLink: 4 };
      headers = ["Name", "Email", "Project", "Review date", "Meet link"];
    }

    for (let index = 0; index < matrix.length; index += 1) {
      if (index <= headerRowIndex) continue;
      const cells = matrix[index];
      if (!cells || cells.every((cell) => !cell)) continue;
      const name = cellValue(cells, mapping.name) || cellValue(cells, 0);
      const email = cellValue(cells, mapping.email) || cellValue(cells, 1);
      const projectTitle = cellValue(cells, mapping.project) || cellValue(cells, 2);
      const reviewDateRaw = cellValue(cells, mapping.reviewDate) || cellValue(cells, 3);
      const meetLinkRaw = cellValue(cells, mapping.meetLink) || cellValue(cells, 4);
      rows.push({
        rowNumber: index + 1,
        name,
        email: email.toLowerCase(),
        projectTitle,
        reviewDateRaw,
        meetLinkRaw,
        issues: [],
      });
    }
  }

  const seenEmails = new Map();
  for (const row of rows) {
    if (!row.name) row.issues.push("Name is missing.");
    if (!row.email) row.issues.push("Email is missing.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) {
      row.issues.push(`"${row.email}" does not look like a valid email.`);
    }
    if (!row.projectTitle) row.issues.push("Project title is missing.");

    if (row.email) {
      if (seenEmails.has(row.email)) {
        row.issues.push(`Duplicate email in this sheet (also row ${seenEmails.get(row.email)}).`);
      } else {
        seenEmails.set(row.email, row.rowNumber);
      }
    }
  }

  return {
    sheetName,
    headers: headers.map((header) => String(header ?? "").trim()).filter(Boolean),
    mapping,
    rows,
    validRows: rows.filter((row) => row.issues.length === 0),
    invalidRows: rows.filter((row) => row.issues.length > 0),
  };
}

function inlineCell(reference, value) {
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export function buildSampleXlsx() {
  const rows = [
    ["Name", "Email", "Project", "Review Date"],
    ["Madhu", "madhushreemanikandan278@gmail.com", "AI based image classification", ""],
    ["Renuka", "srenuka39903@gmail.com", "AI based sentimental analysis", ""],
  ];

  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const column = String.fromCharCode(65 + columnIndex);
          return inlineCell(`${column}${rowIndex + 1}`, cell);
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows}</sheetData>
</worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  return writeZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: worksheet },
  ]);
}

export function buildSampleCsv() {
  return [
    "Name,Email,Project,Review Date",
    "Madhu,madhushreemanikandan278@gmail.com,AI based image classification,",
    "Renuka,srenuka39903@gmail.com,AI based sentimental analysis,",
    "",
  ].join("\r\n");
}
