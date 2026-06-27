"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const links = [
  ["공지", "/notices"],
  ["이벤트", "/events"],
  ["전체 추첨", "/raffles"],
  ["직접 참여", "/play"],
  ["운영 안내", "/probabilities"],
  ["최근 결과", "/results"],
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
