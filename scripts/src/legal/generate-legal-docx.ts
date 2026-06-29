// Generates the four onboarding legal documents as downloadable .docx files.
// Run: pnpm --filter @workspace/scripts run gen:legal-docx
// Output: ./legal-documents/*.docx (repo root)

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { ONBOARDING_LEGAL_DOCS, type OnboardingLegalDoc } from "./onboarding-legal-content.js";

const NAVY = "1E3A8A";
const GOLD = "B45309";

function isSectionHeading(line: string): boolean {
  // e.g. "1. WHO WE ARE" or "12. CONTACT"
  return /^\d+\.\s+[A-Z]/.test(line.trim());
}

function isDocTitle(line: string): boolean {
  return /^STRIDE PLATFORM/.test(line.trim());
}

function isDraftBanner(line: string): boolean {
  return /^DRAFT/.test(line.trim());
}

function buildParagraphs(doc: OnboardingLegalDoc): Paragraph[] {
  const out: Paragraph[] = [];

  // Cover block
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: "STRIDE", bold: true, size: 28, color: NAVY, characterSpacing: 60 })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: doc.title, bold: true, size: 44, color: NAVY })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: doc.subtitle, italics: true, size: 22, color: "4B5563" })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: `Version ${doc.version}  -  Provisional draft for legal review`, size: 18, color: GOLD, bold: true })],
  }));

  // Body lines
  const lines = doc.body.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      continue;
    }
    if (isDocTitle(line)) {
      // already shown in cover; skip the repeated title line
      continue;
    }
    if (isDraftBanner(line)) {
      out.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: line.trim(), bold: true, size: 18, color: GOLD })],
      }));
      continue;
    }
    if (/^Version /.test(line.trim())) {
      continue; // shown in cover
    }
    if (isSectionHeading(line)) {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: line.trim(), bold: true, size: 24, color: NAVY })],
      }));
      continue;
    }
    if (line.trim().startsWith("- ")) {
      out.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text: line.trim().slice(2), size: 22 })],
      }));
      continue;
    }
    out.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: line.trim(), size: 22 })],
    }));
  }

  // Footer
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 320 },
    children: [new TextRun({ text: "(c) Stride Technologies  -  Provisional document, subject to change  -  info@stride-ops.com", size: 16, color: "9CA3AF" })],
  }));

  return out;
}

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), "legal-documents");
  await mkdir(outDir, { recursive: true });

  for (const doc of ONBOARDING_LEGAL_DOCS) {
    const document = new Document({
      creator: "Stride Technologies",
      title: doc.title,
      description: doc.subtitle,
      sections: [{ properties: {}, children: buildParagraphs(doc) }],
    });
    const buffer = await Packer.toBuffer(document);
    const filename = `Stride-${doc.title.replace(/[^A-Za-z0-9]+/g, "-")}-DRAFT.docx`;
    const path = resolve(outDir, filename);
    await writeFile(path, buffer);
    console.log(`wrote ${path} (${buffer.length} bytes)`);
  }
  console.log(`\nDone. ${ONBOARDING_LEGAL_DOCS.length} documents written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
