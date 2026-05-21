import { useEffect, useState } from 'react';

type Health = { status: string; version: string; uptimeMs: number };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <section className="max-w-md w-full rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-xl">
        <h1 className="text-3xl font-semibold tracking-tight">Kortext v3</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Autonomous AI agent runtime — stack iskeleti hazır.
        </p>
        <div className="mt-6 rounded-lg bg-neutral-950 border border-neutral-800 p-4 font-mono text-xs">
          {err && <span className="text-red-400">API hata: {err}</span>}
          {!err && !health && <span className="text-neutral-500">/api/health çağrılıyor…</span>}
          {health && (
            <pre className="text-emerald-400 whitespace-pre-wrap">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>
      </section>
    </main>
  );
}
