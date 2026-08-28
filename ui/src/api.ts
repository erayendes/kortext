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

export const api = {
  listProjects: () => req<{ projects: Project[] }>('/api/projects'),
  createProject: (input: { name: string; repoPath: string; mode: 'new' | 'existing' }) =>
    req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
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
