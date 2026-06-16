/**
 * ItemDrawerHost — a *global* item-detail drawer, openable from anywhere via the
 * `open-item` shell event (e.g. the footer Agents popover). It mirrors the
 * board's own item drawer (same `ItemDrawer` component) so an item opened from
 * the dashboard chrome looks identical to one opened on the board.
 *
 * Self-contained: on `open-item` it fetches the backlog to resolve the id into a
 * full item + a `byId` map (the drawer needs the map for dependency / lock
 * rendering), then re-fetches on any mutation so edits inside the drawer stick.
 */
import { useState } from 'react';
import { apiGet } from '../lib/api.ts';
import type { BacklogItem } from '../lib/api-types.ts';
import { Drawer } from '../components/v6/Drawer.tsx';
import { ItemDrawer } from '../routes/board.tsx';
import { useShellEvent } from './shell-events.ts';

export function ItemDrawerHost() {
  const [id, setId] = useState<string | null>(null);
  const [items, setItems] = useState<BacklogItem[]>([]);

  function load() {
    apiGet<{ items: BacklogItem[] }>('/api/backlog?limit=500')
      .then((r) => setItems(r.items))
      .catch(() => undefined);
  }

  useShellEvent('open-item', (e) => {
    const next = e.detail?.id;
    if (!next) return;
    setId(next);
    load();
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  const item = id ? byId.get(id) ?? null : null;

  return (
    <Drawer open={!!item} onClose={() => setId(null)}>
      {item && (
        <ItemDrawer
          item={item}
          byId={byId}
          onClose={() => setId(null)}
          onMutated={load}
          onOpenItem={(next) => {
            setId(next);
            load();
          }}
        />
      )}
    </Drawer>
  );
}
