import s from "../start/start.module.css";

/** The site frame (sage top bar) for pages outside the guided flow. */
export function Shell({ children, narrow = false, current }: { children: React.ReactNode; narrow?: boolean; current?: "tools" | "submit" | "advisor" }) {
  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <a className={s.brand} href="/" style={{ textDecoration: "none" }}>
            MainStreet AI
          </a>
          <span className={s.row} style={{ gap: 18 }}>
            <a className={s.linkInk} href="/tools" aria-current={current === "tools" ? "page" : undefined}>
              Browse tools
            </a>
            <a className={s.linkInk} href="/advisor" aria-current={current === "advisor" ? "page" : undefined}>
              Ask the advisor
            </a>
            <a className={s.linkInk} href="/start">
              Find my AI tools
            </a>
          </span>
        </div>
      </header>
      <main className={`${s.page} ${narrow ? s.narrow : ""}`}>{children}</main>
    </div>
  );
}
