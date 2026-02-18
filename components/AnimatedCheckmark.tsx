"use client";

import { useRef, useEffect } from "react";
import { gsap } from "@/hooks/useGsap";

export default function AnimatedCheckmark({ size = 56 }: { size?: number }) {
  const circleRef = useRef<SVGCircleElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const circle = circleRef.current;
    const check = checkRef.current;
    const glow = glowRef.current;
    if (!circle || !check || !glow) return;

    const circumference = 2 * Math.PI * 22;
    gsap.set(circle, { strokeDasharray: circumference, strokeDashoffset: circumference });
    gsap.set(check, { strokeDasharray: 28, strokeDashoffset: 28 });
    gsap.set(glow, { scale: 0.5, opacity: 0 });

    const tl = gsap.timeline();

    // 1. Glow pulse in
    tl.to(glow, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" }, 0);

    // 2. Circle draws
    tl.to(circle, { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 0.1);

    // 3. Checkmark draws after circle
    tl.to(check, { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, 0.5);

    // 4. Bounce
    tl.fromTo(
      glow,
      { scale: 1 },
      { scale: 1.12, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.inOut" },
      0.7,
    );

    return () => { tl.kill(); };
  }, []);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Glow background */}
      <div
        ref={glowRef}
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.2) 0%, transparent 70%)" }}
      />
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        {/* Circle */}
        <circle
          ref={circleRef}
          cx="24"
          cy="24"
          r="22"
          stroke="#22c55e"
          strokeWidth="2.5"
          fill="rgba(34,197,94,0.08)"
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
        />
        {/* Checkmark */}
        <path
          ref={checkRef}
          d="M15 24l6 6 12-12"
          stroke="#22c55e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
