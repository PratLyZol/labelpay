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
      <div className="paper-grid min-h-[calc(100svh-72px)] border-b border-foreground/20">
      <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
        <div className="max-w-4xl">
          <p className="eyebrow text-primary">Choose your deck</p>
          <h1 className="mt-5 text-5xl font-black leading-[0.96] tracking-[-0.065em] sm:text-7xl lg:text-8xl">Where does your<br /><span className="display-serif font-normal italic">judgment hit hardest?</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">Pick a focused deck, move card by card, and switch whenever you want.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {MODES.map(({ id, name, description, icon: Icon }, index) => (
            <button key={id} type="button" onClick={() => chooseMode(id)} className={`group relative flex min-h-48 items-end gap-4 overflow-hidden border-2 border-foreground p-6 text-left shadow-[6px_6px_0_var(--foreground)] transition duration-200 hover:-translate-y-1 hover:shadow-[9px_9px_0_var(--foreground)] ${index === 0 ? "bg-[#4169e1] text-white" : index === 1 ? "bg-primary" : index === 2 ? "bg-card" : "bg-secondary"}`}>
              <span className="absolute right-5 top-5 flex size-12 rotate-3 items-center justify-center rounded-full border-2 border-foreground bg-background text-foreground transition group-hover:-rotate-6"><Icon className="size-5" strokeWidth={2} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="eyebrow opacity-60">Deck 0{index + 1}</span><span className="mt-6 block text-2xl font-black">{name}</span><span className="mt-1 block text-sm opacity-70">{description}</span></span>
              <span className="text-2xl font-black transition group-hover:translate-x-1">→</span>
            </button>
          ))}
        </div>
        <div className="mt-12 grid grid-cols-3 divide-x-2 divide-foreground border-y-2 border-foreground bg-card py-5 text-center">
          <div><p className="text-lg font-semibold tabular-nums">{session.labelsTotal ?? 0}</p><p className="text-xs text-muted-foreground">Lifetime cards</p></div>
          <div><p className="text-lg font-semibold tabular-nums">{Math.round(session.trust ?? 60)}</p><p className="text-xs text-muted-foreground">Trust score</p></div>
          <div><p className="text-lg font-semibold tabular-nums">{sol(session.lamportsEarned ?? "0", 3)}</p><p className="text-xs text-muted-foreground">Total paid</p></div>
        </div>
      </div></div>
    );
  }

  const activeMode = MODES.find((item) => item.id === mode)!;
  const lastPayout = last?.payoutId ? payoutLinks[last.payoutId] : null;

  return (
    <div className="paper-grid min-h-[calc(100svh-72px)] px-5 py-10 sm:px-8 lg:py-12">
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={changeMode} className="flex size-9 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground shadow-[2px_2px_0_var(--foreground)] transition hover:-translate-y-0.5 hover:bg-secondary" aria-label="Change mode"><ArrowLeft className="size-4" /></button>
          <div><p className="text-sm font-semibold">{activeMode.name}</p><p className="text-xs text-muted-foreground">Card {sessionCompleted + 1} · Select an answer, then move right</p></div>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <span><strong className="font-semibold text-foreground">{sessionCompleted}</strong> completed</span>
          <span><strong className="font-semibold text-primary">{sol(sessionEarned, 3)}</strong> earned</span>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          {session.paused && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Payouts are paused while your trust score recovers. Careful labels will raise it.</div>}
          {done && (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-lg border bg-card px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl border bg-card text-primary"><Check className="size-5" strokeWidth={1.8} /></span>
              <h2 className="mt-5 text-2xl font-semibold">Deck complete</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">You labeled every available card in {activeMode.name.toLowerCase()}.</p>
              <Button className="mt-6" onClick={changeMode}>Choose another mode</Button>
            </div>
          )}
          {task && <TaskCard key={task.id} task={task} onSubmit={submit} busy={busy} />}
          {!task && !done && <div className="flex min-h-[520px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">Preparing the next card…</div>}
          {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void loadNext()}>Try again</Button></div>}
        </section>

        <aside className="space-y-4">
          <div className="border-2 border-foreground bg-secondary p-5 shadow-[5px_5px_0_var(--foreground)]">
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
            <div className={`border-2 border-foreground p-5 shadow-[5px_5px_0_var(--foreground)] ${last.verdict === "approve" ? "bg-card" : "bg-red-50"}`}>
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
            <div className="border-2 border-dashed border-foreground/45 bg-background/70 p-5 text-sm text-muted-foreground">Your last result and reward will appear here.</div>
          )}

          <button type="button" onClick={changeMode} className="w-full rounded-xl border px-4 py-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">Switch labeling mode</button>
        </aside>
      </div></div>
    </div>
  );
}
