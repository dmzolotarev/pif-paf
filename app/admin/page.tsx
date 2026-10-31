import type { Metadata } from "next";
import { AdminApp } from "./AdminApp";

export const metadata: Metadata = {
  title: "Организатор — Pif-Paf",
  description: "Управление игрой",
};

export default function AdminPage() {
  return <AdminApp />;
}
