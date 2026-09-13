export interface Project {
  id: number;
  name: string;
  code: string;
  repo_path: string;
  engine?: string;
  model?: string;
  paused?: number;
  archived?: number;
  created_at: string;
  docCounts?: { settled: number; total: number };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  // Preserve HTTP status errors when the response body is empty or not JSON.
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText || 'no answer'}`);
    throw new Error('the server answered with something that is not JSON');
  }
  const error = (body as { error?: string } | null)?.error;
  if (!res.ok) throw new Error(error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface DocInfo {
  rel: string;
  name: string;
  status: string;
  author: string | null;
  inputs: string[];
  blocked: boolean;
  dependentOn: string[];
  openQuestions: boolean;
  hasProducingStep: boolean;
  revisionRequests: Array<{ from: string; reason: string }>;
  denied: Array<{ from: string; reason: string }>;
  outgoing: Array<{ target: string; reason: string }>;
  warnings: Array<{ subject: string; reason: string }>;
  conflicts: Array<{ from: string; reason: string }>;
  section: 'needs' | 'doing' | 'todo' | 'done';
  state: 'waiting' | 'writing' | 'reading' | 'paused' | 'failed' | 'approved' | 'n/a';
  detail: 'approve' | 'review' | 'queue' | 'recheck' | 'draft' | 'revision' | null;
  pendingRecheck: boolean;
}

export interface KopengPlan {
  exists: boolean;
  status: string | null;
  versions: number;
  epics: number;
  tasks: number;
}

export interface DocVersion {
  id: number;
  sha: string;
  /** The same hash over the body alone — approving changes the file, not the document. */
  bodySha: string;
  source: string;
  created_at: string;
}

export interface HandshakeState {
  analysisComplete: boolean;
  kopengInstalled: boolean;
  transferred: boolean;
  /** Written documents. */
  documents: number;
  /** Conflicts and findings — decisions deferred to the build phase. */
  handedOver: number;
}

export interface EngineInfo {
  id: string;
  available: boolean;
  installHint: string;
  models?: string[];
  untested?: boolean;
}

export interface Job {
  id: number;
  project_id: number;
  doc_rel: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
  error: string | null;
}

export interface Readiness {
  ready: boolean;
  stage: 'floor' | 'judgment' | 'error' | 'no-engine';
  questions: string[];
  briefHash: string;
  checkedAt: string;
}

export const api = {
  health: () => req<{ ok: boolean; db: string; version: string }>('/api/health'),
  listProjects: () => req<{ projects: Project[] }>('/api/projects'),
  archiveProject: (projectId: number, archived: boolean) =>
    req<{ archived: number }>(`/api/projects/${projectId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ archived }),
    }),
  version: () => req<{ current: string; latest: string | null; stale: boolean }>('/api/version'),
  selfUpdate: () => req<{ ok: boolean; output: string }>('/api/version/update', { method: 'POST' }),
  quit: () => req<{ ok: boolean }>('/api/quit', { method: 'POST' }),
  engines: () => req<{ engines: EngineInfo[]; selected: string | null }>('/api/engines'),
  selectEngine: (id: string) =>
    req<{ selected: string }>('/api/engines', { method: 'PUT', body: JSON.stringify({ id }) }),
  setProjectEngine: (projectId: number, id: string) =>
    req<{ engine: string }>(`/api/projects/${projectId}/engine`, {
      method: 'PUT',
      body: JSON.stringify({ id }),
    }),
  setProjectModel: (projectId: number, model: string) =>
    req<{ model: string }>(`/api/projects/${projectId}/model`, {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }),
  jobs: (projectId: number) =>
    req<{ jobs: Job[]; running: Job | null }>(`/api/projects/${projectId}/jobs`),
  runNext: (projectId: number) =>
    req<{ started: string }>(`/api/projects/${projectId}/run-next`, { method: 'POST' }),
  handshake: (projectId: number) => req<HandshakeState>(`/api/projects/${projectId}/handshake`),
  readiness: (projectId: number) =>
    req<{ readiness: Readiness | null; checking: boolean }>(`/api/projects/${projectId}/readiness`),
  transfer: (projectId: number, notes?: string[]) =>
    req<{ started: string }>(`/api/projects/${projectId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  kopengPlan: (projectId: number) => req<KopengPlan>(`/api/projects/${projectId}/kopeng`),
  approvePlan: (projectId: number) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/kopeng/approve`, { method: 'POST' }),
  listDocs: (projectId: number) => req<{ docs: DocInfo[] }>(`/api/projects/${projectId}/docs`),
  docContent: (projectId: number, rel: string) =>
    req<{ content: string; version: string }>(
      `/api/projects/${projectId}/docs/content?rel=${encodeURIComponent(rel)}`,
    ),
  saveDoc: (
    projectId: number,
    rel: string,
    content: string,
    expectedVersion: string,
    settleRequests = false,
  ) =>
    req<{ ok: boolean; content: string; version: string }>(
      `/api/projects/${projectId}/docs/content`,
      {
        method: 'PUT',
        body: JSON.stringify({ rel, content, expectedVersion, settleRequests }),
      },
    ),
  docHistory: (projectId: number, rel: string) =>
    req<{ versions: DocVersion[] }>(
      `/api/projects/${projectId}/docs/history?rel=${encodeURIComponent(rel)}`,
    ),
  docVersionText: (projectId: number, versionId: number) =>
    req<{ content: string; rel: string }>(`/api/projects/${projectId}/docs/history/${versionId}`),
  settleRequests: (
    projectId: number,
    body: {
      rel: string;
      apply: Array<{ from: string; reason: string; note?: string }>;
      deny: Array<{ from: string; reason: string; note?: string }>;
      answers: string[];
      send: Array<{ target: string; reason: string }>;
      discard: Array<{ target: string; reason: string }>;
    },
  ) =>
    req<{ applied: number; denied: number; answered?: number; sent: number; discarded: number }>(
      `/api/projects/${projectId}/docs/settle-requests`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  proposeRevision: (projectId: number, rel: string) =>
    req<{ proposal: string }>(`/api/projects/${projectId}/docs/propose`, {
      method: 'POST',
      body: JSON.stringify({ rel }),
    }),
  reviseDoc: (projectId: number, rel: string, notes: string[]) =>
    req<{ started: string }>(`/api/projects/${projectId}/docs/revise`, {
      method: 'POST',
      body: JSON.stringify({ rel, notes }),
    }),
  retryDoc: (projectId: number, rel: string) =>
    req<{ started: string }>(`/api/projects/${projectId}/docs/retry`, {
      method: 'POST',
      body: JSON.stringify({ rel }),
    }),
  explainDoc: (
    projectId: number,
    rel: string,
    excerpt: string,
    question: string,
    history: Array<{ q: string; a: string }>,
  ) =>
    req<{ answer: string; answeredBy: string }>(`/api/projects/${projectId}/docs/explain`, {
      method: 'POST',
      body: JSON.stringify({ rel, excerpt, question, history }),
    }),
  approveDoc: (projectId: number, rel: string, expectedVersion: string) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/docs/approve`, {
      method: 'POST',
      body: JSON.stringify({ rel, expectedVersion }),
    }),
  createProject: (input: {
    name: string;
    repoPath: string;
    kind: 'new' | 'existing';
    code?: string;
    brief?: string;
    docLang?: string;
    engine?: string;
  }) => req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  pickDirectory: () => req<{ path: string | null }>('/api/pick-directory', { method: 'POST' }),
  removeProject: (id: number) =>
    req<{ removed: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  pauseProject: (id: number, paused: boolean) =>
    req<{ paused: boolean }>(`/api/projects/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify({ paused }),
    }),
  restartProject: (id: number) =>
    req<{ ok: boolean }>(`/api/projects/${id}/restart`, { method: 'POST' }),
  cancelProject: (id: number) =>
    req<{ ok: boolean }>(`/api/projects/${id}/cancel`, { method: 'POST' }),
};
