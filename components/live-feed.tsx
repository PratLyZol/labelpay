"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { sol, short } from "@/components/format";

export interface FeedItem {
  id: string;
  kind: "verdict" | "payout" | "escrow_funded" | "escrow_released" | "escrow_slashed" | "payout_failed" | "audit";
  at: number;
  worker?: string;
  verdict?: string;
  reason?: string;
  flags?: string[];
  answer?: string;
  taskType?: string;
  payLamports?: string;
  instantLamports?: string;
  escrowLamports?: string;
  trust?: number;
  judgeMs?: number;
  judgeModel?: string | null;
  sig?: string;
  explorer?: string;
  lamports?: string;
  batched?: number;
  mock?: boolean;
  error?: string;
  payoutId?: string | null;
  payoutIds?: string[];
  escrow?: string | null;
  escrowExplorer?: string | null;
  severity?: string | null;
  quality?: number;
  patterns?: string[];
  notes?: string;
  trustBefore?: number;
  labelsReviewed?: number;
}

export function useLiveFeed(scope: "me" | "all", onEvent?: (ev: Record<string, unknown>) => void) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    const es = new EventSource(`/api/stream?scope=${scope}`);
    const push = (it: FeedItem) => setItems((prev) => [it, ...prev].slice(0, 60));
    es.addEventListener("label_verdict", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      cb.current?.(d);
      push({ id: `v-${d.labelEventId}`, kind: "verdict", ...d });
    });
    es.addEventListener("payout_confirmed", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      cb.current?.(d);
      push({ id: `p-${d.sig}`, kind: "payout", ...d });
    });
    for (const k of ["escrow_funded", "escrow_released", "escrow_slashed"] as const) {
      es.addEventListener(k, (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        cb.current?.(d);
        push({ id: `${k}-${d.sig}`, kind: k, ...d });
      });
    }
    es.addEventListener("audit", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      cb.current?.(d);
      push({ id: `a-${d.at}`, kind: "audit", ...d });
    });
    es.addEventListener("payout_failed", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      cb.current?.(d);
      push({ id: `f-${d.at}`, kind: "payout_failed", ...d });
    });
    return () => es.close();
  }, [scope]);
  return items;
}

export function VerdictBadge({ v }: { v: string }) {
  const cls =
    v === "approve"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
      : v === "reject"
        ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
        : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  const icon = v === "approve" ? "✓" : v === "reject" ? "✕" : "?";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      <span aria-hidden>{icon}</span>
      {v}
    </span>
  );
}

export function FeedList({ items, showWorker = false, empty = "Waiting for labels…" }: { items: FeedItem[]; showWorker?: boolean; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((it) => (
        <li key={it.id} className="py-2.5 text-sm">
          {it.kind === "verdict" && (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge v={it.verdict!} />
                <span className="text-muted-foreground">{it.taskType}</span>
                <span className="font-medium">“{it.answer}”</span>
                {it.severity && it.severity !== "ok" && <span className="text-xs text-amber-700 dark:text-amber-300">{it.severity}</span>}
                {showWorker && it.worker && <span className="font-mono text-xs text-muted-foreground">{short(it.worker)}</span>}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {it.judgeMs ? `${it.judgeMs}ms` : ""} {it.judgeModel ? `· ${it.judgeModel}` : ""}
                </span>
              </div>
              <p className="text-muted-foreground">{it.reason}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {it.flags?.map((f) => (
                  <Badge key={f} variant="outline" className="border-amber-300 text-amber-800 dark:text-amber-200">
                    {f}
                  </Badge>
                ))}
                {it.payLamports && it.payLamports !== "0" && (
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    +{sol(it.instantLamports ?? it.payLamports)} now
                    {it.escrowLamports && it.escrowLamports !== "0" && <span className="text-muted-foreground"> · {sol(it.escrowLamports)} vesting</span>}
                  </span>
                )}
                {typeof it.trust === "number" && <span className="text-xs text-muted-foreground">trust {it.trust.toFixed(0)}</span>}
              </div>
            </div>
          )}
          {it.kind === "payout" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-sol/20 text-xs">◎</span>
              <span className="font-medium">{sol(it.lamports!)} paid</span>
              {it.batched && it.batched > 1 && <span className="text-xs text-muted-foreground">({it.batched} labels batched)</span>}
              {showWorker && it.worker && <span className="font-mono text-xs text-muted-foreground">→ {short(it.worker)}</span>}
              {it.mock ? (
                <span className="text-xs text-muted-foreground">mock tx (no treasury key)</span>
              ) : (
                <a href={it.explorer} target="_blank" rel="noreferrer" className="ml-auto font-mono text-xs underline">
                  {it.sig?.slice(0, 8)}… Solscan ↗
                </a>
              )}
            </div>
          )}
          {(it.kind === "escrow_funded" || it.kind === "escrow_released" || it.kind === "escrow_slashed") && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${
                  it.kind === "escrow_slashed" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : it.kind === "escrow_released" ? "bg-sol/20" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                }`}
              >
                {it.kind === "escrow_slashed" ? "⊘" : it.kind === "escrow_released" ? "◎" : "⏳"}
              </span>
              <span className="font-medium">
                {it.kind === "escrow_funded" && `${sol(it.lamports!)} locked in escrow`}
                {it.kind === "escrow_released" && `${sol(it.lamports!)} vested → wallet`}
                {it.kind === "escrow_slashed" && `${sol(it.lamports!)} slashed back to treasury`}
              </span>
              {it.batched && it.batched > 1 && <span className="text-xs text-muted-foreground">({it.batched} batched)</span>}
              {showWorker && it.worker && <span className="font-mono text-xs text-muted-foreground">{short(it.worker)}</span>}
              {it.mock ? (
                <span className="ml-auto text-xs text-muted-foreground">mock tx</span>
              ) : (
                <span className="ml-auto flex gap-2 font-mono text-xs">
                  {it.escrowExplorer && <a href={it.escrowExplorer} target="_blank" rel="noreferrer" className="underline">escrow on Solscan ↗</a>}
                  <a href={it.explorer} target="_blank" rel="noreferrer" className="underline">transaction on Solscan ↗</a>
                </span>
              )}
            </div>
          )}
          {it.kind === "audit" && (
            <div className="space-y-1 rounded-lg bg-muted/60 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium">audit</span>
                <span className="text-xs text-muted-foreground">{it.labelsReviewed} labels re-read by {it.judgeModel ?? "audit model"}</span>
                {showWorker && it.worker && <span className="font-mono text-xs text-muted-foreground">{short(it.worker)}</span>}
                <span className="ml-auto font-mono text-xs">
                  quality {Math.round((it.quality ?? 0) * 100)}% · trust {it.trustBefore?.toFixed(0)} → {it.trust?.toFixed(0)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{it.notes}</p>
              <div className="flex flex-wrap gap-1">{it.patterns?.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}</div>
            </div>
          )}
          {it.kind === "payout_failed" && <p className="text-destructive">Payout failed: {it.error}</p>}
        </li>
      ))}
    </ul>
  );
}
