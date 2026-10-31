import { useEffect, useRef } from "react";

/**
 * Adds `.in` to every `.reveal` descendant as it enters the viewport (once).
 * Motion purpose: sequence the page so each claim lands as the reader reaches it.
 *
 * An IntersectionObserver alone is not enough: it never fires for an element the reader jumps straight past (a fast scroll, a
 * deep link such as /#proof, an anchor click), so that element would stay invisible when scrolled back to. A throttled scroll
 * sweep therefore also reveals everything that is at or above the fold. Elements are shown at once if the observer is unavailable.
 */
export function useReveal<T extends HTMLElement>() {
  const root = useRef<T>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = new Set(Array.from(el.querySelectorAll<HTMLElement>(".reveal")));
    const show = (n: HTMLElement) => {
      n.classList.add("in");
      items.delete(n);
    };
    if (typeof IntersectionObserver === "undefined") {
      [...items].forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            show(e.target as HTMLElement);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    items.forEach((i) => io.observe(i));

    let raf = 0;
    const sweep = () => {
      raf = 0;
      const line = innerHeight * 0.94;
      for (const n of [...items]) {
        if (n.getBoundingClientRect().top < line) {
          show(n);
          io.unobserve(n);
        }
      }
    };
    const on = () => {
      if (!raf && items.size) raf = requestAnimationFrame(sweep);
    };
    addEventListener("scroll", on, { passive: true });
    addEventListener("hashchange", on);
    on(); // a deep link lands mid-page: everything above it must already be revealed
    return () => {
      io.disconnect();
      removeEventListener("scroll", on);
      removeEventListener("hashchange", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return root;
}
