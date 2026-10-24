"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, FileText, Image, ListOrdered, Wallet } from "lucide-react";
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
    answer: "Open a project, read its guidelines, and submit a label for each item. The result appears after submission.",
  },
  {
    question: "How is my work checked?",
    answer: "Reference items, peer agreement, and behavior checks help assess labels. When AI judging is configured, a monitor also checks whether an answer is defensible.",
  },
  {
    question: "When do I get paid?",
    answer: "Approved rewards are split between an instant wallet payment and a short escrow hold. This local demo records mock payouts.",
  },
  {
    question: "What is the trust score?",
    answer: "It tracks your labeling history and affects your pay multiplier. Payouts pause when the score falls below 25.",
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
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#293336]">
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
    <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-9 sm:px-8 lg:px-12 lg:pt-12">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-primary">Labeling workspace</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Find your next task.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pick a project, work through the queue, and track what you earn.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Solana devnet
        </div>
      </div>

      <section aria-label="Your activity" className="mt-9 grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-b p-5 sm:border-r xl:border-b-0">
          <p className="text-xs text-muted-foreground">Tasks available</p>
          <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums">{projects === null ? "—" : openTasks}</p>
          <p className="mt-2 text-xs text-muted-foreground">Across your project queue</p>
        </div>
        <div className="border-b p-5 xl:border-b-0 xl:border-r">
          <p className="text-xs text-muted-foreground">Labels submitted</p>
          <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums">{session.labelsTotal ?? 0}</p>
          <p className="mt-2 text-xs text-muted-foreground">Your completed work</p>
        </div>
        <div className="border-b p-5 sm:border-b-0 sm:border-r">
          <p className="text-xs text-muted-foreground">Total paid</p>
          <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums">{sol(session.lamportsEarned ?? "0", 3)}</p>
          <p className="mt-2 text-xs text-muted-foreground">{sol(session.escrowLamports ?? "0", 3)} awaiting release</p>
        </div>
        <div className="p-5">
          <p className="text-xs text-muted-foreground">Trust score</p>
          <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums">{Math.round(session.trust ?? 60)}<span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span></p>
          <p className="mt-2 text-xs text-muted-foreground">{session.paused ? "Payouts paused" : "Sets your pay multiplier"}</p>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="projects-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="projects-heading" className="text-xl font-semibold tracking-tight">Projects</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose the work you want to do.</p>
          </div>
          <div className="flex gap-1 rounded-lg border bg-card p-1" aria-label="Project status">
            {(["available", "completed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setView(status)}
                aria-pressed={view === status}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${view === status ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.8fr)_100px_115px_135px_110px] gap-5 border-b bg-[#151c1f] px-6 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground lg:grid">
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
              <div key={project.id} className="border-b px-5 py-5 last:border-b-0 transition-colors hover:bg-[#182124] lg:grid lg:grid-cols-[minmax(0,1.8fr)_100px_115px_135px_110px] lg:items-center lg:gap-5 lg:px-6">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
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
            Connect your devnet wallet to start a task.
          </div>
        )}
      </section>

      <section className="mt-14 grid gap-8 border-t pt-10 md:grid-cols-[220px_minmax(0,1fr)]" aria-labelledby="faq-heading">
        <div>
          <h2 id="faq-heading" className="text-lg font-semibold">Questions</h2>
          <p className="mt-1 text-sm text-muted-foreground">The basics before you start.</p>
        </div>
        <div className="divide-y border-t">
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
  );
}
