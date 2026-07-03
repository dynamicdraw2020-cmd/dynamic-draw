"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const groups = [
  { title: "주요 기능", links: [["공지", "/notices"], ["이벤트", "/events"], ["뽑기 & 교환", "/play"], ["보상 센터", "/rewards"]] },
  { title: "확인", links: [["랭킹", "/rankings"], ["통계", "/dashboard"], ["추첨 이벤트", "/raffles"], ["최근 결과", "/results"]] },
  { title: "소통", links: [["문의센터", "/support"], ["커뮤니티", "/community"], ["당첨 후기", "/reviews"]] },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm mobile-menu-button" onClick={() => setOpen((value) => !value)} aria-label="메뉴 열기" aria-expanded={open}>
        {open ? <X size={18} /> : <Menu size={18} />} 메뉴
      </button>
      <nav className={`mobile-panel simple-mobile-panel phone-menu ${open ? "open" : ""}`}>
        {groups.map((group, index) => (
          <details key={group.title} className="mobile-menu-group" open={index === 0}>
            <summary>{group.title}</summary>
            <div>
              {group.links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
            </div>
          </details>
        ))}
      </nav>
    </>
  );
}
