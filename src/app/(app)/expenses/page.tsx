import { redirect } from "next/navigation";

/** Expenses live on the Spend page. Server-side 307 — see income/page.tsx. */
export default function ExpensesPage() {
  redirect("/spend");
}
