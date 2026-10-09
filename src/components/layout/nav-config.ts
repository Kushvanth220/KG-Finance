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

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreNavActive(pathname: string) {
  return moreNavItems.some(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`)
  );
}
