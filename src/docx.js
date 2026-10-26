import path from "node:path";
import { readZipEntries } from "./zip.js";
import { decodeXml, normalizeWhitespace, truncate, wordCount } from "./util.js";

function documentTextFromXml(xml) {
  const cleaned = xml
    .replace(/<w:del\b[\s\S]*?<\/w:del>/gi, "")
    .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/gi, "")
    .replace(/<w:delText\b[\s\S]*?<\/w:delText>/gi, "");

  const tokens = cleaned.matchAll(
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<\/w:p>|<\/w:tr>|<\/w:tc>/gi,
  );

  let text = "";
  for (const token of tokens) {
    if (token[1] !== undefined) {
      text += decodeXml(token[1]);
    } else {
      const tag = token[0].toLowerCase();
      if (tag.startsWith("<w:tab")) text += "\t";
      else if (tag.startsWith("<w:br") || tag.startsWith("<w:cr") || tag === "</w:p>" || tag === "</w:tr>") {
        text += "\n";
      } else if (tag === "</w:tc>") {
        text += " | ";
      }
    }
  }

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractDocument({ filename = "", buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("The uploaded document is empty.");
  }

  const extension = path.extname(filename).toLowerCase();
  if (extension === ".doc") {
    throw new Error("Legacy .doc files are not supported. Save the document as .docx, or paste the key notes.");
  }
  if (extension === ".pdf") {
    throw new Error("PDF submissions are not supported yet. Upload a .docx file, or paste the key notes.");
  }

  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  let text = "";

  if (isZip) {
    let entries;
    try {
      entries = readZipEntries(buffer, { maxEntryBytes: 50 * 1024 * 1024 });
    } catch (error) {
      throw new Error(`That document could not be opened: ${error.message}`);
    }
    const documentXml = entries.get("word/document.xml");
    if (!documentXml) {
      throw new Error("This file does not look like a Word .docx document.");
    }
    text = documentTextFromXml(documentXml.toString("utf8"));
  } else if (extension === ".txt" || extension === ".md" || extension === "") {
    text = normalizeWhitespace(buffer.toString("utf8"));
  } else {
    throw new Error("Upload a .docx, .txt or .md file, or paste the key notes.");
  }

  text = normalizeWhitespace(text);
  if (!text) {
    throw new Error("No readable text was found in that document.");
  }

  return {
    text: truncate(text, 60000),
    wordCount: wordCount(text),
    characters: text.length,
    truncated: text.length > 60000,
  };
}
