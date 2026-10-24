"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/stat";
import { useSession } from "@/components/use-session";
import { sol } from "@/components/format";

interface Project {
  id: string;
  type: "text" | "pairwise" | "image";
  title: string;
  guidelines: string;
  pay_lamports: string;
  human_tasks: number;
  auto_tasks: number;
  total_tasks: number;
  avg_conf: number;
  done_by_me: number;
}

const BLURB: Record<Project["type"], string> = {
  text: "Read short reviews and pick the sentiment; most take 5–10 seconds.",
  pairwise: "Compare two assistant replies and pick the better one; most take 20–40 seconds.",
  image: "Say what the main subject of a photo is; most take a few seconds.",
};

const FAQ = [
  { q: "What is it like working here?", a: "You only see items a model could not label confidently. Each card tells you why it needs a human. You label, an agent checks that the answer is defensible, and the payout lands in your wallet within seconds." },
  { q: "How is my work verified?", a: "Hidden reference items, peer consensus, and behavioral signals (speed, repetition) decide pay. The monitor only rejects answers that are absurd under any reading of the guidelines; it never overrides you on a close call. Every 10 labels a larger model audits your batch and adjusts your trust score." },
  { q: "When do I get paid?", a: "70% of each approved label is sent to your wallet immediately. 30% goes into your own on-chain escrow account and is released after a short hold. Missing a hidden reference item slashes the vesting balance." },
  { q: "What is the trust score?", a: "A 0–100 score updated on every label. Above 80 you earn 1.5×, below 40 you earn 0.5×, and below 25 payouts pause for review." },
];

export default function ProjectsPage() {
  const { session } = useSession();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tab, setTab] = useState<"current" | "done">("current");
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" }).then((r) => r.json()).then((d) => setProjects(d.projects)).catch(() => setProjects([]));
  }, [session.wallet]);

  const list = (projects ?? []).filter((p) => (tab === "current" ? p.done_by_me < p.human_tasks : p.done_by_me >= p.human_tasks && p.human_tasks > 0));

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_380px]">
      <section className="px-6 py-8 lg:px-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Your projects</h2>
          <div className="flex rounded-xl bg-muted p-1 text-sm">
            {(["current", "done"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 capitalize transition ${tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
                {t === "current" ? "Current" : "Past"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {projects === null && <p className="py-10 text-center text-muted-foreground">Loading…</p>}
          {projects !== null && list.length === 0 && <p className="py-10 text-center text-muted-foreground">Nothing here yet.</p>}
          {list.map((p) => {
            const left = Math.max(0, p.human_tasks - p.done_by_me);
            const pct = p.human_tasks ? Math.round((100 * p.done_by_me) / p.human_tasks) : 0;
            const started = p.done_by_me > 0;
            return (
              <article key={p.id} className="rounded-2xl border bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                    <p className="mt-1 text-[15px] text-muted-foreground">
                      {sol(p.pay_lamports, 3)}/task · Devnet · Per-label
                    </p>
                    <p className="mt-1 text-[15px] text-muted-foreground">{BLURB[p.type]}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
                    {p.human_tasks} need a human
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button render={<Link href={`/label?type=${p.type}`} />} disabled={!session.wallet}>
                    {started ? "Continue" : "Start task"}
                  </Button>
                  {!started && (
                    <Button variant="outline" render={<a href={`#project-${p.id}`} />}>
                      View project
                    </Button>
                  )}
                  {started && (
                    <>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#9945ff,#14f195)]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[15px] text-muted-foreground">{left} tasks left</span>
                    </>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    model auto-labeled {p.auto_tasks} of {p.total_tasks} · avg confidence on yours {Math.round(p.avg_conf * 100)}%
                  </span>
                </div>
                <details id={`project-${p.id}`} className="mt-4 text-sm text-muted-foreground">
                  <summary className="cursor-pointer select-none">Guidelines</summary>
                  <p className="mt-2">{p.guidelines}</p>
                </details>
              </article>
            );
          })}
        </div>

        {!session.wallet && session.loaded && (
          <div className="mt-6 rounded-2xl border border-dashed p-6 text-center text-[15px] text-muted-foreground">
            Connect a devnet wallet (top right) to start tasks and get paid.
          </div>
        )}

        <h2 className="mb-2 mt-14 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
        <div className="divide-y">
          {FAQ.map((f, i) => (
            <div key={f.q} className="py-4">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between text-left text-lg font-medium">
                {f.q}
                <span className={`text-muted-foreground transition ${open === i ? "rotate-180" : ""}`} aria-hidden>⌄</span>
              </button>
              {open === i && <p className="mt-2 max-w-3xl text-[15px] text-muted-foreground">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <aside className="border-t px-6 py-8 lg:border-l lg:border-t-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-7">
          <StatTile label="Awaiting payout" value={sol(session.escrowLamports ?? "0", 3)} hint="Vesting in your on-chain escrow account" />
          <StatTile label="Total paid" value={sol(session.lamportsEarned ?? "0", 3)} hint="Confirmed on Solana devnet" />
          <StatTile label="Tasks done" value={String(session.labelsTotal ?? 0)} hint="Labels you have submitted" />
          <StatTile label="Trust score" value={String(Math.round(session.trust ?? 60))} hint="Sets your pay multiplier" tone={session.paused ? "bad" : "default"} />
        </div>
        <div className="my-7 border-t" />
        <div className="rounded-2xl border p-5">
          <div className="flex gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#14f195,#9945ff)] text-2xl text-white">◎</span>
            <div>
              <p className="font-semibold">Paid per label, on-chain</p>
              <p className="mt-1 text-sm text-muted-foreground">70% hits your wallet in seconds. 30% vests in your own escrow account and releases after a short hold.</p>
            </div>
          </div>
          <Button variant="outline" className="mt-4 w-full" render={<Link href="/payments" />}>
            View payments
          </Button>
        </div>
      </aside>
    </div>
  );
}
