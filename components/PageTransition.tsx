"use client";

import { usePathname } from "next/navigation";
import { useRef, useEffect, useState, useCallback } from "react";
import { gsap } from "@/hooks/useGsap";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayChildren, setDisplayChildren] = useState(children);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const isAnimating = useRef(false);

  const animateIn = useCallback(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
    );
  }, []);

  useEffect(() => {
    // First mount - just animate in
    animateIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pathname === prevPathname) return;
    if (isAnimating.current) return;

    isAnimating.current = true;

    // Animate out current content
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        y: -8,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
          // Swap to new content
          setDisplayChildren(children);
          setPrevPathname(pathname);

          // Animate in new content
          requestAnimationFrame(() => {
            animateIn();
            isAnimating.current = false;
          });
        },
      });
    }
  }, [pathname, children, prevPathname, animateIn]);

  // Update children if same pathname (e.g. state changes within same page)
  useEffect(() => {
    if (pathname === prevPathname) {
      setDisplayChildren(children);
    }
  }, [children, pathname, prevPathname]);

  return (
    <div ref={containerRef}>
      {displayChildren}
    </div>
  );
}
