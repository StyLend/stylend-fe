"use client";

import { useRef, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import ConnectWalletButton from "./ConnectWalletButton";
import { gsap } from "@/hooks/useGsap";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/earn": "Earn",
  "/borrow": "Borrow",
  "/trade-collateral": "Trade Collateral",
  "/faucet": "Faucet",
};

function getTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/earn/")) return "Pool Details";
  if (pathname.startsWith("/borrow/")) return "Pool Details";
  return "Dashboard";
}

export default function Header() {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tl = gsap.timeline({ delay: 0.3 });

    if (titleRef.current) {
      gsap.set(titleRef.current, { opacity: 0, x: -20 });
      tl.to(titleRef.current, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" });
    }

    if (actionsRef.current) {
      gsap.set(actionsRef.current, { opacity: 0, y: -10 });
      tl.to(actionsRef.current, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, "-=0.3");
    }

    return () => { tl.kill(); };
  }, [pathname]);

  return (
    <header ref={headerRef} className="flex items-center justify-between px-4 sm:px-6 py-4 sticky top-0 z-20 bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Spacer for mobile hamburger */}
        <div className="w-10 shrink-0 lg:hidden" />
        <h1 key={pathname} ref={titleRef} className="text-lg sm:text-2xl font-bold text-[var(--text-primary)] font-panchang whitespace-nowrap">{title}</h1>
      </div>

      <div ref={actionsRef} className="flex items-center gap-3 shrink-0">
        <ConnectWalletButton />
      </div>
    </header>
  );
}
