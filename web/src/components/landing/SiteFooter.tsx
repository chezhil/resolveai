import { ArrowUp, ArrowUpRight, GithubLogo } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router";
import { useI18n } from "../../lib/i18n";

const REPO = "https://github.com/chezhil/resolveai";

export function SiteFooter() {
  const { t } = useI18n();
  const { search } = useLocation();
  const to = (pathname: string) => ({ pathname, search });
  const col = "space-y-2.5 text-[14px]";
  const link = "flex w-fit items-center gap-1.5 text-text-2 underline-offset-4 hover:text-ink hover:underline";
  return (
    <footer className="border-t border-ink/15">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <svg viewBox="34 34 188 188" className="h-8 w-8 text-ink" aria-hidden="true">
              <path d="M200.3 98.8A78 78 0 1 1 157.2 55.7" fill="none" stroke="currentColor" strokeWidth="26" />
              <circle cx="183.2" cy="72.8" r="19" fill="currentColor" />
            </svg>
            <span className="font-display text-[20px] font-bold tracking-tight">ResolveAI</span>
          </div>
          <p className="mt-4 max-w-[34ch] text-[14px] leading-relaxed text-text-2">The AI teammate that closes the loop on every stuck rupee. Team TACO-HUNTERS: Saksham Singh, Hamza Shaikh, Chezhil S.</p>
        </div>
        <nav aria-label="Product" className={col}>
          <div className="label text-muted">Product</div>
          <Link className={link} to={to("/app")}>Live console</Link>
          <Link className={link} to={to("/app/analytics")}>Analytics and proof</Link>
          <Link className={link} to={to("/app/evals")}>Evals</Link>
          <Link className={link} to={to("/app/plugins")}>Plugins (MCP)</Link>
        </nav>
        <nav aria-label="Evidence" className={col}>
          <div className="label text-muted">On this page</div>
          <a className={link} href="#how">How it works</a>
          <a className={link} href="#autonomy">Autonomy levels</a>
          <a className={link} href="#proof">Proof</a>
          <a className={link} href="#faq">FAQ</a>
          <a className={link} href="#honest">What is simulated</a>
        </nav>
        <nav aria-label="Project" className={col}>
          <div className="label text-muted">Project</div>
          <a className={link} href={REPO} target="_blank" rel="noreferrer">
            <GithubLogo size={15} aria-hidden /> Source on GitHub <ArrowUpRight size={12} aria-hidden />
          </a>
          <a className={link} href={`${REPO}/blob/main/docs/HANDOFF.md`} target="_blank" rel="noreferrer">Handoff and architecture <ArrowUpRight size={12} aria-hidden /></a>
          <a className={link} href={`${REPO}/blob/main/docs/DEMO.md`} target="_blank" rel="noreferrer">Demo script <ArrowUpRight size={12} aria-hidden /></a>
          <a className={link} href={`${REPO}/blob/main/docs/ResolveAI_Pitch.pdf`} target="_blank" rel="noreferrer">Pitch deck (PDF) <ArrowUpRight size={12} aria-hidden /></a>
        </nav>
      </div>
      <div className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 text-[12.5px] text-text-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>{t("footer.built")}</p>
            <p>{t("footer.disc")}</p>
          </div>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="btn-line self-start px-4 py-2 text-[13px] sm:self-auto">
            <ArrowUp size={14} weight="bold" aria-hidden />
            Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}
