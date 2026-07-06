import type { NextConfig } from "next";

const publicSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serverSupabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (process.env.VERCEL === "1" && process.env.NODE_ENV === "production" && process.env.DYNAMICD_ALLOW_MISSING_ENV !== "true") {
  if (publicSupabaseKey.startsWith("sb_secret_")) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY에는 sb_publishable_ 키만 넣어야 합니다. sb_secret_ 키가 공개 환경변수에 들어가 있습니다.");
  if (serverSupabaseKey.startsWith("sb_publishable_")) throw new Error("SUPABASE_SECRET_KEY에는 sb_secret_ 키만 넣어야 합니다. sb_publishable_ 키가 서버 환경변수에 들어가 있습니다.");
}

if (process.env.DYNAMICD_STRICT_ENV === "true") {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`DynamicD required env missing: ${missing.join(", ")}`);
}

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vercel.live; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  typescript: { ignoreBuildErrors: true },
  experimental: {
    cpus: 2,
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
