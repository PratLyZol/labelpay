"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, CreditCard, House } from "lucide-react";
import { WalletButton } from "@/components/wallet-button";

const NAV = [
  { href: "/", label: "Overview", icon: House },
  { href: "/label", label: "Label tasks", icon: ClipboardList },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard", label: "Analytics", icon: BarChart3 },
];

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/label": "Label tasks",
  "/payments": "Payments",
  "/dashboard": "Analytics",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "LabelPay";

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar px-3 py-6 md:flex">
        <Link href="/" className="mb-12 px-3 text-[17px] font-semibold tracking-tight">
          LabelPay
        </Link>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main navigation">
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-[#1e2b21] font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-3 flex items-center gap-2 border-t pt-5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Solana devnet
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight md:hidden">LabelPay</Link>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">Workspace</span>
              <span className="hidden text-muted-foreground sm:inline">/</span>
              <span className="font-medium">{title}</span>
            </div>
          </div>
          <WalletButton />
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden" aria-label="Mobile navigation">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium ${pathname === href ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
              {label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
