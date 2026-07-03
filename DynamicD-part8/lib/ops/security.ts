export type RequestFingerprint = {
  ip: string;
  userAgent: string;
  country?: string | null;
  host?: string | null;
};

const STATIC_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?|ttf|otf)$/i;

const SCANNER_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /acunetix/i,
  /nessus/i,
  /wpscan/i,
  /dirbuster/i,
  /gobuster/i,
  /zgrab/i,
  /python-requests/i,
  /libwww-perl/i,
  /curl\//i,
  /wget\//i,
  /httpclient/i,
  /scrapy/i,
  /headlesschrome/i,
];

const BAD_PATH_PATTERNS = [
  /\/\.env(?:\.|$|\?)/i,
  /\/\.git(?:\/|$)/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/xmlrpc\.php/i,
  /\/phpmyadmin/i,
  /\/vendor\/phpunit/i,
  /\/cgi-bin/i,
  /\/boaform/i,
  /\/adminer/i,
  /<script/i,
  /%3cscript/i,
  /javascript:/i,
  /\.\.\//,
  /\.\.%2f/i,
  /%2e%2e/i,
  /\/etc\/passwd/i,
  /cmd=/i,
  /union(?:\s|%20|\+)+select/i,
  /(?:^|[?&])(select|insert|update|delete|drop|alter)=/i,
  /(?:or|and)(?:\s|%20|\+)+1(?:\s|%20|\+)*=(?:\s|%20|\+)*1/i,
];

const BAD_HEADER_PATTERNS = [
  /<script/i,
  /%3cscript/i,
  /javascript:/i,
  /\.\.\//,
  /union(?:\s|%20|\+)+select/i,
];

export function normalizeIp(value: string | null | undefined) {
  return (value ?? "").split(",")[0]?.trim() || "unknown";
}

export function getClientIp(headers: Headers) {
  // Cloudflare를 나중에 붙여도 같은 함수로 IP를 추적할 수 있게 순서를 고정합니다.
  return normalizeIp(
    headers.get("cf-connecting-ip") ||
      headers.get("true-client-ip") ||
      headers.get("x-vercel-forwarded-for") ||
      headers.get("x-forwarded-for") ||
      headers.get("x-real-ip"),
  );
}

export function getRequestFingerprint(headers: Headers): RequestFingerprint {
  return {
    ip: getClientIp(headers),
    userAgent: headers.get("user-agent") || "unknown",
    country: headers.get("cf-ipcountry") || headers.get("x-vercel-ip-country"),
    host: headers.get("x-forwarded-host") || headers.get("host"),
  };
}

export function isSuspiciousUserAgent(userAgent: string, pathname = "") {
  const ua = (userAgent || "").trim();
  if (!ua && pathname.startsWith("/api")) return true;
  if (ua.length > 600) return true;
  return SCANNER_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

export function inspectAttackSurface(input: { pathname: string; search: string; headers?: Headers }) {
  const { pathname, search, headers } = input;
  if (STATIC_EXT.test(pathname)) return null;

  const fullPath = `${pathname}${search}`;
  if (fullPath.length > 4096) return "PATH_TOO_LONG";
  const pathHit = BAD_PATH_PATTERNS.find((pattern) => pattern.test(fullPath));
  if (pathHit) return `BAD_PATH:${pathHit.source.slice(0, 60)}`;

  if (headers) {
    const values = [headers.get("referer"), headers.get("x-forwarded-host"), headers.get("origin")].filter(Boolean).join(" ");
    const headerHit = BAD_HEADER_PATTERNS.find((pattern) => pattern.test(values));
    if (headerHit) return `BAD_HEADER:${headerHit.source.slice(0, 60)}`;
  }

  return null;
}

export function securityHeaders() {
  return {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-DNS-Prefetch-Control": "on",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vercel.live; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  };
}
