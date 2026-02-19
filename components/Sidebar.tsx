"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { gsap } from "@/hooks/useGsap";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M1 1h5v5H1zM8 8h5v5H8zM8 1h5v5H8zM1 8h5v5H1z" />
      </svg>
    ),
  },
  {
    label: "Earn",
    href: "/earn",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <rect x="1" y="1" width="12" height="12" rx="2" />
      </svg>
    ),
  },
  {
    label: "Borrow",
    href: "/borrow",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 1l6 11H1L7 1z" />
      </svg>
    ),
  },
  {
    label: "Trade Collateral",
    href: "/trade-collateral",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 0.5l6.5 6.5-6.5 6.5L0.5 7 7 0.5z" />
      </svg>
    ),
  },
  {
    label: "Faucet",
    href: "/faucet",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="7" cy="7" r="6" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const iconRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const isFirstRender = useRef(true);
  const prevActiveIndex = useRef(-1);

  // Mobile fullscreen refs
  const hamburgerLine1 = useRef<SVGLineElement>(null);
  const hamburgerLine2 = useRef<SVGLineElement>(null);
  const hamburgerLine3 = useRef<SVGLineElement>(null);
  const mobileOverlayRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileSocialsRef = useRef<HTMLDivElement>(null);
  const mobileLogoRef = useRef<HTMLDivElement>(null);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname]
  );

  // Move indicator to active item (desktop sidebar)
  useEffect(() => {
    const activeIndex = navItems.findIndex((item) => isActive(item.href));
    const activeEl = itemRefs.current[activeIndex];
    const indicator = indicatorRef.current;
    const navList = navListRef.current;

    if (!activeEl || !indicator || !navList) return;

    const navRect = navList.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();

    const top = itemRect.top - navRect.top;
    const height = itemRect.height;

    if (isFirstRender.current) {
      gsap.set(indicator, { y: top, height, opacity: 1 });
      prevActiveIndex.current = activeIndex;
      isFirstRender.current = false;
    } else {
      gsap.to(indicator, {
        y: top,
        height,
        opacity: 1,
        duration: 0.35,
        ease: "power3.out",
      });

      // Animate icon on route change
      const iconEl = iconRefs.current[activeIndex];
      if (iconEl && activeIndex !== prevActiveIndex.current) {
        const oldIconEl = iconRefs.current[prevActiveIndex.current];
        if (oldIconEl) {
          gsap.to(oldIconEl, { scale: 1, rotation: 0, duration: 0.3, ease: "power2.out" });
        }
        gsap.fromTo(iconEl,
          { scale: 0.3, rotation: -180 },
          { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(1.7)" }
        );
      }
      prevActiveIndex.current = activeIndex;
    }
  }, [pathname, isActive]);

  // Desktop sidebar mount animations
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    if (logoRef.current) {
      gsap.set(logoRef.current, { opacity: 0, x: -20 });
      tl.to(logoRef.current, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" });
    }

    if (navRef.current) {
      const items = navRef.current.querySelectorAll("li");
      gsap.set(items, { opacity: 0, x: -20 });
      tl.to(items, { opacity: 1, x: 0, duration: 0.4, stagger: 0.08, ease: "power3.out" }, "-=0.2");
    }

    if (bottomRef.current) {
      gsap.set(bottomRef.current, { opacity: 0, y: 15 });
      tl.to(bottomRef.current, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, "-=0.1");
    }
  }, []);

  // GSAP hamburger animation + fullscreen menu open/close
  useEffect(() => {
    const l1 = hamburgerLine1.current;
    const l2 = hamburgerLine2.current;
    const l3 = hamburgerLine3.current;
    const overlay = mobileOverlayRef.current;
    const nav = mobileNavRef.current;
    const socials = mobileSocialsRef.current;
    const logo = mobileLogoRef.current;

    if (!l1 || !l2 || !l3) return;

    if (mobileOpen) {
      // Hamburger → X
      gsap.to(l1, { attr: { y1: 6, y2: 18, x1: 6, x2: 18 }, duration: 0.35, ease: "power3.inOut" });
      gsap.to(l2, { opacity: 0, duration: 0.15, ease: "power2.in" });
      gsap.to(l3, { attr: { y1: 18, y2: 6, x1: 6, x2: 18 }, duration: 0.35, ease: "power3.inOut" });

      // Fullscreen overlay in
      if (overlay) {
        gsap.set(overlay, { display: "flex", opacity: 0 });
        gsap.to(overlay, { opacity: 1, duration: 0.4, ease: "power2.out" });
      }

      // Logo
      if (logo) {
        gsap.fromTo(logo, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.15, ease: "power3.out" });
      }

      // Nav items stagger in
      if (nav) {
        const items = nav.querySelectorAll<HTMLElement>(".mobile-nav-item");
        gsap.fromTo(items,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, delay: 0.2, ease: "power3.out" }
        );
      }

      // Socials
      if (socials) {
        gsap.fromTo(socials,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5, delay: 0.5, ease: "power3.out" }
        );
      }
    } else {
      // X → Hamburger
      gsap.to(l1, { attr: { y1: 7, y2: 7, x1: 3, x2: 21 }, duration: 0.35, ease: "power3.inOut" });
      gsap.to(l2, { opacity: 1, duration: 0.2, delay: 0.15, ease: "power2.out" });
      gsap.to(l3, { attr: { y1: 17, y2: 17, x1: 3, x2: 21 }, duration: 0.35, ease: "power3.inOut" });

      // Fullscreen overlay out
      if (overlay) {
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => { gsap.set(overlay, { display: "none" }); },
        });
      }
    }
  }, [mobileOpen]);

  const handleMobileNav = () => {
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <line ref={hamburgerLine1} x1="3" y1="7" x2="21" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line ref={hamburgerLine2} x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line ref={hamburgerLine3} x1="3" y1="17" x2="21" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Mobile fullscreen overlay */}
      <div
        ref={mobileOverlayRef}
        className="lg:hidden fixed inset-0 z-40 flex-col items-center justify-center bg-[rgba(2,4,12,0.97)] backdrop-blur-xl"
        style={{ display: "none" }}
      >
        {/* Logo */}
        <div ref={mobileLogoRef} className="flex items-center gap-3 mb-12">
          <Image
            src="/stylend-logo-blue.webp"
            alt="Stylend"
            width={40}
            height={40}
            className="rounded-full"
          />
          <span className="text-xl font-bold text-[var(--text-primary)] font-panchang">Stylend</span>
        </div>

        {/* Nav items */}
        <div ref={mobileNavRef} className="flex flex-col items-center gap-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={handleMobileNav}
                className={`mobile-nav-item flex items-center gap-3 px-8 py-3.5 rounded-2xl text-base font-medium transition-colors ${
                  active
                    ? "text-[var(--accent)] bg-[var(--accent-glow)] border border-[var(--accent-border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.05]"
                }`}
              >
                <span className="inline-flex">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Social links */}
        <div ref={mobileSocialsRef} className="flex items-center gap-6 mt-12 text-[var(--text-tertiary)]">
          <a href="https://x.com/stylendX" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-primary)] transition-colors p-2">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
            </svg>
          </a>
          <a href="https://github.com/StyLend" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-primary)] transition-colors p-2">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a href="https://github.com/StyLend" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-primary)] transition-colors p-2">
            <svg width="24" height="24" viewBox="0 0 67 65" fill="none">
              <path d="M28.2156 34.2196C31.3447 36.0256 32.9093 36.9286 34.6275 36.9301C36.3457 36.9316 37.9119 36.0313 41.0442 34.2308L61.0106 22.7535C61.912 22.2354 62.4677 21.275 62.4677 20.2353C62.4677 19.1956 61.912 18.2352 61.0106 17.7171L41.0369 6.2356C37.908 4.43701 36.3436 3.53772 34.627 3.53839C32.9105 3.53906 31.3467 4.43957 28.2192 6.24059L11.0485 16.1286C10.9213 16.2019 10.8576 16.2386 10.7983 16.2733C4.93295 19.7069 1.30914 25.9755 1.26068 32.7718C1.26019 32.8405 1.26019 32.9139 1.26019 33.0608C1.26019 33.2074 1.26019 33.2808 1.26068 33.3494C1.30903 40.1381 4.92476 46.4008 10.7797 49.8371C10.8389 49.8718 10.9024 49.9085 11.0294 49.9819L21.7851 56.1919C28.0524 59.8104 31.1861 61.6197 34.6273 61.6209C38.0686 61.622 41.2034 59.8149 47.4732 56.2005L58.8273 49.6552C61.9667 47.8454 63.5363 46.9406 64.3983 45.4488C65.2602 43.957 65.2602 42.1452 65.2602 38.5215V31.5212C65.2602 30.516 64.7157 29.5896 63.8375 29.1004C62.9876 28.6271 61.9517 28.6341 61.1083 29.1189L37.8267 42.5019C36.2646 43.3998 35.4836 43.8488 34.6265 43.8491C33.7694 43.8493 32.9881 43.4008 31.4255 42.5039L15.6679 33.4587C14.8786 33.0056 14.4839 32.779 14.167 32.7381C13.4443 32.6448 12.7493 33.0497 12.474 33.7244C12.3533 34.0203 12.3557 34.4754 12.3606 35.3855C12.3642 36.0555 12.366 36.3905 12.4287 36.6987C12.5689 37.3888 12.932 38.0136 13.462 38.4772C13.6987 38.6842 13.9889 38.8517 14.5692 39.1866L31.4167 48.9103C32.9833 49.8145 33.7666 50.2666 34.6268 50.2669C35.4869 50.2671 36.2705 49.8154 37.8376 48.9121L58.4877 37.0086C59.023 36.7 59.2906 36.5457 59.4913 36.6617C59.692 36.7777 59.692 37.0866 59.692 37.7045V40.8796C59.692 41.7856 59.692 42.2385 59.4765 42.6115C59.261 42.9844 58.8686 43.2106 58.0837 43.6631L41.0514 53.4811C37.9158 55.2886 36.3481 56.1923 34.6271 56.1915C32.9062 56.1907 31.3392 55.2856 28.2053 53.4752L12.2702 44.2702C12.2196 44.2409 12.1943 44.2263 12.1707 44.2125C8.82948 42.2601 6.76784 38.6883 6.7485 34.8185C6.74836 34.7912 6.74836 34.762 6.74836 34.7035V31.7889C6.74836 29.6526 7.88613 27.678 9.73437 26.6067C11.3675 25.6601 13.382 25.6582 15.017 26.6018L28.2156 34.2196Z" stroke="currentColor" strokeWidth="2" />
            </svg>
          </a>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        className="hidden lg:flex fixed top-0 left-0 h-full z-40 w-[var(--sidebar-width)] bg-[rgba(8,12,28,0.65)] backdrop-blur-md border-r border-white/[0.08] flex-col"
      >
        {/* Logo */}
        <div ref={logoRef} className="p-5 flex items-center gap-3">
          <Image
            src="/stylend-logo-blue.webp"
            alt="Stylend"
            width={32}
            height={32}
            className="rounded-full"
          />
          <span className="text-lg font-bold text-[var(--text-primary)] font-panchang">Stylend</span>
        </div>

        {/* Navigation */}
        <nav ref={navRef} className="flex-1 pt-6 px-3 overflow-y-auto">
          <ul ref={navListRef} className="space-y-1 relative">
            {/* Floating active indicator */}
            <div
              ref={indicatorRef}
              className="absolute left-0 right-0 rounded-full border border-[var(--accent)] bg-[var(--accent-glow)] pointer-events-none z-0"
              style={{ opacity: 0 }}
            />

            {navItems.map((item, index) => {
              const active = isActive(item.href);
              return (
                <li key={item.label} className="relative z-10">
                  <Link
                    ref={(el) => { itemRefs.current[index] = el; }}
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-150
                      ${
                        active
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                      }
                    `}
                  >
                    <span ref={(el) => { iconRefs.current[index] = el; }} className="inline-flex">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div ref={bottomRef} className="p-4 border-t border-white/[0.08]">
          <div className="flex items-center justify-center gap-3 text-[var(--text-tertiary)]">
            {/* X/Twitter */}
            <a href="https://x.com/stylendX" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-secondary)] transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
              </svg>
            </a>
            {/* GitHub */}
            <a href="https://github.com/StyLend" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-secondary)] transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            {/* GitBook */}
            <a href="https://github.com/StyLend" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-secondary)] transition-colors">
              <svg width="20" height="20" viewBox="0 0 67 65" fill="none">
                <path d="M28.2156 34.2196C31.3447 36.0256 32.9093 36.9286 34.6275 36.9301C36.3457 36.9316 37.9119 36.0313 41.0442 34.2308L61.0106 22.7535C61.912 22.2354 62.4677 21.275 62.4677 20.2353C62.4677 19.1956 61.912 18.2352 61.0106 17.7171L41.0369 6.2356C37.908 4.43701 36.3436 3.53772 34.627 3.53839C32.9105 3.53906 31.3467 4.43957 28.2192 6.24059L11.0485 16.1286C10.9213 16.2019 10.8576 16.2386 10.7983 16.2733C4.93295 19.7069 1.30914 25.9755 1.26068 32.7718C1.26019 32.8405 1.26019 32.9139 1.26019 33.0608C1.26019 33.2074 1.26019 33.2808 1.26068 33.3494C1.30903 40.1381 4.92476 46.4008 10.7797 49.8371C10.8389 49.8718 10.9024 49.9085 11.0294 49.9819L21.7851 56.1919C28.0524 59.8104 31.1861 61.6197 34.6273 61.6209C38.0686 61.622 41.2034 59.8149 47.4732 56.2005L58.8273 49.6552C61.9667 47.8454 63.5363 46.9406 64.3983 45.4488C65.2602 43.957 65.2602 42.1452 65.2602 38.5215V31.5212C65.2602 30.516 64.7157 29.5896 63.8375 29.1004C62.9876 28.6271 61.9517 28.6341 61.1083 29.1189L37.8267 42.5019C36.2646 43.3998 35.4836 43.8488 34.6265 43.8491C33.7694 43.8493 32.9881 43.4008 31.4255 42.5039L15.6679 33.4587C14.8786 33.0056 14.4839 32.779 14.167 32.7381C13.4443 32.6448 12.7493 33.0497 12.474 33.7244C12.3533 34.0203 12.3557 34.4754 12.3606 35.3855C12.3642 36.0555 12.366 36.3905 12.4287 36.6987C12.5689 37.3888 12.932 38.0136 13.462 38.4772C13.6987 38.6842 13.9889 38.8517 14.5692 39.1866L31.4167 48.9103C32.9833 49.8145 33.7666 50.2666 34.6268 50.2669C35.4869 50.2671 36.2705 49.8154 37.8376 48.9121L58.4877 37.0086C59.023 36.7 59.2906 36.5457 59.4913 36.6617C59.692 36.7777 59.692 37.0866 59.692 37.7045V40.8796C59.692 41.7856 59.692 42.2385 59.4765 42.6115C59.261 42.9844 58.8686 43.2106 58.0837 43.6631L41.0514 53.4811C37.9158 55.2886 36.3481 56.1923 34.6271 56.1915C32.9062 56.1907 31.3392 55.2856 28.2053 53.4752L12.2702 44.2702C12.2196 44.2409 12.1943 44.2263 12.1707 44.2125C8.82948 42.2601 6.76784 38.6883 6.7485 34.8185C6.74836 34.7912 6.74836 34.762 6.74836 34.7035V31.7889C6.74836 29.6526 7.88613 27.678 9.73437 26.6067C11.3675 25.6601 13.382 25.6582 15.017 26.6018L28.2156 34.2196Z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
