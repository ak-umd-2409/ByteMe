import type { Metadata } from "next";
import { AdminQueue } from "./AdminQueue.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Tool review queue",
  description: "How new AI tools are found, safety-checked and approved or blocked before any owner sees them.",
  robots: { index: false },
};

/** Screen 8: the discovery and review queue, on /api/discovery/* (docs/DISCOVERY.md). */
export default function AdminPage() {
  return <AdminQueue />;
}
