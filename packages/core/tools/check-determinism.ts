// Determinism enforcement check for materialization-path code.
// Scans core files for non-deterministic API usage.
// Run: deno run --allow-read packages/core/tools/check-determinism.ts

const MATERIALIZATION_FILES = [
  "core/edits/base.ts",
  "core/edits/tree-edits.ts",
  "core/edits/record-edits.ts",
  "core/edits/list-edits.ts",
  "core/edits/unwrap-edits.ts",
  "core/edits/value-edits.ts",
  "core/event.ts",
  "core/nodes/base.ts",
  "core/nodes/record-node.ts",
  "core/nodes/list-node.ts",
  "core/nodes/primitive-node.ts",
  "core/nodes/reference-node.ts",
  "core/selector.ts",
  "core/vector-clock.ts",
];

// Allow-listed usages: file → list of pattern names that are known-safe.
// Each entry documents WHY it is safe.
const ALLOWLIST: Record<string, string[]> = {
  // VectorClock constructor: Object.entries to copy entries — order irrelevant,
  // we only store key-value pairs into a fresh record.
  // VectorClock.dominates: Object.entries + .every — predicate is order-independent.
  // VectorClock.merge: Object.entries — Math.max per peer, order-independent.
  // VectorClock.equals: Object.keys for length check only; per-key equality follows.
  // VectorClock.entryRecords: returns pairs for serialization — consumers must not
  // rely on order (and the toRecord() consumer re-indexes by peer).
  "core/vector-clock.ts": ["Object.keys", "Object.entries"],

  // RecordNode.equals: Object.keys for length check only; per-key equality follows.
  "core/nodes/record-node.ts": ["Object.keys"],

  // Event.validate: Object.entries on clock.toRecord() — validates each entry
  // independently, order does not matter.
  "core/event.ts": ["Object.entries"],
};

const BANNED_PATTERNS: { pattern: RegExp; name: string; reason: string }[] = [
  {
    pattern: /\bObject\.keys\b/,
    name: "Object.keys",
    reason: "Iteration order may vary across engines",
  },
  {
    pattern: /\bObject\.entries\b/,
    name: "Object.entries",
    reason: "Iteration order may vary across engines",
  },
  {
    pattern: /\bObject\.values\b/,
    name: "Object.values",
    reason: "Iteration order may vary across engines",
  },
  {
    pattern: /\bfor\s*\(\s*\w+\s+in\b/,
    name: "for..in",
    reason: "Iteration order may vary across engines",
  },
  {
    pattern: /\bMath\.random\b/,
    name: "Math.random",
    reason: "Non-deterministic",
  },
  { pattern: /\bDate\.now\b/, name: "Date.now", reason: "Non-deterministic" },
  { pattern: /\bnew\s+Date\b/, name: "new Date", reason: "Non-deterministic" },
  {
    pattern: /\bcrypto\.randomUUID\b/,
    name: "crypto.randomUUID",
    reason: "Non-deterministic",
  },
];

interface Violation {
  file: string;
  line: number;
  patternName: string;
  reason: string;
  text: string;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

async function checkFile(
  filePath: string,
): Promise<Violation[]> {
  const allowedPatterns = ALLOWLIST[filePath] ?? [];
  let content: string;
  try {
    content = await Deno.readTextFile(filePath);
  } catch {
    // File doesn't exist — not a violation, just skip.
    return [];
  }

  const violations: Violation[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;

    for (const banned of BANNED_PATTERNS) {
      if (banned.pattern.test(line)) {
        if (allowedPatterns.includes(banned.name)) continue;
        violations.push({
          file: filePath,
          line: i + 1,
          patternName: banned.name,
          reason: banned.reason,
          text: line.trim(),
        });
      }
    }
  }

  return violations;
}

async function main(): Promise<void> {
  const allViolations: Violation[] = [];

  for (const file of MATERIALIZATION_FILES) {
    const violations = await checkFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log(
      `✅ Determinism check passed — ${MATERIALIZATION_FILES.length} files clean.`,
    );
    Deno.exit(0);
  } else {
    console.error(
      `❌ Determinism check failed — ${allViolations.length} violation(s):`,
    );
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line}  [${v.patternName}] ${v.reason}`);
      console.error(`    ${v.text}`);
    }
    Deno.exit(1);
  }
}

main();
