import type { Metadata } from "next";
import { Shell } from "../../tools/Shell.tsx";
import { FromLink } from "./FromLink.tsx";

export const metadata: Metadata = { title: "MainStreet AI | Shared plan", robots: { index: false, follow: false } };

/** A plan link that carries the plan after "#" (used when saved links aren't switched on). */
export default function Page() {
  return (
    <Shell narrow>
      <FromLink />
    </Shell>
  );
}
