#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || process.cwd();
const patterns = [
  /export\s*\{[^}\n]*(dynamic|runtime|maxDuration)[^}\n]*\}\s*from\s*["'][^"']+["']\s*;?/,
  /export\s*\{\s*dynamic\b/,
  /export\s*\{\s*runtime\b/,
  /export\s*\{\s*maxDuration\b/,
];
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist", "build"].includes(name)) continue;
    const file = join(dir, name);
    const st = statSync(file);
    if (st.isDirectory()) {
      walk(file);
      continue;
    }
    if (!/route\.(ts|tsx|js|jsx)$/.test(name) && !/\.(ts|tsx)$/.test(name)) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(lines[i]))) {
        hits.push(`${file}:${i + 1}: ${lines[i].trim()}`);
      }
    }
  }
}

walk(root);

if (hits.length > 0) {
  console.error("Next.js 16 route config re-export 패턴이 발견되었습니다.");
  for (const hit of hits) console.error(hit);
  process.exit(1);
}

console.log("OK: Next.js 16 route config re-export 패턴이 없습니다.");
