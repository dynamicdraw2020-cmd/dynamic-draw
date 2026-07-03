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

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = pad2(kst.getUTCMonth() + 1);
  const day = pad2(kst.getUTCDate());
  const hour24 = kst.getUTCHours();
  const minute = pad2(kst.getUTCMinutes());
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;
  return `${year}. ${month}. ${day}. ${period} ${pad2(hour12)}:${minute}`;
}

export function formatDateOnly(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
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
