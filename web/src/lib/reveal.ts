import { useEffect, useRef } from "react";

/**
 * Adds `.in` to every `.reveal` descendant as it enters the viewport (once).
 * Motion purpose: sequence the page so each claim lands as the reader reaches it.
 * IntersectionObserver, not a scroll listener; elements are shown at once if it is unavailable.
 */
export function useReveal<T extends HTMLElement>() {
  const root = useRef<T>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(".reveal"));
    if (typeof IntersectionObserver === "undefined") {
      items.forEach((i) => i.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);
  return root;
}
