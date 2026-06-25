"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const links = [
  ["진행 중인 뽑기", "/draws"],
  ["실시간 결과", "/live"],
  ["확률표", "/probabilities"],
  ["최근 당첨", "/results"],
  ["통계", "/stats"],
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm mobile-menu-button" onClick={() => setOpen((value) => !value)} aria-label="메뉴 열기" aria-expanded={open}>
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      <nav className={`mobile-panel ${open ? "open" : ""}`}>
        {links.map(([label, href]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
        ))}
      </nav>
    </>
  );
}
