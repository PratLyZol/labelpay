"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet-button";

const NAV: { group?: string; items: { href: string; label: string; icon: string }[] }[] = [
  { items: [{ href: "/", label: "Home", icon: "⌂" }] },
  {
    group: "AI work",
    items: [
      { href: "/", label: "Projects", icon: "▦" },
      { href: "/label", label: "Label", icon: "✎" },
      { href: "/payments", label: "Payments", icon: "◎" },
      { href: "/dashboard", label: "Analytics", icon: "▤" },
    ],
  },
];

const TITLES: Record<string, string> = { "/": "Projects", "/label": "Label", "/payments": "Payments", "/dashboard": "Analytics" };

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "LabelPay";
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#14f195,#9945ff)] text-base font-black text-white shadow-sm">L</span>
          <span className="text-sm font-semibold tracking-tight">Label<span className="text-primary">Pay</span></span>
        </Link>
        <nav className="flex flex-1 flex-col gap-5 text-[15px]">
          {NAV.map((g, gi) => (
            <div key={gi} className="space-y-0.5">
              {g.group && <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.group}</p>}
              {g.items.map((it) => {
                const active = pathname === it.href && !(gi === 0 && pathname === "/" && false);
                const isHomeDup = gi === 0 && it.href === "/";
                return (
                  <Link
                    key={`${gi}-${it.href}`}
                    href={it.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${active && !isHomeDup ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/70"}`}
                  >
                    <span className="w-5 text-center text-muted-foreground" aria-hidden>{it.icon}</span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <p className="px-3 text-xs text-muted-foreground">HackTX 26 · Snowflake · Tiger Data · Solana</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href="/" className="md:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#14f195,#9945ff)] text-sm font-black text-white">L</span>
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-4 text-[15px]">
            <nav className="hidden items-center gap-1 md:flex">
              <Link href="/label" className="rounded-full px-3 py-1.5 hover:bg-muted">Label</Link>
              <Link href="/dashboard" className="rounded-full px-3 py-1.5 hover:bg-muted">Analytics</Link>
            </nav>
            <WalletButton />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
