"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, FileText, Image, ListOrdered, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  done_by_me: number;
}

const PROJECT_META = {
  text: {
    label: "Text",
    description: "Classify the sentiment of short reviews",
    icon: FileText,
  },
  pairwise: {
    label: "Evaluation",
    description: "Compare two responses and choose the better one",
    icon: ListOrdered,
  },
  image: {
    label: "Image",
    description: "Identify the main subject in a photo",
    icon: Image,
  },
} as const;

const FAQ = [
  {
    question: "How does labeling work?",
    answer: "Open a project, read the guidelines, label each item.",
  },
  {
    question: "How is my work checked?",
    answer: "Hidden reference items, peer agreement, and an AI monitor that flags only indefensible answers.",
  },
  {
    question: "When do I get paid?",
    answer: "On approval. 70% hits your wallet instantly, 30% vests from escrow.",
  },
  {
    question: "What is the trust score?",
    answer: "Your track record. It sets your pay multiplier and pauses payouts below 25.",
  },
];

function ProjectAction({ project, enabled }: { project: Project; enabled: boolean }) {
  if (!enabled) return <Button size="sm" disabled>Start task</Button>;

  return (
    <Button size="sm" nativeButton={false} render={<Link href={`/label?type=${project.type}`} />}>
      {project.done_by_me > 0 ? "Continue" : "Start task"}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{done}/{total}</span>
    </div>
  );
}

export default function ProjectsPage() {
  const { session } = useSession();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [view, setView] = useState<"available" | "completed">("available");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]));
  }, [session.wallet]);

  const visibleProjects = (projects ?? []).filter((project) =>
    view === "available"
      ? project.done_by_me < project.human_tasks
      : project.human_tasks > 0 && project.done_by_me >= project.human_tasks,
  );
  const openTasks = (projects ?? []).reduce(
    (count, project) => count + Math.max(0, project.human_tasks - project.done_by_me),
    0,
  );

  return (
    <div className="overflow-hidden pb-24">
      <section className="paper-grid relative mx-auto grid min-h-[calc(100svh-72px)] max-w-[1600px] border-x border-foreground/15 lg:grid-cols-[minmax(0,1.2fr)_minmax(390px,0.8fr)]">
        <div className="relative z-10 flex flex-col justify-between px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
          <p className="eyebrow flex items-center gap-3"><span className="inline-block h-2 w-2 rounded-full bg-primary ring-2 ring-foreground" />Human judgment, onchain</p>
          <div className="my-16 max-w-5xl">
            <h1 className="text-balance text-[58px] font-black leading-[0.88] tracking-[-0.085em] sm:text-[82px] lg:text-[92px] xl:text-[118px]">
              AI guesses.<br /><span className="display-serif font-normal italic">Humans know.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-7 sm:text-xl">Label what models can&apos;t. Get paid in SOL per approved label.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" nativeButton={false} render={<Link href="/label" />}>Start a task <ArrowUpRight className="size-4" /></Button>
            <Link href="#projects-heading" className="group inline-flex items-center gap-2 text-sm font-bold underline decoration-2 underline-offset-4">Projects <ArrowRight className="size-4 transition group-hover:translate-x-1" /></Link>
          </div>
        </div>

        <div className="relative min-h-[540px] overflow-hidden border-t border-foreground bg-[#4169e1] lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="absolute inset-8 rounded-full border-2 border-foreground/60 sm:inset-16">
            <div className="signal-orbit absolute inset-4 rounded-full border border-dashed border-foreground/70">
              <span className="absolute left-1/2 top-0 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-foreground bg-secondary text-center text-[10px] font-black uppercase leading-3 tracking-wider">Human<br />signal</span>
            </div>
          </div>
          <div className="gentle-float absolute left-[12%] top-[18%] w-48 -rotate-6 border-2 border-foreground bg-card p-4 shadow-[7px_7px_0_#171713] sm:w-56">
            <p className="eyebrow">Model says</p><p className="mt-6 text-4xl font-black">67%</p><p className="mt-1 text-sm">Bicycle?</p>
          </div>
          <div className="gentle-float absolute bottom-[15%] right-[10%] w-52 rotate-3 border-2 border-foreground bg-primary p-4 shadow-[7px_7px_0_#171713] [animation-delay:-2s] sm:w-60">
            <p className="eyebrow">Human confirms</p><p className="mt-6 display-serif text-4xl italic">Motorcycle.</p>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-y-2 border-foreground bg-secondary py-3">
        <div className="ticker-track flex w-max whitespace-nowrap text-sm font-black uppercase tracking-[0.16em]">
          {[0, 1, 2, 3].map((copy) => <div key={copy} className="flex gap-8 pr-8"><span>Label ✦</span><span>Verify ✦</span><span>Get paid ✦</span></div>)}
        </div>
      </div>

      <section aria-label="Your activity" className="mx-auto grid max-w-[1600px] border-x border-b border-foreground bg-foreground text-background sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Tasks waiting", projects === null ? "—" : openTasks, ""],
          ["Labels shipped", session.labelsTotal ?? 0, ""],
          ["SOL earned", sol(session.lamportsEarned ?? "0", 3), `${sol(session.escrowLamports ?? "0", 3)} in escrow`],
          ["Trust score", `${Math.round(session.trust ?? 60)}/100`, session.paused ? "Payouts paused" : ""],
        ].map(([label, value, note], index) => <div key={String(label)} className={`p-6 sm:p-8 ${index < 3 ? "border-b border-background/25 xl:border-b-0 xl:border-r" : ""}`}><p className="eyebrow text-background/55">{label}</p><p className="mt-5 text-4xl font-black leading-none tabular-nums sm:text-5xl">{value}</p>{note ? <p className="mt-3 text-xs text-background/50">{note}</p> : null}</div>)}
      </section>

      <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-14">

      <section className="mt-24" aria-labelledby="projects-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">Projects</p>
            <h2 id="projects-heading" className="mt-3 text-5xl font-black tracking-[-0.06em] sm:text-7xl">Open <span className="display-serif font-normal italic">projects.</span></h2>
          </div>
          <div className="flex gap-1 border-2 border-foreground bg-card p-1" aria-label="Project status">
            {(["available", "completed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setView(status)}
                aria-pressed={view === status}
                className={`rounded-sm px-4 py-2 text-xs font-bold capitalize transition-colors ${view === status ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 overflow-hidden border-2 border-foreground bg-card shadow-[8px_8px_0_var(--foreground)]">
          <div className="hidden grid-cols-[minmax(0,1.8fr)_100px_115px_135px_110px] gap-5 border-b bg-gray-50 px-6 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground lg:grid">
            <span>Project</span>
            <span>Available</span>
            <span>Pay / label</span>
            <span>Your progress</span>
            <span className="sr-only">Action</span>
          </div>

          {projects === null && <p className="px-6 py-12 text-center text-sm text-muted-foreground">Loading projects…</p>}
          {projects !== null && visibleProjects.length === 0 && (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
              {view === "completed" ? "No completed projects yet." : "No projects available right now."}
            </p>
          )}

          {visibleProjects.map((project) => {
            const meta = PROJECT_META[project.type];
            const Icon = meta.icon;
            const remaining = Math.max(0, project.human_tasks - project.done_by_me);

            return (
              <div key={project.id} className="border-b border-foreground/30 px-5 py-6 last:border-b-0 transition-colors hover:bg-secondary/35 lg:grid lg:grid-cols-[minmax(0,1.8fr)_100px_115px_135px_110px] lg:items-center lg:gap-5 lg:px-6">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="flex size-10 shrink-0 -rotate-2 items-center justify-center rounded-full border-2 border-foreground bg-primary text-foreground">
                    <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{project.title}</h3>
                      <span className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">{meta.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
                    <details className="mt-1.5 text-xs text-muted-foreground">
                      <summary className="w-fit cursor-pointer hover:text-foreground">Guidelines</summary>
                      <p className="mt-2 max-w-lg leading-5">{project.guidelines}</p>
                    </details>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between text-sm lg:mt-0 lg:block">
                  <span className="text-xs text-muted-foreground lg:hidden">Available</span>
                  <span className="font-medium tabular-nums">{remaining}<span className="ml-1 text-xs font-normal text-muted-foreground">tasks</span></span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm lg:mt-0 lg:block">
                  <span className="text-xs text-muted-foreground lg:hidden">Pay / label</span>
                  <span className="font-medium tabular-nums">{sol(project.pay_lamports, 3)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between lg:mt-0 lg:block">
                  <span className="text-xs text-muted-foreground lg:hidden">Your progress</span>
                  <Progress done={project.done_by_me} total={project.human_tasks} />
                </div>
                <div className="mt-5 flex justify-end lg:mt-0">
                  {view === "available" && <ProjectAction project={project} enabled={!!session.wallet} />}
                  {view === "completed" && <span className="text-xs font-medium text-primary">Completed</span>}
                </div>
              </div>
            );
          })}
        </div>

        {!session.wallet && session.loaded && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
            <Wallet className="size-4 shrink-0" aria-hidden="true" />
            Connect your testnet wallet to start a task.
          </div>
        )}
      </section>

      <section className="mt-24 grid gap-8 border-t-2 border-foreground pt-10 md:grid-cols-[280px_minmax(0,1fr)]" aria-labelledby="faq-heading">
        <div>
          <h2 id="faq-heading" className="text-4xl font-black">Good <span className="display-serif font-normal italic">questions.</span></h2>
        </div>
        <div className="divide-y divide-foreground/30 border-t-2 border-foreground">
          {FAQ.map(({ question, answer }, index) => (
            <div key={question}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                aria-expanded={openFaq === index}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium"
              >
                {question}
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${openFaq === index ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {openFaq === index && <p className="max-w-2xl pb-4 text-sm leading-6 text-muted-foreground">{answer}</p>}
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
