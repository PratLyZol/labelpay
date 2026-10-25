"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, Check, ExternalLink, FileText, Image, Layers3, ListOrdered, Wallet } from "lucide-react";
import type { ServedTask } from "@/lib/db/types";
import { TaskCard } from "@/components/task-card";
import { TrustMeter } from "@/components/trust-meter";
import { useLiveFeed } from "@/components/live-feed";
import { useSession } from "@/components/use-session";
import { Button } from "@/components/ui/button";
import { sol } from "@/components/format";

type Mode = "all" | "text" | "pairwise" | "image";

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
  latencyMs: number;
  paused: boolean;
  payoutId: string | null;
}

const MODES = [
  { id: "all", name: "Mixed deck", description: "Rotate through every task type", icon: Layers3 },
  { id: "text", name: "Sentiment", description: "Read reviews and judge their tone", icon: FileText },
  { id: "pairwise", name: "Response ranking", description: "Compare two answers side by side", icon: ListOrdered },
  { id: "image", name: "Image tagging", description: "Identify the subject of each photo", icon: Image },
] as const;

export default function LabelPage() {
  const { session, refresh } = useSession();
  const [mode, setMode] = useState<Mode | null>(null);
  const [task, setTask] = useState<ServedTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [last, setLast] = useState<LastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEarned, setSessionEarned] = useState(0n);
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [confirmed, setConfirmed] = useState(0n);
  const [payoutLinks, setPayoutLinks] = useState<Record<string, { signature: string; url: string }>>({});
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("type");
    if (requestedMode === "text" || requestedMode === "pairwise" || requestedMode === "image") setMode(requestedMode);
  }, []);

  useLiveFeed("me", (event) => {
    if (event.type === "payout_confirmed" || event.type === "escrow_released") setConfirmed((value) => value + BigInt(event.lamports as string));
    if (event.type === "payout_confirmed" && Array.isArray(event.payoutIds) && typeof event.sig === "string" && typeof event.explorer === "string") {
      setPayoutLinks((current) => {
        const next = { ...current };
        for (const id of event.payoutIds as string[]) next[id] = { signature: event.sig as string, url: event.explorer as string };
        return next;
      });
    }
    if (event.type === "escrow_funded" || event.type === "escrow_released" || event.type === "escrow_slashed" || event.type === "audit") void refresh();
  });

  const loadNext = useCallback(async () => {
    if (!session.wallet || !mode) return;
    setError(null);
    const query = mode === "all" ? "" : `?type=${mode}`;
    const response = await fetch(`/api/tasks/next${query}`, { cache: "no-store" });
    if (!response.ok) {
      setError((await response.json()).error ?? "Could not load a task");
      return;
    }
    const data = await response.json();
    if (!data.task) {
      setDone(true);
      setTask(null);
      return;
    }
    setDone(false);
    setTask(data.task);
  }, [mode, session.wallet]);

  useEffect(() => {
    if (session.loaded && session.wallet && mode) void loadNext();
  }, [loadNext, mode, session.loaded, session.wallet]);

  const chooseMode = (nextMode: Mode) => {
    setTask(null);
    setDone(false);
    setError(null);
    setLast(null);
    setMode(nextMode);
    const url = nextMode === "all" ? "/label" : `/label?type=${nextMode}`;
    window.history.replaceState(null, "", url);
  };

  const changeMode = () => {
    setMode(null);
    setTask(null);
    setDone(false);
    setError(null);
    window.history.replaceState(null, "", "/label");
  };

  const submit = useCallback(async (answer: string) => {
    const currentTask = taskRef.current;
    if (!currentTask || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: currentTask.id, answer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Submit failed");
      setLast(data);
      setSessionCompleted((count) => count + 1);
      setSessionEarned((value) => value + BigInt(data.payLamports));
      void refresh();
      await loadNext();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }, [busy, loadNext, refresh]);

  if (!session.loaded) return <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-muted-foreground">Loading your workspace…</div>;

  if (!session.wallet) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl border bg-card text-muted-foreground"><Wallet className="size-5" strokeWidth={1.8} /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Connect your wallet to open a deck</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the wallet button in the top right. One signature connects your work and any approved devnet payouts.</p>
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Choose a mode</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">What do you want to label?</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Each mode is a focused deck. Pick one now; you can switch whenever you want.</p>
        </div>
        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          {MODES.map(({ id, name, description, icon: Icon }) => (
            <button key={id} type="button" onClick={() => chooseMode(id)} className="group flex min-h-32 items-center gap-4 rounded-2xl border bg-card p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-input hover:bg-muted/35 hover:shadow-xl">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground group-hover:text-foreground"><Icon className="size-5" strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{name}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
              <span className="text-lg text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground">→</span>
            </button>
          ))}
        </div>
        <div className="mt-10 grid grid-cols-3 divide-x rounded-xl border bg-card py-4 text-center">
          <div><p className="text-lg font-semibold tabular-nums">{session.labelsTotal ?? 0}</p><p className="text-xs text-muted-foreground">Lifetime cards</p></div>
          <div><p className="text-lg font-semibold tabular-nums">{Math.round(session.trust ?? 60)}</p><p className="text-xs text-muted-foreground">Trust score</p></div>
          <div><p className="text-lg font-semibold tabular-nums">{sol(session.lamportsEarned ?? "0", 3)}</p><p className="text-xs text-muted-foreground">Total paid</p></div>
        </div>
      </div>
    );
  }

  const activeMode = MODES.find((item) => item.id === mode)!;
  const lastPayout = last?.payoutId ? payoutLinks[last.payoutId] : null;

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={changeMode} className="flex size-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:text-foreground" aria-label="Change mode"><ArrowLeft className="size-4" /></button>
          <div><p className="text-sm font-semibold">{activeMode.name}</p><p className="text-xs text-muted-foreground">Card {sessionCompleted + 1} · Select an answer, then move right</p></div>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <span><strong className="font-semibold text-foreground">{sessionCompleted}</strong> completed</span>
          <span><strong className="font-semibold text-primary">{sol(sessionEarned, 3)}</strong> earned</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          {session.paused && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Payouts are paused while your trust score recovers. Careful labels will raise it.</div>}
          {done && (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] border bg-card px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl border bg-card text-primary"><Check className="size-5" strokeWidth={1.8} /></span>
              <h2 className="mt-5 text-2xl font-semibold">Deck complete</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">You labeled every available card in {activeMode.name.toLowerCase()}.</p>
              <Button className="mt-6" onClick={changeMode}>Choose another mode</Button>
            </div>
          )}
          {task && <TaskCard key={task.id} task={task} onSubmit={submit} busy={busy} />}
          {!task && !done && <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border bg-card text-sm text-muted-foreground">Preparing the next card…</div>}
          {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void loadNext()}>Try again</Button></div>}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center gap-2"><Activity className="size-4 text-muted-foreground" strokeWidth={1.8} /><h2 className="text-sm font-semibold">This session</h2></div>
            <TrustMeter trust={session.trust ?? 60} multiplier={session.multiplier ?? 1} paused={!!session.paused} />
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-5">
              <div><dt className="text-xs text-muted-foreground">Completed</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{sessionCompleted}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Earned</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{sol(sessionEarned, 3)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Confirmed</dt><dd className="mt-1 text-sm font-medium tabular-nums">{sol(confirmed, 3)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">In escrow</dt><dd className="mt-1 text-sm font-medium tabular-nums">{sol(session.escrowLamports ?? "0", 3)}</dd></div>
            </dl>
          </div>

          {last ? (
            <div className={`rounded-2xl border p-5 ${last.verdict === "approve" ? "border-primary/30 bg-accent/30" : "border-red-400/30 bg-red-500/10"}`}>
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Last card</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${last.verdict === "approve" ? "bg-primary text-primary-foreground" : "bg-red-400/20 text-red-200"}`}>{last.verdict}</span></div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{last.reason}</p>
              {last.expected && last.verdict !== "approve" && <p className="mt-2 text-xs text-muted-foreground">Reference answer: <span className="font-medium text-foreground">{last.expected}</span></p>}
              <div className="mt-4 flex items-end justify-between border-t pt-4"><span className="text-xs text-muted-foreground">{(last.latencyMs / 1000).toFixed(1)}s response</span><span className={`text-sm font-semibold ${last.payLamports !== "0" ? "text-primary" : "text-muted-foreground"}`}>{last.payLamports !== "0" ? `+${sol(last.payLamports, 3)}` : "No payout"}</span></div>
              {last.payoutId && (
                <div className="mt-3 border-t pt-3 text-xs">
                  {lastPayout ? (
                    <a href={lastPayout.url} target="_blank" rel="noreferrer" title={lastPayout.signature} className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-4">
                      View transaction on Solscan <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Confirming payout on Solana devnet…</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Your last result and reward will appear here.</div>
          )}

          <button type="button" onClick={changeMode} className="w-full rounded-xl border px-4 py-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">Switch labeling mode</button>
        </aside>
      </div>
    </div>
  );
}
