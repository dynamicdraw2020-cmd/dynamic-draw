import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function probabilityToPercent(units: number) {
  return units / 10_000;
}

export function percentToProbability(value: number) {
  return Math.round(value * 10_000);
}

export function formatPercent(value: number, digits = 2) {
  return `${value.toFixed(digits).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function maskName(name: string | null) {
  if (!name) return "참가자";
  if (name.length <= 1) return `${name}*`;
  return `${name[0]}${"*".repeat(Math.min(name.length - 1, 3))}`;
}

export function maskMemberCode(code: string | null) {
  if (!code) return "DD-****";
  const last = code.slice(-4);
  return `DD-****-${last}`;
}

export function safeJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value === "string") return JSON.parse(value) as T;
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}
