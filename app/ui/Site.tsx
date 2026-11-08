/**
 * The site frame shared by every page: logo, header with minimal nav, footer.
 * No hooks, so it works inside server and client components alike.
 */
import f from "./site.module.css";

/** The MainStreet AI mark: a shopfront awning with the advisor's spark beneath it. */
export function Mark({ className = f.mark }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#590907" />
      <path
        d="M6.5 9h19l2 5a2.875 2.875 0 0 1-5.75 0a2.875 2.875 0 0 1-5.75 0a2.875 2.875 0 0 1-5.75 0a2.875 2.875 0 0 1-5.75 0z"
        fill="#f6efe4"
      />
      <path d="M12.3 9.2 11.2 14M19.7 9.2l1.1 4.8" stroke="#590907" strokeWidth="1.1" opacity="0.35" />
      <path d="M16 18.6l1.15 2.75 2.75 1.15-2.75 1.15L16 26.4l-1.15-2.75-2.75-1.15 2.75-1.15z" fill="#e8d2b5" />
    </svg>
  );
}

export function Brand() {
  return (
    <a className={f.brand} href="/" aria-label="MainStreet AI, home">
      <Mark />
      <span className={f.word}>
        MainStreet<span className={f.ai}>AI</span>
      </span>
    </a>
  );
}

export type Current = "home" | "tools" | "advisor" | "submit";

/**
 * Header. `right` replaces the nav (the guided flow uses it for "Start over" so nothing
 * else pulls the owner out mid-task).
 */
export function SiteHeader({ current, right }: { current?: Current; right?: React.ReactNode }) {
  return (
    <header className={f.header}>
      <div className={f.inner}>
        <Brand />
        {right ?? (
          <nav className={f.nav} aria-label="Main">
            <a className={f.link} href="/tools" aria-current={current === "tools" ? "page" : undefined}>
              Checked tools
            </a>
            <a className={f.link} href="/advisor" aria-current={current === "advisor" ? "page" : undefined}>
              Advisor
            </a>
            <a className={f.cta} href="/start">
              Get started
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={f.footer}>
      <div className={f.footInner}>
        <Brand />
        <nav className={f.footNav} aria-label="More">
          <a href="/tools">Checked tools</a>
          <a href="/advisor">Business Advisor</a>
          <a href="/submit">List your AI tool</a>
          <a href="/admin">For reviewers</a>
        </nav>
        <p className={f.fine}>
          A student prototype by Team ByteMe, University of Maryland. Not affiliated with the Maryland SBDC, SCORE or any tool we list. No security certification. Not legal
          advice.
        </p>
      </div>
    </footer>
  );
}

export const siteStyles = f;
