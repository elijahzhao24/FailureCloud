import type {
  RobotTestSuggestion,
  TestGenerationRequest,
  TestGenerationResponse,
} from "./types";

const STORAGE_KEY = "failurecloud.workspace.v1";

export type WorkspaceSession = {
  version: 1;
  request: TestGenerationRequest;
  response: TestGenerationResponse;
  selectedTestId: string | null;
};

export function loadWorkspaceSession(): WorkspaceSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSession;
    if (parsed.version !== 1 || !Array.isArray(parsed.response?.suggestions)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveGeneratedTests(
  request: TestGenerationRequest,
  response: TestGenerationResponse,
): WorkspaceSession {
  const session: WorkspaceSession = {
    version: 1,
    request,
    response,
    selectedTestId: null,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function saveSelectedTest(testId: string): WorkspaceSession | null {
  const session = loadWorkspaceSession();
  if (!session) return null;
  if (!session.response.suggestions.some((item) => item.test_id === testId)) {
    return null;
  }

  const next = { ...session, selectedTestId: testId };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function selectedSuggestion(
  session: WorkspaceSession | null,
): RobotTestSuggestion | null {
  if (!session?.selectedTestId) return null;
  return (
    session.response.suggestions.find(
      (item) => item.test_id === session.selectedTestId,
    ) ?? null
  );
}
