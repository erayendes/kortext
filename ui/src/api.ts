export interface Project {
  id: number;
  name: string;
  code: string;
  repo_path: string;
  paused?: number;
  archived?: number;
  created_at: string;
  docCounts?: {
    core: { settled: number; total: number };
    foundation: { settled: number; total: number };
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface DocInfo {
  rel: string;
  group: 'core' | 'foundation';
  name: string;
  status: string;
  author: string | null;
  inputs: string[];
  blocked: boolean;
  upstreamChanged: boolean;
  openQuestions: boolean;
  hasProducingStep: boolean;
  revisionRequests: Array<{ from: string; reason: string }>;
}

export interface KopengPlan {
  exists: boolean;
  status: string | null;
  versions: number;
  epics: number;
  tasks: number;
}

export interface HandshakeState {
  analysisComplete: boolean;
  kopengInstalled: boolean;
  transferred: boolean;
}

export interface EngineInfo {
  id: string;
  available: boolean;
  installHint: string;
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
  engines: () => req<{ engines: EngineInfo[]; selected: string | null }>('/api/engines'),
  selectEngine: (id: string) =>
    req<{ selected: string }>('/api/engines', { method: 'PUT', body: JSON.stringify({ id }) }),
  jobs: (projectId: number) => req<{ jobs: Job[]; running: Job | null }>(`/api/projects/${projectId}/jobs`),
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
    req<{ content: string }>(`/api/projects/${projectId}/docs/content?rel=${encodeURIComponent(rel)}`),
  saveDoc: (projectId: number, rel: string, content: string) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/docs/content`, {
      method: 'PUT',
      body: JSON.stringify({ rel, content }),
    }),
  sendBack: (projectId: number, rel: string) =>
    req<{ started: string; notes: number }>(`/api/projects/${projectId}/docs/send-back`, {
      method: 'POST',
      body: JSON.stringify({ rel }),
    }),
  dismissRequests: (projectId: number, rel: string) =>
    req<{ dismissed: number }>(`/api/projects/${projectId}/docs/dismiss-request`, {
      method: 'POST',
      body: JSON.stringify({ rel }),
    }),
  reviseDoc: (projectId: number, rel: string, notes: string[]) =>
    req<{ started: string }>(`/api/projects/${projectId}/docs/revise`, {
      method: 'POST',
      body: JSON.stringify({ rel, notes }),
    }),
  explainDoc: (
    projectId: number,
    rel: string,
    excerpt: string,
    question: string,
    history: Array<{ q: string; a: string }>,
  ) =>
    req<{ answer: string }>(`/api/projects/${projectId}/docs/explain`, {
      method: 'POST',
      body: JSON.stringify({ rel, excerpt, question, history }),
    }),
  approveDoc: (projectId: number, rel: string) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/docs/approve`, {
      method: 'POST',
      body: JSON.stringify({ rel }),
    }),
  createProject: (input: {
    name: string;
    repoPath: string;
    kind: 'new' | 'existing';
    code?: string;
    brief?: string;
    docLang?: string;
  }) =>
    req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  pickDirectory: () => req<{ path: string | null }>('/api/pick-directory', { method: 'POST' }),
  removeProject: (id: number) => req<{ removed: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  pauseProject: (id: number, paused: boolean) =>
    req<{ paused: boolean }>(`/api/projects/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify({ paused }),
    }),
  restartProject: (id: number) => req<{ ok: boolean }>(`/api/projects/${id}/restart`, { method: 'POST' }),
  cancelProject: (id: number) => req<{ ok: boolean }>(`/api/projects/${id}/cancel`, { method: 'POST' }),
};
