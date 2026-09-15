import { redirect } from "next/navigation";

/**
 * Income lives on the Accounts page. Redirect on the server (307) rather than
 * from a client effect — the effect version rendered `null` first, so the app
 * shell flashed with an empty body before navigating.
 */
export default function IncomePage() {
  redirect("/accounts");
}
