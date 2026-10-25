"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/stat";
import { useSession } from "@/components/use-session";
import { short, sol } from "@/components/format";
import { ArrowUpRight, ExternalLink, Wallet } from "lucide-react";
import { solscanAddress, solscanTx } from "@/lib/solana/solscan";

interface PayoutRow {
  id: string;
  ts: string;
  lamports: string;
  tx_sig: string | null;
  status: string;
  kind: string;
  release_at: string | null;
  released: boolean;
  escrow_address: string | null;
}

const KIND: Record<string, { label: string; tone: string }> = {
  instant: { label: "Instant payout", tone: "text-emerald-700 dark:text-emerald-300" },
  escrow_fund: { label: "Locked in escrow", tone: "text-amber-700 dark:text-amber-300" },
  escrow_release: { label: "Escrow released", tone: "text-emerald-700 dark:text-emerald-300" },
  escrow_slash: { label: "Escrow slashed", tone: "text-red-700 dark:text-red-300" },
};

export default function PaymentsPage() {
  const { session } = useSession();
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  useEffect(() => {
    if (!session.wallet) return;
    const load = () => fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setRows(d.payouts ?? []);
      setWalletBalance(d.walletBalanceLamports ?? null);
    });
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [session.wallet]);

  if (session.loaded && !session.wallet)
    return <p className="px-8 py-16 text-center text-muted-foreground">Connect a wallet to see payments.</p>;

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-12 sm:px-8 lg:px-14 lg:py-16">
      <section className="paper-grid grid overflow-hidden border-2 border-foreground bg-card shadow-[8px_8px_0_var(--foreground)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-6 sm:p-8 lg:p-10">
          <p className="eyebrow flex items-center gap-2 text-primary"><Wallet className="size-4" />Your wallet balance</p>
          <p className="mt-5 text-5xl font-black tracking-[-0.065em] tabular-nums sm:text-7xl">
            {walletBalance === null ? "—" : sol(walletBalance, 6)}
          </p>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">This is the live balance currently held by your connected wallet on Solana testnet. It can include SOL received outside LabelPay.</p>
          {session.wallet && (
            <a className="mt-5 inline-flex items-center gap-2 font-mono text-xs font-bold underline decoration-2 underline-offset-4" href={solscanAddress(session.wallet)} target="_blank" rel="noreferrer" title={session.wallet}>
              {short(session.wallet)} <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <div className="grid grid-cols-2 border-t-2 border-foreground bg-secondary lg:border-l-2 lg:border-t-0">
          <div className="border-b border-r border-foreground/35 p-5 sm:p-7"><StatTile label="Paid by LabelPay" value={sol(session.lamportsEarned ?? "0", 4)} hint="Instant payouts plus released escrow" /></div>
          <div className="border-b border-foreground/35 p-5 sm:p-7"><StatTile label="In escrow" value={sol(session.escrowLamports ?? "0", 4)} hint="Waiting to vest onchain" /></div>
          <div className="border-r border-foreground/35 p-5 sm:p-7"><StatTile label="Released" value={sol(session.lamportsReleased ?? "0", 4)} hint="Escrow vested to your wallet" /></div>
          <div className="p-5 sm:p-7"><StatTile label="Slashed" value={sol(session.lamportsSlashed ?? "0", 4)} hint="Escrow returned after a missed reference item" tone={session.lamportsSlashed && session.lamportsSlashed !== "0" ? "bad" : "muted"} /></div>
        </div>
      </section>
      {session.escrowAddress && !session.escrowAddress.startsWith("mock") && (
        <p className="mt-4 text-sm text-muted-foreground">
          Your escrow account: <a className="font-mono underline" href={solscanAddress(session.escrowAddress)} target="_blank" rel="noreferrer">{session.escrowAddress}</a>
        </p>
      )}

      <div className="mb-5 mt-16 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow text-primary">Onchain receipts</p><h2 className="mt-2 text-4xl font-black tracking-[-0.055em]">Transactions</h2></div>
        <p className="max-w-md text-right text-xs leading-5 text-muted-foreground">A transaction hash is your permanent payment receipt. Select one to verify its amount and status on Solscan.</p>
      </div>
      <div className="overflow-x-auto border-2 border-foreground bg-card shadow-[6px_6px_0_var(--foreground)]">
        <table className="w-full text-[15px]">
          <thead className="bg-muted/60 text-left text-sm text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-right font-medium">Transaction hash</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No payouts yet.</td></tr>
            )}
            {rows.map((r) => {
              const k = KIND[r.kind] ?? { label: r.kind, tone: "" };
              const vesting = r.kind === "escrow_fund" && !r.released && r.release_at;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.ts).toLocaleTimeString()}</td>
                  <td className={`px-4 py-3 font-medium ${k.tone}`}>{k.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {vesting ? `vests ${new Date(r.release_at!).toLocaleTimeString()}` : r.status === "mock" ? "mock" : r.status === "confirmed" ? "Confirmed" : r.status}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{r.kind === "escrow_slash" ? "−" : "+"}{sol(r.lamports)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {r.tx_sig && !r.tx_sig.startsWith("mock") ? (
                      <a className="inline-flex items-center justify-end gap-1.5 font-bold text-primary underline decoration-2 underline-offset-4" href={solscanTx(r.tx_sig)} target="_blank" rel="noreferrer" title={`Open ${r.tx_sig} on Solscan`}>
                        {short(r.tx_sig)} <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{r.tx_sig ? "mock" : "pending"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
