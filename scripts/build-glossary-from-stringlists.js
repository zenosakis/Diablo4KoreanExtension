#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_EN = path.join(ROOT, "data", "raw", "d4-translations-enUS.tsv");
const DEFAULT_KO = path.join(ROOT, "data", "raw", "d4-translations-koKR.tsv");
const OUT_DIR = path.join(ROOT, "data", "generated");

const SOURCE_KEYS = ["sno", "fileName", "index", "keyHash", "key"];
const NAME_LIKE_KEYS = new Set([
  "Name",
  "TagName",
  "DisplayName",
  "ShortName",
  "KeywordName",
  "Title",
  "Header",
  "Label",
]);

function usage() {
  return [
    "Usage: node scripts/build-glossary-from-stringlists.js [enUS.tsv] [koKR.tsv]",
    "",
    "Outputs:",
    "  data/generated/d4-translation-map.json",
    "  data/generated/d4-glossary-candidates.json",
    "  data/generated/d4-translation-report.json",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  return {
    enPath: path.resolve(argv[0] || DEFAULT_EN),
    koPath: path.resolve(argv[1] || DEFAULT_KO),
  };
}

function readStringList(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let current = null;
  let malformedLines = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) {
      continue;
    }

    const parts = rawLine.split("\t");
    const startsRecord =
      parts.length >= 6 &&
      /^\d+$/.test(parts[0]) &&
      /^\d+$/.test(parts[2]) &&
      /^\d+$/.test(parts[3]);

    if (startsRecord) {
      current = {
        sno: parts[0],
        fileName: parts[1],
        index: parts[2],
        keyHash: parts[3],
        key: parts[4],
        translation: parts.slice(5).join("\t").trim(),
      };
      rows.push(current);
      continue;
    }

    malformedLines += 1;
    if (current) {
      current.translation = `${current.translation}\n${rawLine.trim()}`.trim();
    }
  }

  return { rows, malformedLines };
}

function rowId(row) {
  return SOURCE_KEYS.map((key) => row[key]).join("\t");
}

function isUsefulEnglishTerm(text) {
  if (!text) return false;
  if (text.length > 80) return false;
  if (text.includes("\n")) return false;
  if (/[{}[\]|]/.test(text)) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^\d+([.,]\d+)*$/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  return true;
}

function isUsefulKoreanTerm(text) {
  if (!text) return false;
  if (text.length > 80) return false;
  if (text.includes("\n")) return false;
  if (/[{}[\]|]/.test(text)) return false;
  if (!/[가-힣]/.test(text)) return false;
  return true;
}

function buildJoinedMap(enRows, koRows) {
  const koById = new Map();
  for (const row of koRows) {
    koById.set(rowId(row), row);
  }

  const joined = [];
  const missingKo = [];

  for (const enRow of enRows) {
    const koRow = koById.get(rowId(enRow));
    if (!koRow) {
      missingKo.push(enRow);
      continue;
    }

    joined.push({
      sno: enRow.sno,
      fileName: enRow.fileName,
      index: Number(enRow.index),
      keyHash: enRow.keyHash,
      key: enRow.key,
      en: enRow.translation,
      ko: koRow.translation,
    });
  }

  return { joined, missingKo };
}

function buildGlossaryCandidates(joined) {
  const byEnglish = new Map();
  const conflicts = new Map();

  for (const row of joined) {
    if (!NAME_LIKE_KEYS.has(row.key)) continue;
    if (!isUsefulEnglishTerm(row.en)) continue;
    if (!isUsefulKoreanTerm(row.ko)) continue;
    if (row.en.trim().toLowerCase() === row.ko.trim().toLowerCase()) continue;

    const existing = byEnglish.get(row.en);
    if (!existing) {
      byEnglish.set(row.en, {
        en: row.en,
        ko: row.ko,
        source: "d4analyzer-stringlists",
        confidence: "verified",
        refs: [
          {
            sno: row.sno,
            fileName: row.fileName,
            index: row.index,
            keyHash: row.keyHash,
            key: row.key,
          },
        ],
      });
      continue;
    }

    existing.refs.push({
      sno: row.sno,
      fileName: row.fileName,
      index: row.index,
      keyHash: row.keyHash,
      key: row.key,
    });

    if (existing.ko !== row.ko) {
      const list = conflicts.get(row.en) || new Set([existing.ko]);
      list.add(row.ko);
      conflicts.set(row.en, list);
    }
  }

  const candidates = Array.from(byEnglish.values())
    .filter((entry) => !conflicts.has(entry.en))
    .sort((a, b) => a.en.localeCompare(b.en));

  const conflictReport = Array.from(conflicts.entries())
    .map(([en, values]) => ({ en, ko: Array.from(values).sort() }))
    .sort((a, b) => a.en.localeCompare(b.en));

  return { candidates, conflictReport };
}

function writeJson(fileName, value) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function main() {
  const { enPath, koPath } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(enPath)) {
    throw new Error(`Missing enUS TSV: ${enPath}`);
  }
  if (!fs.existsSync(koPath)) {
    throw new Error(`Missing koKR TSV: ${koPath}`);
  }

  const en = readStringList(enPath);
  const ko = readStringList(koPath);
  const { joined, missingKo } = buildJoinedMap(en.rows, ko.rows);
  const { candidates, conflictReport } = buildGlossaryCandidates(joined);

  const report = {
    inputs: {
      enUS: path.relative(ROOT, enPath),
      koKR: path.relative(ROOT, koPath),
    },
    counts: {
      enRows: en.rows.length,
      koRows: ko.rows.length,
      joinedRows: joined.length,
      missingKoRows: missingKo.length,
      glossaryCandidates: candidates.length,
      glossaryConflicts: conflictReport.length,
      enContinuationLines: en.malformedLines,
      koContinuationLines: ko.malformedLines,
    },
    notes: [
      "Rows are joined by SNO, FileName, Index, KeyHash, and Key.",
      "Glossary candidates are limited to name-like keys and short Korean-bearing values.",
      "Conflicting English terms are excluded from candidates and listed separately.",
    ],
  };

  writeJson("d4-translation-map.json", joined);
  writeJson("d4-glossary-candidates.json", {
    schemaVersion: 1,
    locale: { from: "en-US", to: "ko-KR" },
    generatedFrom: "D4Analyzer StringLists / translations",
    terms: candidates,
  });
  writeJson("d4-translation-conflicts.json", conflictReport);
  writeJson("d4-translation-report.json", report);

  console.log(JSON.stringify(report, null, 2));
}

main();
