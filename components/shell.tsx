"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet-button";

const NAV = [
  { href: "/", label: "Projects" },
  { href: "/label", label: "Label tasks" },
  { href: "/payments", label: "Payments" },
  { href: "/dashboard", label: "Quality" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] w-full max-w-[1600px] items-center gap-8 px-5 sm:px-8 lg:px-14">
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-white">L</span>
            <span>LabelPay</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3.5 py-2 text-sm transition-colors ${active ? "font-medium text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"}`}
              >
                {label}
              </Link>
            );
          })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex"><span className="size-1.5 rounded-full bg-emerald-500" />Solana devnet</span>
            <WalletButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto border-t px-4 py-2 md:hidden" aria-label="Mobile navigation">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium ${pathname === href ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
