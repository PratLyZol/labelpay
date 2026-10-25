"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet-button";

const NAV = [
  { href: "/", label: "Projects" },
  { href: "/label", label: "Label tasks" },
  { href: "/projects/new", label: "Post project" },
  { href: "/payments", label: "Payments" },
  { href: "/dashboard", label: "Quality" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-foreground/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] w-full max-w-[1600px] items-center gap-8 px-5 sm:px-8 lg:px-14">
          <Link href="/" className="group flex items-center gap-2.5 text-[18px] font-black tracking-[-0.05em]">
            <span className="flex size-9 -rotate-3 items-center justify-center rounded-full border-2 border-foreground bg-primary text-sm font-black transition-transform group-hover:rotate-3">TM</span>
            <span>Taskmaster<span className="text-primary">.</span></span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`px-3.5 py-2 text-sm font-semibold transition-colors ${active ? "underline decoration-2 decoration-primary underline-offset-8" : "text-foreground/60 hover:text-foreground"}`}
              >
                {label}
              </Link>
            );
          })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-foreground/30 bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider lg:flex"><span className="size-2 rounded-full bg-[#14f195] ring-2 ring-foreground" />Devnet live</span>
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
