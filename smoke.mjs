import { buildSampleXlsx, parseSpreadsheet } from "./src/excel.js";
import { writeZip } from "./src/zip.js";
import { extractDocument } from "./src/docx.js";
import { getDb, resetDatabase } from "./src/db.js";
import { sendInvite, submitWork, analyzeStudent, getOutbox, getReviewSession } from "./src/workflow.js";
import { mentorIntro } from "./src/ai.js";
import { resolvePlaybook, publicPlaybook } from "./src/playbooks.js";

const xlsx = buildSampleXlsx();
const parsed = parseSpreadsheet({ filename: "sample.xlsx", buffer: xlsx });
console.log("XLSX", parsed.sheetName, parsed.headers, parsed.rows.length, parsed.validRows.length, parsed.invalidRows.length);
console.log(parsed.rows);

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>AI image classification review submission</w:t></w:r></w:p>
    <w:p><w:r><w:t>Dataset: CIFAR-10. Train, validation and test splits are stratified.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Preprocessing resizes and normalises images; augmentation uses random crop and flip.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Baseline logistic regression; improved ResNet18 transfer learning with fine-tuning.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Metrics: macro F1, precision, recall, confusion matrix, per-class error analysis.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Seeds fixed and requirements.txt pinned. Inference script in predict.py.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Limitations include dataset bias and licence terms. Tests use pytest.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
const docx = writeZip([{ name: "word/document.xml", data: documentXml }]);
const doc = extractDocument({ filename: "submission.docx", buffer: docx });
console.log("DOCX", doc.wordCount, doc.text.slice(0, 120));

const db = await getDb();
console.log("SEED", db.settings.testMode, db.settings.testEmail, db.students.map((s) => [s.name, s.projectTitle, s.status, s.reviewDate]));

const playbook = publicPlaybook(resolvePlaybook(db.students[1].projectTitle));
const intro = mentorIntro({ name: "Renuka", projectTitle: db.students[1].projectTitle, reviewDate: db.students[1].reviewDate }, playbook, db.settings);
console.log("INTRO", intro.slice(0, 300));

const invite = await sendInvite(db.students[0].id, { origin: "http://localhost:3000" });
console.log("INVITE", invite.email.status, invite.email.deliveredTo, invite.student.status);

const submitted = await submitWork({
  token: db.students[0].token,
  notes: "Built an image classifier with dataset splits, preprocessing, augmentation, baseline, ResNet transfer learning, accuracy, precision, recall, F1, confusion matrix, error analysis, requirements.txt, seed, inference script, README, tests, licence and limitations documented.",
});
console.log("SUBMIT", submitted.submission);

const analysis = await analyzeStudent(db.students[0].id, { origin: "http://localhost:3000" });
console.log("ANALYZE", analysis.analysis.score, analysis.analysis.verdict, analysis.analysis.generatedBy, analysis.email?.status);

const outbox = await getOutbox();
console.log("OUTBOX", outbox.map((mail) => [mail.type, mail.status, mail.subject, mail.deliveredTo]));

const session = await getReviewSession(db.students[0].token);
console.log("SESSION", session.student.status, session.student.analysisSummary, session.playbook.key);

await resetDatabase();
console.log("RESET OK");
