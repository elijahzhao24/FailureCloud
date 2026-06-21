import type {
  RobotTestSuggestion,
  Scenario,
  SensorName,
  TestGenerationRequest,
  TestGenerationResponse,
} from "./types";

const STORAGE_KEY = "failurecloud.workspace.v1";

export type WorkspaceSession = {
  version: 1;
  request: TestGenerationRequest;
  response: TestGenerationResponse;
  selectedTestId: string | null;
  runIds?: Record<string, string>;
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

function sensorsForScenario(scenario: Scenario): SensorName[] {
  const sensors: SensorName[] = [];
  if (scenario.sensors.rgb_camera.enabled) sensors.push("rgb");
  if (scenario.sensors.depth_camera.enabled) sensors.push("depth");
  if (scenario.sensors.lidar.enabled) sensors.push("lidar");
  sensors.push("collision", "pose");
  return sensors;
}

function successLabel(scenario: Scenario): string {
  const success = scenario.task.success;
  return (
    `Reach the goal with at least ${success.min_water_left_percent.toFixed(0)}% ` +
    `water remaining and no more than ${success.max_collisions} collision` +
    `${success.max_collisions === 1 ? "" : "s"}.`
  );
}

export function updateSuggestionScenario(
  testId: string,
  scenario: Scenario,
): RobotTestSuggestion | null {
  const session = loadWorkspaceSession();
  if (!session) return null;

  let updated: RobotTestSuggestion | null = null;
  const suggestions = session.response.suggestions.map((suggestion) => {
    if (suggestion.test_id !== testId) return suggestion;
    updated = {
      ...suggestion,
      scenario,
      sensors: sensorsForScenario(scenario),
      success_criteria: successLabel(scenario),
    };
    return updated;
  });
  if (!updated) return null;

  const next: WorkspaceSession = {
    ...session,
    selectedTestId: testId,
    response: { ...session.response, suggestions },
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return updated;
}

export function saveRunForTest(testId: string, runId: string): void {
  const session = loadWorkspaceSession();
  if (!session) return;
  const next: WorkspaceSession = {
    ...session,
    runIds: { ...session.runIds, [testId]: runId },
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
