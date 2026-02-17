"use client";

import { useRef, useEffect } from "react";
import { gsap } from "@/hooks/useGsap";

export default function TradeCollateralPage() {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardRef.current) {
      gsap.set(cardRef.current, { opacity: 0, y: 20 });
      gsap.to(cardRef.current, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", delay: 0.2 });
    }
  }, []);

  return (
    <div className="space-y-6">
      <div ref={cardRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trade Collateral</h2>
        </div>

        <div className="px-6 py-16 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center text-[var(--accent)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16l-4-4M20 17H4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Swap your collateral</h3>
              <p className="text-sm text-[var(--text-tertiary)] max-w-md">
                Trade between collateral assets without unwinding your positions. Connect your wallet to get started.
              </p>
            </div>
            <button className="mt-2 px-6 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors cursor-pointer">
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
