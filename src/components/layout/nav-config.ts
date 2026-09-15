import {
  Brain,
  Truck,
  Cloud,
  CreditCard,
  ArrowLeftRight,
  History,
  Landmark,
  LayoutDashboard,
  Wallet,
} from "lucide-react";

export const primaryNavItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/spend", label: "Spend", icon: Wallet, primary: true as const },
  { href: "/balance", label: "Balance", icon: ArrowLeftRight },
] as const;

export const moreNavItems = [
  { href: "/memory", label: "Memory", icon: Brain, tint: "#af52de" },
  { href: "/flex", label: "Amazon Flex", icon: Truck, tint: "#0077FF" },
  { href: "/accounts", label: "Accounts", icon: CreditCard, tint: "#34c759" },
  { href: "/debts", label: "Debts", icon: Landmark, tint: "#ff3b30" },
  { href: "/history", label: "History", icon: History, tint: "#ff9500" },
  { href: "/sync", label: "Cloud Sync", icon: Cloud, tint: "#34c759" },
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
