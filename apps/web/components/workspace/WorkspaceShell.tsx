"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { loadWorkspaceSession } from "@/lib/workspace-session";
import Brand from "./Brand";

const workflow = [
  { number: "01", label: "Describe", href: "/app" },
  { number: "02", label: "Choose", href: "/app/tests" },
  { number: "03", label: "Edit", href: null },
  { number: "04", label: "Preview", href: null },
  { number: "05", label: "Run", href: null },
  { number: "06", label: "Results", href: null },
  { number: "07", label: "Export", href: null },
] as const;

function activeStep(pathname: string): number {
  if (/^\/app\/tests\/[^/]+\/edit/.test(pathname)) return 2;
  if (/^\/app\/tests\/[^/]+\/preview/.test(pathname)) return 3;
  if (/^\/app\/runs\/[^/]+\/export/.test(pathname)) return 6;
  if (/^\/app\/runs\/[^/]+\/results/.test(pathname)) return 5;
  if (/^\/app\/runs\/[^/]+/.test(pathname)) return 4;
  if (pathname.startsWith("/app/tests")) return 1;
  return 0;
}

function taskLabel(task: string): string {
  const clean = task.trim().replace(/\s+/g, " ");
  return clean.length > 34 ? `${clean.slice(0, 31).trim()}…` : clean;
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [title, setTitle] = useState("Untitled task");
  const currentStep = activeStep(pathname);

  useEffect(() => {
    const session = loadWorkspaceSession();
    setTitle(session ? taskLabel(session.response.source_task) : "Untitled task");
  }, [pathname]);

  return (
    <div className="fc-workspace">
      <header className="fc-workspace__header">
        <Brand href="/" />
        <div className="fc-workspace__header-center">
          <span className="fc-status-dot" />
          Local workspace
        </div>
        <nav className="fc-workspace__header-actions" aria-label="Workspace">
          <button className="fc-icon-button" type="button" aria-label="Help">
            ?
          </button>
        </nav>
      </header>

      <aside className="fc-workspace__rail">
        <div className="fc-workspace__rail-heading">
          <span>New robot test</span>
          <strong title={title}>{title}</strong>
        </div>
        <ol className="fc-workflow-steps" aria-label="Test creation steps">
          {workflow.map((step, index) => {
            const status =
              index === currentStep
                ? "active"
                : index < currentStep
                  ? "complete"
                  : "upcoming";
            const content = (
              <>
                <span>{step.number}</span>
                <strong>{step.label}</strong>
                <i aria-hidden="true" />
              </>
            );

            return (
              <li
                className={`fc-workflow-step fc-workflow-step--${status}`}
                key={step.number}
              >
                {step.href && index <= currentStep ? (
                  <Link
                    aria-current={status === "active" ? "step" : undefined}
                    className="fc-workflow-step__content"
                    href={step.href}
                  >
                    {content}
                  </Link>
                ) : (
                  <span className="fc-workflow-step__content">{content}</span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="fc-workspace__rail-footer">
          <span className="fc-badge fc-badge--muted">MVP</span>
          <p>Warehouse and mobile robot scenarios are currently supported.</p>
        </div>
      </aside>

      <main className="fc-workspace__main">{children}</main>
    </div>
  );
}
