"use client";

import { useEffect, useRef, useCallback } from "react";
import { gsap } from "gsap";

/** Stagger-reveal children of a container ref */
export function useStaggerChildren(
  containerRef: React.RefObject<HTMLElement | null>,
  childSelector: string,
  options?: { delay?: number; stagger?: number; y?: number; duration?: number }
) {
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !containerRef.current) return;
    hasAnimated.current = true;

    const items = containerRef.current.querySelectorAll(childSelector);
    if (items.length === 0) return;

    const { delay = 0.1, stagger = 0.06, y = 20, duration = 0.5 } = options || {};

    gsap.set(items, { opacity: 0, y });
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration,
      stagger,
      ease: "power3.out",
      delay,
    });
  }, [containerRef, childSelector, options]);
}

/** Fade-in + slide-up a single element */
export function useFadeIn(ref: React.RefObject<HTMLElement | null>, delay = 0) {
  useEffect(() => {
    if (!ref.current) return;

    gsap.set(ref.current, { opacity: 0, y: 30 });
    gsap.to(ref.current, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: "power3.out",
      delay,
    });
  }, [ref, delay]);
}

/** Slide-in from any direction */
export function useSlideIn(
  ref: React.RefObject<HTMLElement | null>,
  direction: "left" | "right" | "up" | "down" = "up",
  delay = 0
) {
  useEffect(() => {
    if (!ref.current) return;

    const from: gsap.TweenVars = { opacity: 0 };
    if (direction === "left") from.x = -40;
    if (direction === "right") from.x = 40;
    if (direction === "up") from.y = 40;
    if (direction === "down") from.y = -40;

    gsap.set(ref.current, from);
    gsap.to(ref.current, {
      opacity: 1,
      x: 0,
      y: 0,
      duration: 0.7,
      ease: "power3.out",
      delay,
    });
  }, [ref, direction, delay]);
}

/** Stagger-reveal table/list rows on mount */
export function useRowStagger(
  containerRef: React.RefObject<HTMLElement | null>,
  rowSelector: string,
  delay = 0.15
) {
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !containerRef.current) return;
    hasAnimated.current = true;

    const rows = containerRef.current.querySelectorAll(rowSelector);
    if (rows.length === 0) return;

    gsap.set(rows, { opacity: 0, x: -15 });
    gsap.to(rows, {
      opacity: 1,
      x: 0,
      duration: 0.4,
      stagger: 0.04,
      ease: "power2.out",
      delay,
    });
  }, [containerRef, rowSelector, delay]);
}

/** Scale-in animation (for cards, badges) */
export function useScaleIn(ref: React.RefObject<HTMLElement | null>, delay = 0) {
  useEffect(() => {
    if (!ref.current) return;

    gsap.set(ref.current, { opacity: 0, scale: 0.9 });
    gsap.to(ref.current, {
      opacity: 1,
      scale: 1,
      duration: 0.5,
      ease: "back.out(1.7)",
      delay,
    });
  }, [ref, delay]);
}

export { gsap };
