export interface Project {
  id: number;
  name: string;
  repo_path: string;
  created_at: string;
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

export interface KortextRequest {
  id: number;
  project_id: number;
  type: 'revise' | 'report' | 'planning' | 'question';
  payload: string;
  status: 'pending' | 'done' | 'cancelled';
  created_at: string;
  completed_at: string | null;
}

export interface DocInfo {
  rel: string;
  group: 'core' | 'foundation';
  name: string;
  status: string;
  author: string | null;
  inputs: string[];
  blocked: boolean;
  revisionPending: boolean;
  upstreamChanged: boolean;
}

export interface ReportInfo {
  rel: string;
  name: string;
  type: string | null;
  created_at: string;
}

export interface PlanState {
  backlogExists: boolean;
  todoExists: boolean;
  todoStatus: string | null;
  planningPending: boolean;
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
  status: 'running' | 'done' | 'failed';
  error: string | null;
}

export const api = {
  listProjects: () => req<{ projects: Project[] }>('/api/projects'),
  engines: () => req<{ engines: EngineInfo[]; selected: string | null }>('/api/engines'),
  selectEngine: (id: string) =>
    req<{ selected: string }>('/api/engines', { method: 'PUT', body: JSON.stringify({ id }) }),
  jobs: (projectId: number) => req<{ jobs: Job[]; running: Job | null }>(`/api/projects/${projectId}/jobs`),
  runNext: (projectId: number) =>
    req<{ started: string }>(`/api/projects/${projectId}/run-next`, { method: 'POST' }),
  handshake: (projectId: number) => req<HandshakeState>(`/api/projects/${projectId}/handshake`),
  listReports: (projectId: number) => req<{ reports: ReportInfo[] }>(`/api/projects/${projectId}/reports`),
  generateChangeReport: (projectId: number) =>
    req<{ report: ReportInfo }>(`/api/projects/${projectId}/reports/change`, { method: 'POST' }),
  listDocs: (projectId: number) => req<{ docs: DocInfo[] }>(`/api/projects/${projectId}/docs`),
  docContent: (projectId: number, rel: string) =>
    req<{ content: string }>(`/api/projects/${projectId}/docs/content?rel=${encodeURIComponent(rel)}`),
  saveDoc: (projectId: number, rel: string, content: string) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/docs/content`, {
      method: 'PUT',
      body: JSON.stringify({ rel, content }),
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
  createProject: (input: { name: string; repoPath: string; kind: 'new' | 'existing'; code?: string; brief?: string }) =>
    req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  pickDirectory: () => req<{ path: string | null }>('/api/pick-directory', { method: 'POST' }),
  removeProject: (id: number) => req<{ removed: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  listRequests: (projectId: number, status?: string) =>
    req<{ requests: KortextRequest[] }>(
      `/api/projects/${projectId}/requests${status ? `?status=${status}` : ''}`,
    ),
  createRequest: (projectId: number, type: string, payload: unknown) =>
    req<{ request: KortextRequest }>(`/api/projects/${projectId}/requests`, {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    }),
  cancelRequest: (id: number) => req<{ cancelled: boolean }>(`/api/requests/${id}/cancel`, { method: 'POST' }),
};
