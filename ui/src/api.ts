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

export const api = {
  listProjects: () => req<{ projects: Project[] }>('/api/projects'),
  createProject: (input: { name: string; repoPath: string; mode: 'new' | 'existing' }) =>
    req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  removeProject: (id: number) => req<{ removed: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
};
