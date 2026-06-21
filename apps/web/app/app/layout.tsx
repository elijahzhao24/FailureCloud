import type { ReactNode } from "react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";

export const metadata = {
  title: "New robot test · FailureCloud",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
