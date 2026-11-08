import s from "../start/start.module.css";
import { SiteFooter, SiteHeader, type Current } from "../ui/Site.tsx";
import { SiteAdvisor } from "../ui/SiteAdvisor.tsx";

/** The site frame for pages outside the guided flow: shared header, footer and the advisor pill. */
export function Shell({ children, narrow = false, current, advisor = true }: { children: React.ReactNode; narrow?: boolean; current?: Current; advisor?: boolean }) {
  return (
    <div className={s.app}>
      <SiteHeader current={current} />
      <main className={`${s.page} ${narrow ? s.narrow : ""}`}>{children}</main>
      <SiteFooter />
      {advisor && <SiteAdvisor />}
    </div>
  );
}
