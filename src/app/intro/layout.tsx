import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KG Finance — Built for two",
  description:
    "A private finance app for two people. Spending, income, debts and who owes whom — on one screen, on both phones.",
};

export default function IntroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
