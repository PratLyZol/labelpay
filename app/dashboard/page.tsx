"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bars, LineChart, SERIES, STATUS, Stat, type Series } from "@/components/charts";
import { FeedList, useLiveFeed, VerdictBadge } from "@/components/live-feed";
import { pct, short, sol } from "@/components/format";

interface Stats {
  totals: { labels: number; approved: number; rejected: number; lamports: string; avg_latency_ms: number; avg_judge_ms: number; workers: number };
  payouts: { confirmed: number; pending: number; failed: number; instant_lamports: string; escrow_held_lamports: string; released_lamports: string; slashed_lamports: string; slashes: number };
  escrow: { instantPct: number; holdSeconds: number };
  routing: { total: number; auto: number; human: number; pending: number; human_avg_conf: number; auto_avg_conf: number };
  audits: { id: string; ts: string; worker: string; labels_reviewed: number; quality: number; trust_before: number; trust_after: number; patterns: string[]; notes: string; model: string }[];
  series: { bucket: string; task_type: string; labels: number; approved: number; rejected: number; lamports: string; avg_latency_ms: number; avg_judge_ms: number; too_fast: number; straight_lining: number; gold_miss: number; incoherent: number; consensus_disagree: number }[];
  trust: { bucket: string; worker: string; trust: number; labels: number }[];
  leaderboard: { wallet: string; trust_score: number; labels_total: number; labels_approved: number; lamports_earned: string; escrow_lamports: string; lamports_slashed: string; paused: boolean }[];
  recent: { id: string; ts: string; worker: string; task_type: string; answer: string; verdict: string; confidence: number; reason: string; flags: string[]; pay_lamports: string; trust_after: number; judge_ms: number; tx_sig: string | null; payout_status: string | null }[];
  byType: { task_type: string; labels: number; approved: number; avg_latency_ms: number }[];
  treasury: { address: string | null; lamports: string | null };
  judge: { model: string; mock: boolean };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dark, setDark] = useState(false);
  const feed = useLiveFeed("all");

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark") || window.matchMedia("(prefers-color-scheme: dark)").matches);
    const load = () => fetch("/api/stats", { cache: "no-store" }).then((r) => r.json()).then(setStats).catch(() => {});
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const color = (k: string) => (dark ? SERIES[k]?.dark : SERIES[k]?.light) ?? STATUS.neutral;

  const labelsSeries: Series[] = useMemo(() => {
    if (!stats) return [];
    const byType = new Map<string, Map<number, number>>();
    for (const r of stats.series) {
      const t = new Date(r.bucket).getTime();
      const m = byType.get(r.task_type) ?? new Map();
      m.set(t, (m.get(t) ?? 0) + r.labels);
      byType.set(r.task_type, m);
    }
    return [...byType.entries()].map(([k, m]) => ({ key: k, label: SERIES[k]?.label ?? k, color: color(k), points: [...m.entries()].map(([x, y]) => ({ x, y })) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, dark]);

  const solSeries: Series[] = useMemo(() => {
    if (!stats) return [];
    const m = new Map<number, number>();
    for (const r of stats.series) {
      const t = new Date(r.bucket).getTime();
      m.set(t, (m.get(t) ?? 0) + Number(r.lamports) / 1e9);
    }
    return [{ key: "sol", label: "SOL paid", color: dark ? "#a76bff" : "#7b2ff2", points: [...m.entries()].map(([x, y]) => ({ x, y })) }];
  }, [stats, dark]);

  const approvalSeries: Series[] = useMemo(() => {
    if (!stats) return [];
    const m = new Map<number, { a: number; n: number }>();
    for (const r of stats.series) {
      const t = new Date(r.bucket).getTime();
      const cur = m.get(t) ?? { a: 0, n: 0 };
      m.set(t, { a: cur.a + r.approved, n: cur.n + r.labels });
    }
    return [{ key: "appr", label: "Approval rate", color: STATUS.good, points: [...m.entries()].map(([x, v]) => ({ x, y: v.n ? (100 * v.a) / v.n : 0 })) }];
  }, [stats]);

  const trustSeries: Series[] = useMemo(() => {
    if (!stats) return [];
    const byW = new Map<string, Map<number, number>>();
    for (const r of stats.trust) {
      const m = byW.get(r.worker) ?? new Map();
      m.set(new Date(r.bucket).getTime(), r.trust);
      byW.set(r.worker, m);
    }
    const top = [...byW.entries()].slice(0, 3);
    const cols = ["text", "pairwise", "image"];
    return top.map(([w, m], i) => ({ key: w, label: short(w), color: color(cols[i]), points: [...m.entries()].map(([x, y]) => ({ x, y })) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, dark]);

  const flagRows = useMemo(() => {
    if (!stats) return [];
    const sum = (k: "too_fast" | "straight_lining" | "gold_miss" | "incoherent" | "consensus_disagree") => stats.series.reduce((s, r) => s + (r[k] ?? 0), 0);
    return [
      { label: "Too fast (speed clicking)", value: sum("too_fast"), color: STATUS.warning },
      { label: "Straight-lining", value: sum("straight_lining"), color: STATUS.warning },
      { label: "Missed hidden gold item", value: sum("gold_miss"), color: STATUS.serious },
      { label: "Absurd answer (monitor)", value: sum("incoherent"), color: STATUS.serious },
      { label: "Disagrees with peer majority", value: sum("consensus_disagree"), color: STATUS.neutral },
    ];
  }, [stats]);

  if (!stats) return <div className="p-8 text-sm text-muted-foreground">Loading dashboard…</div>;
  const t = stats.totals;

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-pixel text-[28px] md:text-[34px]">Live quality + payouts</h2>
          <p className="text-sm text-muted-foreground">
            Per-minute continuous aggregates from Tiger Data · monitor model <span className="font-mono">{stats.judge.model}</span>
            {stats.treasury.address && (
              <>
                {" "}· treasury <a className="font-mono underline" href={`https://explorer.solana.com/address/${stats.treasury.address}?cluster=devnet`} target="_blank" rel="noreferrer">{short(stats.treasury.address)}</a>
                {stats.treasury.lamports && <> ({sol(stats.treasury.lamports, 2)})</>}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Labels" value={String(t.labels)} sub={`${t.workers} workers`} />
        <Stat label="Approval rate" value={pct(t.approved, t.labels)} sub={`${t.rejected} rejected`} />
        <Stat label="SOL earned" value={sol(t.lamports, 3)} sub={`${stats.payouts.confirmed} tx confirmed`} />
        <Stat label="Paid instantly" value={sol(stats.payouts.instant_lamports, 3)} sub={`${stats.escrow.instantPct}% of each payout`} />
        <Stat label="In escrow" value={sol(stats.payouts.escrow_held_lamports, 3)} sub={`vests after ${stats.escrow.holdSeconds}s`} />
        <Stat label="Slashed" value={sol(stats.payouts.slashed_lamports, 3)} sub={`${stats.payouts.slashes} clawbacks · ${sol(stats.payouts.released_lamports, 3)} released`} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Routed to humans" value={`${stats.routing.human} / ${stats.routing.total}`} sub={`model auto-labeled ${stats.routing.auto}${stats.routing.pending ? `, ${stats.routing.pending} unrouted` : ""}`} />
        <Stat label="Model confidence on human items" value={`${Math.round(stats.routing.human_avg_conf * 100)}%`} sub={`vs ${Math.round(stats.routing.auto_avg_conf * 100)}% on auto items`} />
        <Stat label="Avg monitor time" value={`${t.avg_judge_ms} ms`} sub="Snowflake Cortex" />
        <Stat label="Avg time per label" value={`${(t.avg_latency_ms / 1000).toFixed(1)} s`} sub="worker latency" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Labels per minute, by task type</CardTitle></CardHeader>
          <CardContent><LineChart series={labelsSeries} yLabel="labels / min" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">SOL paid per minute</CardTitle></CardHeader>
          <CardContent><LineChart series={solSeries} yLabel="SOL / min" yFormat={(v) => v.toFixed(3)} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Approval rate per minute</CardTitle></CardHeader>
          <CardContent><LineChart series={approvalSeries} yLabel="% approved" yFormat={(v) => `${Math.round(v)}%`} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Trust score over time (top workers)</CardTitle></CardHeader>
          <CardContent><LineChart series={trustSeries} yLabel="trust" /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Fraud signals (last hour)</CardTitle></CardHeader>
          <CardContent><Bars rows={flagRows} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Approval by task type</CardTitle></CardHeader>
          <CardContent>
            <Bars
              rows={stats.byType.map((b) => ({ label: SERIES[b.task_type]?.label ?? b.task_type, value: b.labels ? Math.round((100 * b.approved) / b.labels) : 0, color: color(b.task_type), hint: `${b.labels} labels, avg ${(b.avg_latency_ms / 1000).toFixed(1)}s` }))}
              format={(v) => `${v}%`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Leaderboard</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="pb-1">Wallet</th><th>Trust</th><th>Labels</th><th className="text-right">Earned</th><th className="text-right">Escrow</th></tr>
              </thead>
              <tbody>
                {stats.leaderboard.map((w) => (
                  <tr key={w.wallet} className="border-t">
                    <td className="py-1.5 font-mono text-xs">{short(w.wallet)}{w.paused && <span className="ml-1 text-red-600">paused</span>}</td>
                    <td className="tabular-nums">{Math.round(w.trust_score)}</td>
                    <td className="tabular-nums">{w.labels_approved}/{w.labels_total}</td>
                    <td className="text-right font-mono text-xs">{sol(w.lamports_earned, 3)}</td>
                    <td className="text-right font-mono text-xs text-amber-700 dark:text-amber-300">{sol(w.escrow_lamports, 3)}</td>
                  </tr>
                ))}
                {!stats.leaderboard.length && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No workers yet</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Periodic audits (bigger model re-reads each worker&apos;s last batch)</CardTitle></CardHeader>
        <CardContent>
          {stats.audits.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No audits yet. One runs automatically every 10 labels per worker.</p>
          ) : (
            <ul className="divide-y text-sm">
              {stats.audits.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{short(a.worker)}</span>
                  <span className="text-xs text-muted-foreground">{a.labels_reviewed} labels · {a.model}</span>
                  <span className="font-mono text-xs">quality {Math.round(a.quality * 100)}%</span>
                  <span className={`font-mono text-xs ${a.trust_after >= a.trust_before ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>trust {a.trust_before.toFixed(0)} → {a.trust_after.toFixed(0)}</span>
                  <span className="basis-full text-xs text-muted-foreground">{a.notes} {a.patterns?.length ? `· ${a.patterns.join(", ")}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Live stream (all workers)</CardTitle></CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto"><FeedList items={feed} showWorker /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent labels (from Tiger Data)</CardTitle></CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto">
            <ul className="divide-y text-sm">
              {stats.recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <VerdictBadge v={r.verdict} />
                  <span className="text-muted-foreground">{r.task_type}</span>
                  <span className="font-medium">“{r.answer}”</span>
                  <span className="font-mono text-xs text-muted-foreground">{short(r.worker)}</span>
                  <span className="ml-auto font-mono text-xs">
                    {r.pay_lamports !== "0" ? `+${sol(r.pay_lamports)}` : "–"}
                    {r.tx_sig && !r.tx_sig.startsWith("mock") && (
                      <a className="ml-2 underline" href={`https://explorer.solana.com/tx/${r.tx_sig}?cluster=devnet`} target="_blank" rel="noreferrer">tx ↗</a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
