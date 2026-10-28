import {
  Brain,
  Truck,
  Cloud,
  CreditCard,
  ArrowLeftRight,
  History,
  Landmark,
  LayoutDashboard,
  Send,
  Wallet,
} from "lucide-react";

export const primaryNavItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/spend", label: "Spend", icon: Wallet, primary: true as const },
  { href: "/balance", label: "Balance", icon: ArrowLeftRight },
] as const;

export const moreNavItems = [
  { href: "/memory", label: "Memory", icon: Brain, tint: "var(--feature)" },
  { href: "/flex", label: "Amazon Flex", icon: Truck, tint: "#3781fc" },
  { href: "/accounts", label: "Accounts", icon: CreditCard, tint: "var(--success)" },
  { href: "/debts", label: "Debts", icon: Landmark, tint: "var(--danger)" },
  { href: "/transfers", label: "Money Transfers", icon: Send, tint: "var(--accent-cyan)" },
  { href: "/history", label: "History", icon: History, tint: "var(--warning)" },
  { href: "/sync", label: "Cloud Sync", icon: Cloud, tint: "var(--success)" },
] as const;

/**
 * Every page that can sit in the tab bar beside Spend. Three of them do; the
 * rest live under More. History and Accounts used to be two taps away there.
 */
export const barChoices = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/balance", label: "Balance", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/flex", label: "Flex", icon: Truck },
  { href: "/debts", label: "Debts", icon: Landmark },
  { href: "/transfers", label: "Transfers", icon: Send },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/sync", label: "Sync", icon: Cloud },
] as const;

export type BarChoice = (typeof barChoices)[number];

export const DEFAULT_BAR = ["/", "/history", "/balance"];
export const BAR_SLOTS = 3;

/** The saved bar, made whole: known pages only, no repeats, topped up from the usual ones. */
export function resolveBar(saved: string[] | null | undefined): BarChoice[] {
  const known = (href: string) => barChoices.find((choice) => choice.href === href);
  const picked = [...new Set(saved ?? [])].map(known).filter((choice): choice is BarChoice => Boolean(choice));
  for (const href of DEFAULT_BAR) {
    if (picked.length >= BAR_SLOTS) break;
    const choice = known(href)!;
    if (!picked.includes(choice)) picked.push(choice);
  }
  return picked.slice(0, BAR_SLOTS);
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreNavActive(pathname: string) {
  return moreNavItems.some(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`)
  );
}
