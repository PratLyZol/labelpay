"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServedTask } from "@/lib/db/types";
import { TaskCard } from "@/components/task-card";
import { TrustMeter } from "@/components/trust-meter";
import { FeedList, useLiveFeed, VerdictBadge } from "@/components/live-feed";
import { useSession } from "@/components/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sol } from "@/components/format";

type Filter = "all" | "text" | "pairwise" | "image";

interface LastResult {
  verdict: string;
  reason: string;
  flags: string[];
  payLamports: string;
  instantLamports: string;
  escrowLamports: string;
  escrowHoldSeconds: number;
  trust: number;
  expected: string | null;
  judgeMs: number;
  judgeModel: string | null;
  latencyMs: number;
  paused: boolean;
}

export default function LabelPage() {
  const { session, refresh } = useSession();
  const [task, setTask] = useState<ServedTask | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window === "undefined") return "all";
    const t = new URLSearchParams(window.location.search).get("type");
    return t === "text" || t === "pairwise" || t === "image" ? t : "all";
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [last, setLast] = useState<LastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEarned, setSessionEarned] = useState(0n);
  const [confirmed, setConfirmed] = useState(0n);
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const feed = useLiveFeed("me", (ev) => {
    if (ev.type === "payout_confirmed" || ev.type === "escrow_released") setConfirmed((c) => c + BigInt(ev.lamports as string));
    if (ev.type === "escrow_funded" || ev.type === "escrow_released" || ev.type === "escrow_slashed" || ev.type === "audit") void refresh();
  });

  const loadNext = useCallback(async () => {
    if (!session.wallet) return;
    setError(null);
    const q = filter === "all" ? "" : `?type=${filter}`;
    const res = await fetch(`/api/tasks/next${q}`, { cache: "no-store" });
    if (!res.ok) {
      setError((await res.json()).error ?? "could not load task");
      return;
    }
    const data = await res.json();
    if (!data.task) {
      setDone(true);
      setTask(null);
      return;
    }
    setDone(false);
    setTask(data.task);
  }, [session.wallet, filter]);

  useEffect(() => {
    if (session.loaded && session.wallet) void loadNext();
  }, [session.loaded, session.wallet, filter, loadNext]);

  const submit = useCallback(
    async (answer: string) => {
      const t = taskRef.current;
      if (!t || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: t.id, answer }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "submit failed");
        setLast(data);
        setSessionEarned((s) => s + BigInt(data.payLamports));
        void refresh();
        await loadNext();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, loadNext, refresh],
  );

  // Keyboard shortcuts 1..n
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = taskRef.current;
      if (!t || busy) return;
      const n = Number(e.key);
      if (n >= 1 && n <= t.options.length) void submit(t.options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, submit]);

  if (!session.loaded) return <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Loading…</div>;

  if (!session.wallet)
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Connect a devnet wallet to start labeling</h1>
        <p className="mt-3 text-muted-foreground">
          Use the <span className="font-medium">Connect wallet</span> button in the top right. You will sign one message to prove you own the wallet. Approved labels pay out to it in SOL.
        </p>
      </div>
    );

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_380px]">
      <section className="space-y-4 px-6 py-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-muted p-1 text-sm">
            {(["all", "text", "pairwise", "image"] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-4 py-1.5 capitalize transition ${filter === f ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
          <span className="ml-auto text-sm text-muted-foreground">You only see items the model could not label confidently.</span>
        </div>

        <Card>
          <CardContent className="pt-6">
            {session.paused && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
                Your trust score dropped below 25, so payouts are paused for review. Keep labeling carefully to recover.
              </div>
            )}
            {done && <p className="py-12 text-center text-muted-foreground">You have labeled every item in this set. Try another type.</p>}
            {task && <TaskCard key={task.id} task={task} onSubmit={submit} busy={busy} />}
            {!task && !done && <p className="py-12 text-center text-muted-foreground">Loading task…</p>}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {last && (
          <Card className={last.verdict === "approve" ? "border-emerald-300" : last.verdict === "reject" ? "border-red-300" : "border-amber-300"}>
            <CardContent className="flex flex-wrap items-start gap-3 pt-5 text-sm">
              <VerdictBadge v={last.verdict} />
              <div className="min-w-0 flex-1">
                <p>{last.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {last.expected && last.verdict !== "approve" ? `Expected “${last.expected}”. ` : ""}
                  You took {(last.latencyMs / 1000).toFixed(1)}s · monitor {last.judgeMs}ms{last.judgeModel ? ` on ${last.judgeModel}` : ""}
                  {last.flags.length ? ` · flags: ${last.flags.join(", ")}` : ""}
                </p>
              </div>
              <span className={`text-right font-mono text-sm ${last.payLamports !== "0" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
                {last.payLamports !== "0" ? (
                  <>
                    +{sol(last.instantLamports)} now
                    {last.escrowLamports !== "0" && (
                      <span className="block text-xs text-muted-foreground">{sol(last.escrowLamports)} vests in {last.escrowHoldSeconds}s</span>
                    )}
                  </>
                ) : (
                  "no pay"
                )}
              </span>
            </CardContent>
          </Card>
        )}
      </section>

      <aside className="space-y-4 border-t px-6 py-8 lg:border-l lg:border-t-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TrustMeter trust={session.trust ?? 60} multiplier={session.multiplier ?? 1} paused={!!session.paused} />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Earned this session</dt>
                <dd className="font-mono font-medium">{sol(sessionEarned)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Confirmed on-chain</dt>
                <dd className="font-mono font-medium">{sol(confirmed)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vesting in escrow</dt>
                <dd className="font-mono font-medium text-amber-700 dark:text-amber-300">{sol(session.escrowLamports ?? "0")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Slashed</dt>
                <dd className="font-mono font-medium text-red-700 dark:text-red-300">{sol(session.lamportsSlashed ?? "0")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Labels</dt>
                <dd className="font-medium">{session.labelsTotal ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Approval</dt>
                <dd className="font-medium">
                  {session.labelsTotal ? Math.round((100 * (session.labelsApproved ?? 0)) / session.labelsTotal) : 0}%
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Lifetime paid: {sol(session.lamportsEarned ?? "0")}
              {session.escrowAddress && !session.escrowAddress.startsWith("mock") && (
                <>
                  {" "}· <a className="underline" href={`https://explorer.solana.com/address/${session.escrowAddress}?cluster=devnet`} target="_blank" rel="noreferrer">your escrow account ↗</a>
                </>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monitor + payouts</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto">
            <FeedList items={feed} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
