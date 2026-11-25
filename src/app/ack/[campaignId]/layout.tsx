import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gift card receipt" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
