#!/usr/bin/env node
function pick(...names) {
  for (const name of names) {
    const value = (process.env[name] || '').trim();
    if (value && value.length > 10 && !value.includes('YOUR_') && !value.includes('CHANGE_THIS')) return { name, value };
  }
  return null;
}
const checks = [
  { label: 'Supabase URL', hit: pick('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'), validate: (v) => /^https?:\/\//.test(v) },
  { label: 'Supabase publishable/anon key', hit: pick('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'), validate: (v) => v.length > 20 },
  { label: 'Supabase service role/secret key', hit: pick('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), validate: (v) => v.length > 20 },
];
const problems = [];
for (const item of checks) {
  if (!item.hit) problems.push(`${item.label}: missing`);
  else if (!item.validate(item.hit.value)) problems.push(`${item.label}: invalid (${item.hit.name})`);
}
if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems, hint: 'Vercel Project Settings > Environment Variables를 확인하세요.' }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, message: 'DynamicD 운영 필수 환경변수 확인 완료' }, null, 2));
