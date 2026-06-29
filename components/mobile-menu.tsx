"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const groups = [
  { title: "바로가기", links: [["공지", "/notices"], ["이벤트", "/events"], ["직접 참여", "/play"], ["보상", "/rewards"]] },
  { title: "확인", links: [["순위", "/rankings"], ["대시보드", "/dashboard"], ["당첨 후기", "/reviews"], ["최근 결과", "/results"]] },
  { title: "소통", links: [["문의센터", "/support"], ["커뮤니티", "/community"], ["전체 추첨", "/raffles"]] },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm mobile-menu-button" onClick={() => setOpen((value) => !value)} aria-label="메뉴 열기" aria-expanded={open}>
        {open ? <X size={18} /> : <Menu size={18} />} 메뉴
      </button>
      <nav className={`mobile-panel simple-mobile-panel ${open ? "open" : ""}`}>
        {groups.map((group) => (
          <section key={group.title} className="mobile-menu-group">
            <strong>{group.title}</strong>
            <div>
              {group.links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
            </div>
          </section>
        ))}
      </nav>
    </>
  );
}
