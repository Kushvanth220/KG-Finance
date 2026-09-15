import { redirect } from "next/navigation";

/**
 * The rule builder became the Flex page.
 *
 * Building a rule out of triggers, fields and expressions was more machinery
 * than the one job it was used for. Anything already saved still lives in the
 * same store — the Flex page reads it — so nothing recorded was lost.
 */
export default function RulesPage() {
  redirect("/flex");
}
