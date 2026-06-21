import Link from "next/link";
import type { ReactNode } from "react";
import Brand from "./Brand";

const workflow = [
  { number: "01", label: "Describe", status: "active" },
  { number: "02", label: "Choose", status: "upcoming" },
  { number: "03", label: "Edit", status: "upcoming" },
  { number: "04", label: "Preview", status: "upcoming" },
  { number: "05", label: "Run", status: "upcoming" },
  { number: "06", label: "Results", status: "upcoming" },
  { number: "07", label: "Export", status: "upcoming" },
] as const;

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <div className="fc-workspace">
      <header className="fc-workspace__header">
        <Brand href="/" />
        <div className="fc-workspace__header-center">
          <span className="fc-status-dot" />
          Local workspace
        </div>
        <nav className="fc-workspace__header-actions" aria-label="Workspace">
          <Link href="/legacy">Legacy interface</Link>
          <button className="fc-icon-button" type="button" aria-label="Help">
            ?
          </button>
        </nav>
      </header>

      <aside className="fc-workspace__rail">
        <div className="fc-workspace__rail-heading">
          <span>New robot test</span>
          <strong>Untitled task</strong>
        </div>
        <ol className="fc-workflow-steps" aria-label="Test creation steps">
          {workflow.map((step) => (
            <li
              className={`fc-workflow-step fc-workflow-step--${step.status}`}
              key={step.number}
            >
              <span>{step.number}</span>
              <strong>{step.label}</strong>
              <i aria-hidden="true" />
            </li>
          ))}
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
