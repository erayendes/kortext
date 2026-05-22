import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiGet } from './api.ts';
import type { PendingQuestion } from './api-types.ts';

/**
 * Single polling source for /api/questions, fanned out to all consumers
 * (header bell, dashboard card, toast emitter). Detecting "new" questions
 * is done via id-set diff so the same poll feeds both the badge count and
 * the toast trigger.
 */

type QuestionsState = {
  questions: PendingQuestion[];
  error: string | null;
  /** IDs that appeared since the last successful poll. Resets each tick. */
  newSinceLastPoll: number[];
  refresh: () => void;
};

const Ctx = createContext<QuestionsState | null>(null);

export function PendingQuestionsProvider({
  children,
  intervalMs = 3000,
}: {
  children: ReactNode;
  intervalMs?: number;
}) {
  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newSinceLastPoll, setNewSinceLastPoll] = useState<number[]>([]);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const run = async () => {
      try {
        const r = await apiGet<{ questions: PendingQuestion[] }>('/api/questions');
        if (!aliveRef.current) return;
        const currentIds = new Set(r.questions.map((q) => q.id));
        const fresh: number[] = [];
        for (const id of currentIds) {
          if (!seenIdsRef.current.has(id)) fresh.push(id);
        }
        seenIdsRef.current = currentIds;
        setQuestions(r.questions);
        setNewSinceLastPoll(fresh);
        setError(null);
      } catch (e) {
        if (!aliveRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    void run();
    const id = setInterval(run, intervalMs);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  const refresh = () => {
    void apiGet<{ questions: PendingQuestion[] }>('/api/questions').then((r) => {
      seenIdsRef.current = new Set(r.questions.map((q) => q.id));
      setQuestions(r.questions);
      setNewSinceLastPoll([]);
    });
  };

  return (
    <Ctx.Provider value={{ questions, error, newSinceLastPoll, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePendingQuestions(): QuestionsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePendingQuestions called outside provider');
  return v;
}
