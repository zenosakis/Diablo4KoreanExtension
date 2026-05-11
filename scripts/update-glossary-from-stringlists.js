#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EN_PATH = path.join(ROOT, "data", "raw", "d4-translations-enUS.tsv");
const KO_PATH = path.join(ROOT, "data", "raw", "d4-translations-koKR.tsv");
const GLOSSARY_PATH = path.join(ROOT, "data", "diablo4-ko-glossary.json");
const CATEGORY = "official_stringlist_name";
const RUNE_CATEGORY = "official_rune_name";
const SUFFIX_CATEGORY = "official_suffix_name";

const ALLOWED_SCOPES = {
  item:
    /^Item_(?!.*(?:Armor_|Weapon_|Mount|Cosmetic|Store|Transmog|Dye|Trophy|Back|Portal|Emote|Pet|Horse|Barding|Headstone))/,
  rune: /Rune|Runeword|Runestone|Recipe_Recipe_Jeweler_Random_Rune/i,
  glyph: /Glyph|ParagonGlyph/i,
  skill: /^(Power_|Skill|SkillTag|Paragon|ParagonGlyph|Affix)/,
  charm: /Charm|Amulet|Talisman|Totem|Focus/i,
};
const ALLOWED_KEYS = new Set([
  "Name",
  "TagName",
  "DisplayName",
  "ShortName",
  "KeywordName",
  "AffixName",
  "Buff0_Name",
  "Buff1_Name",
  "Buff2_Name",
  "Buff3_Name",
]);

function readStringList(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) continue;

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

    if (current) {
      current.translation = `${current.translation}\n${rawLine.trim()}`.trim();
    }
  }

  return rows;
}

function rowId(row) {
  return [row.sno, row.fileName, row.index, row.keyHash, row.key].join("\t");
}

function isUsefulEnglishTerm(text) {
  return Boolean(
    text &&
      text.length <= 80 &&
      !text.includes("\n") &&
      /[A-Za-z]/.test(text) &&
      !/[{}[\]|]/.test(text) &&
      !/^https?:\/\//i.test(text),
  );
}

function isUsefulKoreanTerm(text) {
  return Boolean(
    text &&
      text.length <= 80 &&
      !text.includes("\n") &&
      /[가-힣]/.test(text) &&
      !/[{}[\]|]/.test(text),
  );
}

function buildOfficialEntries(enRows, koRows, existingEntries) {
  const koById = new Map(koRows.map((row) => [rowId(row), row]));
  const existingEnglish = new Set(existingEntries.map((entry) => entry.en.toLowerCase()));
  const byEnglish = new Map();
  const conflicts = new Set();
  let matchedRows = 0;
  let candidateRows = 0;
  const scopeCounts = Object.fromEntries(Object.keys(ALLOWED_SCOPES).map((scope) => [scope, 0]));

  for (const enRow of enRows) {
    const koRow = koById.get(rowId(enRow));
    if (!koRow) continue;
    matchedRows += 1;

    const scopes = getAllowedScopes(enRow.fileName, enRow.translation);
    if (scopes.length === 0) continue;
    if (!ALLOWED_KEYS.has(enRow.key)) continue;
    if (!isUsefulEnglishTerm(enRow.translation)) continue;
    if (!isUsefulKoreanTerm(koRow.translation)) continue;
    if (enRow.translation.toLowerCase() === koRow.translation.toLowerCase()) continue;

    candidateRows += 1;
    for (const scope of scopes) {
      scopeCounts[scope] += 1;
    }

    const previous = byEnglish.get(enRow.translation);
    if (previous && previous !== koRow.translation) {
      conflicts.add(enRow.translation);
      continue;
    }

    byEnglish.set(enRow.translation, koRow.translation);
  }

  const entries = Array.from(byEnglish.entries())
    .filter(([en]) => !conflicts.has(en) && !existingEnglish.has(en.toLowerCase()))
    .map(([en, ko]) => ({
      en,
      ko,
      source: "d4analyzer-stringlists",
      confidence: "verified",
    }))
    .sort((a, b) => a.en.localeCompare(b.en));

  return {
    entries,
    report: {
      matchedRows,
      candidateRows,
      uniqueCandidates: byEnglish.size,
      conflicts: conflicts.size,
      newEntries: entries.length,
      scopeRows: scopeCounts,
    },
  };
}

function getAllowedScopes(fileName, english) {
  return Object.entries(ALLOWED_SCOPES)
    .filter(([, pattern]) => pattern.test(fileName) || pattern.test(english))
    .map(([scope]) => scope);
}

function buildRuneEntries(officialEntries, existingEntries) {
  const existingEnglish = new Set(existingEntries.map((entry) => entry.en.toLowerCase()));
  const runeByEnglish = new Map();
  const pattern = /^(.+?) \(3\) -> RANDOM RUNE$/;

  for (const entry of officialEntries) {
    const enMatch = entry.en.match(pattern);
    const koMatch = entry.ko.match(/^(.+?) \(3\) -> 무작위 룬$/);
    if (!enMatch || !koMatch) {
      continue;
    }

    const en = enMatch[1].trim();
    const ko = koMatch[1].trim();
    if (!en || !ko || existingEnglish.has(en.toLowerCase())) {
      continue;
    }

    runeByEnglish.set(en, {
      en,
      ko,
      source: "d4analyzer-stringlists",
      confidence: "verified",
      note: "Derived from Recipe_Recipe_Jeweler_Random_Rune_From_* stringlist entries",
    });
  }

  return Array.from(runeByEnglish.values()).sort((a, b) => a.en.localeCompare(b.en));
}

function buildSuffixEntries(officialEntries, existingEntries) {
  const existingEnglish = new Set(
    [...existingEntries, ...officialEntries].map((entry) => entry.en.toLowerCase()),
  );
  const suffixByEnglish = new Map();

  for (const entry of officialEntries) {
    const enMatch = entry.en.match(/^of\s+(.+)$/i);
    if (!enMatch || !entry.ko.endsWith("의")) {
      continue;
    }

    const en = enMatch[1].trim();
    const ko = entry.ko.replace(/의$/, "").trim();
    if (!en || !ko || existingEnglish.has(en.toLowerCase())) {
      continue;
    }

    suffixByEnglish.set(en, {
      en,
      ko,
      source: "d4analyzer-stringlists",
      confidence: "derived",
      derived: true,
      note: "Derived from official 'of ...' suffix strings by removing English 'of' and Korean trailing '의'",
    });
  }

  return Array.from(suffixByEnglish.values()).sort((a, b) => a.en.localeCompare(b.en));
}

function stringifyGlossary(glossary) {
  const lines = ["{"];
  const topLevelKeys = Object.keys(glossary).filter((key) => key !== "terms");

  topLevelKeys.forEach((key, index) => {
    const rendered = JSON.stringify(glossary[key], null, 2)
      .split("\n")
      .map((line, lineIndex) => (lineIndex === 0 ? `  ${JSON.stringify(key)}: ${line}` : `  ${line}`));
    lines.push(...rendered);
    lines[lines.length - 1] += ",";
    if (index < topLevelKeys.length - 1) {
      lines.push("");
    }
  });

  lines.push('  "terms": [');

  glossary.terms.forEach((group, groupIndex) => {
    lines.push("    {");
    const groupKeys = Object.keys(group).filter((key) => key !== "entries");

    groupKeys.forEach((key) => {
      lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(group[key])},`);
    });

    lines.push('      "entries": [');
    group.entries.forEach((entry, entryIndex) => {
      const suffix = entryIndex === group.entries.length - 1 ? "" : ",";
      lines.push(`        ${JSON.stringify(entry)}${suffix}`);
    });
    lines.push("      ]");
    lines.push(`    }${groupIndex === glossary.terms.length - 1 ? "" : ","}`);
  });

  lines.push("  ]");
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function main() {
  const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, "utf8"));
  glossary.terms = glossary.terms.filter(
    (group) =>
      group.category !== CATEGORY &&
      group.category !== RUNE_CATEGORY &&
      group.category !== SUFFIX_CATEGORY,
  );
  const existingEntries = glossary.terms.flatMap((group) => group.entries);
  const enRows = readStringList(EN_PATH);
  const koRows = readStringList(KO_PATH);
  const { entries, report } = buildOfficialEntries(enRows, koRows, existingEntries);
  const runeEntries = buildRuneEntries(entries, existingEntries);
  const suffixEntries = buildSuffixEntries(entries, [...existingEntries, ...runeEntries]);

  glossary.sources = {
    ...glossary.sources,
    d4analyzer_releases: "https://github.com/DiabloTools/Diablo4Tools-Releases",
    d4analyzer_stringlists: "Battle.net Diablo IV install, Translations table copied from Diablo IV Analyzer",
  };

  glossary.terms.push({
    category: CATEGORY,
    source: "d4analyzer-stringlists",
    confidence: "verified",
    entries,
  });
  glossary.terms.push({
    category: RUNE_CATEGORY,
    source: "d4analyzer-stringlists",
    confidence: "verified",
    entries: runeEntries,
  });
  glossary.terms.push({
    category: SUFFIX_CATEGORY,
    source: "d4analyzer-stringlists",
    confidence: "derived",
    entries: suffixEntries,
  });

  fs.writeFileSync(GLOSSARY_PATH, stringifyGlossary(glossary), "utf8");
  console.log(
    JSON.stringify(
      { ...report, runeEntries: runeEntries.length, suffixEntries: suffixEntries.length },
      null,
      2,
    ),
  );
}

main();
