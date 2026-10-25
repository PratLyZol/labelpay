"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/stat";
import { useSession } from "@/components/use-session";
import { sol } from "@/components/format";
import { ExternalLink } from "lucide-react";
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
  useEffect(() => {
    if (!session.wallet) return;
    const load = () => fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => setRows(d.payouts ?? []));
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [session.wallet]);

  if (session.loaded && !session.wallet)
    return <p className="px-8 py-16 text-center text-muted-foreground">Connect a wallet to see payments.</p>;

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-12 sm:px-8 lg:px-14 lg:py-16">
      <div className="grid max-w-3xl grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
        <StatTile label="Total paid" value={sol(session.lamportsEarned ?? "0", 3)} hint="Instant payouts plus released escrow" />
        <StatTile label="Awaiting payout" value={sol(session.escrowLamports ?? "0", 3)} hint="Vesting in escrow" />
        <StatTile label="Released" value={sol(session.lamportsReleased ?? "0", 3)} hint="Escrow that vested to your wallet" />
        <StatTile label="Slashed" value={sol(session.lamportsSlashed ?? "0", 3)} hint="Escrow clawed back after a missed reference item" tone={session.lamportsSlashed && session.lamportsSlashed !== "0" ? "bad" : "muted"} />
      </div>
      {session.escrowAddress && !session.escrowAddress.startsWith("mock") && (
        <p className="mt-4 text-sm text-muted-foreground">
          Your escrow account: <a className="font-mono underline" href={solscanAddress(session.escrowAddress)} target="_blank" rel="noreferrer">{session.escrowAddress}</a>
        </p>
      )}

      <h2 className="mb-4 mt-12 text-3xl font-light tracking-[-0.04em]">Transactions</h2>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-[15px]">
          <thead className="bg-muted/60 text-left text-sm text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-right font-medium">Transaction</th>
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
                    {vesting ? `vests ${new Date(r.release_at!).toLocaleTimeString()}` : r.status === "mock" ? "mock" : r.status}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{r.kind === "escrow_slash" ? "−" : "+"}{sol(r.lamports)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {r.tx_sig && !r.tx_sig.startsWith("mock") ? (
                      <a className="inline-flex items-center justify-end gap-1.5 underline" href={solscanTx(r.tx_sig)} target="_blank" rel="noreferrer" title={r.tx_sig}>
                        View on Solscan <ExternalLink className="size-3" aria-hidden="true" />
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
