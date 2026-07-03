#!/usr/bin/env node
const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node tools/dynamicd-attack-smoke-check.mjs https://your-domain');
  process.exit(1);
}

const cases = [
  { path: '/.env', ua: 'curl/8.0', expected: [403, 404] },
  { path: '/wp-login.php', ua: 'sqlmap/1.7', expected: [403, 404] },
  { path: '/api/ping?x=<script>alert(1)</script>', ua: 'Mozilla/5.0', expected: [403] },
  { path: '/api/ping?x=1%20union%20select%20password', ua: 'Mozilla/5.0', expected: [403] },
  { path: '/api/ping', ua: 'Mozilla/5.0', expected: [200] },
];

async function check(item) {
  const started = Date.now();
  const response = await fetch(new URL(item.path, baseUrl), { headers: { 'user-agent': item.ua } }).catch((error) => ({ status: 0, error }));
  const ms = Date.now() - started;
  const ok = item.expected.includes(response.status);
  return { ...item, status: response.status, ms, ok };
}

const results = [];
for (const item of cases) results.push(await check(item));
console.table(results.map(({ path, ua, status, ms, ok }) => ({ path, ua, status, ms, ok })));
const failed = results.filter((item) => !item.ok);
if (failed.length) process.exit(1);
