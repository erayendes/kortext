/**
 * Kortext › Notifications (engine scope) — wireframe-faithful, no backend yet.
 *
 * Maps to `.kpane[data-k=notifications]` in wireframe-v6-hifi.html. Channels
 * connect once at engine scope and every project reuses them (per-project
 * on/off lives in Project › Integrations). There is no notification-channel
 * endpoint yet, so the connected-state shown here is static. TODO: wire to a
 * channel-connection endpoint.
 */
import { Hash, Send } from 'lucide-react';
import { SettingsPane } from '../../components/v6/SettingsPane.tsx';

export function NotificationsRoute() {
  return (
    <SettingsPane
      title="Notifications"
      subtitle={
        <>
          Channels connect once · all projects use them. Per-project toggle in{' '}
          <b style={{ color: 'var(--fg-mid)', fontWeight: 500 }}>Project · Integrations</b>.
        </>
      }
    >
      {/* TODO: no channel-connection endpoint — connected state is static. */}
      <div className="intg-grid">
        <div className="intg-card">
          <div className="intg-head">
            <span className="intg-ico">
              <Hash />
            </span>
            <span className="intg-name">Slack</span>
            <button className="btn btn-line btn-sm">Connect</button>
          </div>
          <div className="intg-desc">Post run + approval alerts to a Slack channel.</div>
        </div>
        <div className="intg-card">
          <div className="intg-head">
            <span className="intg-ico">
              <Send />
            </span>
            <span className="intg-name">Telegram</span>
            <button className="btn btn-line btn-sm">Connect</button>
          </div>
          <div className="intg-desc">Direct-message +prime when an approval is waiting.</div>
        </div>
      </div>
    </SettingsPane>
  );
}
