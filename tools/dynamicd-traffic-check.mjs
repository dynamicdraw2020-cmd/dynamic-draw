#!/usr/bin/env node
/*
Dynamic D traffic checker
사용 예:
  node tools/dynamicd-traffic-check.mjs https://your-domain.vercel.app 30 300 /api/ping
  node tools/dynamicd-traffic-check.mjs https://your-domain.vercel.app 10 100 /api/health

주의: 운영 서버에 과도한 부하를 주지 않도록 처음에는 10~30 동시성으로 시작하세요.
*/

const baseUrl = String(process.argv[2] || "").replace(/\/+$/, "");
const concurrency = Math.max(1, Math.min(Number(process.argv[3] || 20), 500));
const total = Math.max(concurrency, Math.min(Number(process.argv[4] || 200), 50000));
const path = String(process.argv[5] || "/api/ping").startsWith("/") ? String(process.argv[5] || "/api/ping") : `/${process.argv[5]}`;

if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
  console.error("사용법: node tools/dynamicd-traffic-check.mjs https://배포주소 20 200 /api/ping");
  process.exit(1);
}

const target = `${baseUrl}${path}`;
const durations = [];
const statuses = new Map();
let ok = 0;
let failed = 0;
let cursor = 0;

function percentile(values, p) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1));
  return values[index];
}

async function one(index) {
  const started = performance.now();
  try {
    const response = await fetch(`${target}${target.includes("?") ? "&" : "?"}trafficCheck=${Date.now()}-${index}`, {
      headers: { "user-agent": "DynamicD-Traffic-Check/1.7.1" },
      cache: "no-store",
    });
    const ms = performance.now() - started;
    durations.push(ms);
    statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
    if (response.ok) ok += 1;
    else failed += 1;
    await response.arrayBuffer().catch(() => undefined);
  } catch (error) {
    const ms = performance.now() - started;
    durations.push(ms);
    failed += 1;
    statuses.set("NETWORK_ERROR", (statuses.get("NETWORK_ERROR") || 0) + 1);
  }
}

async function worker() {
  while (cursor < total) {
    const current = cursor;
    cursor += 1;
    await one(current);
  }
}

const startedAll = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const totalMs = performance.now() - startedAll;
durations.sort((a, b) => a - b);
const sum = durations.reduce((a, b) => a + b, 0);
const rps = total / (totalMs / 1000);

const report = {
  target,
  total,
  concurrency,
  ok,
  failed,
  successRate: `${((ok / total) * 100).toFixed(2)}%`,
  rps: Number(rps.toFixed(2)),
  totalSeconds: Number((totalMs / 1000).toFixed(2)),
  latencyMs: {
    min: Number((durations[0] || 0).toFixed(1)),
    avg: Number((sum / durations.length || 0).toFixed(1)),
    p50: Number(percentile(durations, 50).toFixed(1)),
    p90: Number(percentile(durations, 90).toFixed(1)),
    p95: Number(percentile(durations, 95).toFixed(1)),
    p99: Number(percentile(durations, 99).toFixed(1)),
    max: Number((durations[durations.length - 1] || 0).toFixed(1)),
  },
  statuses: Object.fromEntries(statuses),
  verdict:
    failed > 0
      ? "FAIL_OR_DEGRADED: 오류가 있습니다. 동시성을 낮추거나 Vercel/Supabase 로그를 확인하세요."
      : percentile(durations, 95) < 1000
        ? "PASS: p95 1초 미만으로 양호합니다."
        : "WATCH: 성공은 했지만 p95가 1초 이상입니다. DB 병목 가능성을 확인하세요.",
};

console.log(JSON.stringify(report, null, 2));
