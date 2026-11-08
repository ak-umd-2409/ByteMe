import type { Metadata } from "next";
import { loadCatalog } from "@/lib/catalog/index.ts";
import { AdminQueue } from "./AdminQueue.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Tool review queue",
  description: "How new AI tools are found, safety-checked and approved or blocked before any owner sees them.",
};

/** Screen 8 of the approved wireframes: the discovery and review queue. */
export default function AdminPage() {
  return <AdminQueue records={loadCatalog()} />;
}
