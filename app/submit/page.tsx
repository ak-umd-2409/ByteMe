import type { Metadata } from "next";
import { Shell } from "../tools/Shell.tsx";
import { Apply } from "./Apply.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Apply to be listed",
  description: "Make an AI tool for small businesses? Apply to be listed. Every tool gets the same Safety Check, then a person reviews it.",
};

/** Vendor applications (spec §1.1: "vendor submissions"). */
export default function SubmitPage() {
  return (
    <Shell narrow current="submit">
      <Apply />
    </Shell>
  );
}
