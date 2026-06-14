import { readFileSync } from "node:fs";

const cssPath = "src/styles.css";
const css = readFileSync(cssPath, "utf8");
const lines = css.split(/\r?\n/);
const failures = [];

const maxLinesBeforeSplit = 8250;
const maxDatedOverrideBlocks = 10;
const datedOverrideBlocks = css.match(/\/\*\s*20\d{2}-\d{2}-\d{2}/g) ?? [];

if (!css.includes("CSS ARCHITECTURE GUARDRAIL")) {
  failures.push(`${cssPath} must keep the CSS ARCHITECTURE GUARDRAIL header.`);
}

if (lines.length > maxLinesBeforeSplit) {
  failures.push(
    `${cssPath} has ${lines.length} lines. Split or consolidate CSS before exceeding ${maxLinesBeforeSplit} lines.`
  );
}

if (datedOverrideBlocks.length > maxDatedOverrideBlocks) {
  failures.push(
    `${cssPath} has ${datedOverrideBlocks.length} dated override blocks. Consolidate existing rules or create a scoped style module instead of appending another pass.`
  );
}

if (/!important\b/.test(css)) {
  failures.push(`${cssPath} must not use !important. Resolve cascade through ownership and selector scope.`);
}

if (/@import\b/.test(css)) {
  failures.push(`${cssPath} must not use CSS @import. Import style entry files from TypeScript/Vite instead.`);
}

if (/\bTODO\b|\bFIXME\b|\bHACK\b/.test(css)) {
  failures.push(`${cssPath} must not accumulate TODO/FIXME/HACK comments. Move follow-up context into docs/status.md.`);
}

if (failures.length) {
  console.error("CSS guardrail verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `CSS guardrail verification passed. ${cssPath}: ${lines.length} lines, ${datedOverrideBlocks.length} dated override blocks.`
);
