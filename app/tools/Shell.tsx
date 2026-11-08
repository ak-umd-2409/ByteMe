import s from "../start/start.module.css";

/** The site frame for pages outside the guided flow. */
export function Shell({ children, narrow = false, current }: { children: React.ReactNode; narrow?: boolean; current?: "tools" | "submit" }) {
  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <a className={s.brand} href="/" style={{ textDecoration: "none" }}>
            <span className={s.brandMark} aria-hidden="true">m<span>✳</span></span>
            <span>MainStreet<span className={s.brandAccent}>AI</span></span>
          </a>
          <span className={s.headerNav}>
            <a className={s.linkInk} href="/tools" aria-current={current === "tools" ? "page" : undefined}>
              Browse tools
            </a>
            <a className={s.headerCta} href="/">
              Get started <span aria-hidden="true">↗</span>
            </a>
          </span>
        </div>
      </header>
      <main className={`${s.page} ${narrow ? s.narrow : ""}`}>{children}</main>
    </div>
  );
}
