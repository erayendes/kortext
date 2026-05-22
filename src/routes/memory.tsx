import { PageHeader } from '../components/PageHeader.tsx';
import { HandoverFeed } from '../components/HandoverFeed.tsx';
import { MarkdownViewer } from '../components/MarkdownViewer.tsx';

export function MemoryRoute() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Memory"
        subtitle="Handovers, decisions, learned context — runtime memory."
      />
      <div className="px-6 py-5">
        <HandoverFeed />
      </div>
      <div className="flex-1 min-h-0 border-t border-border-subtle">
        <MarkdownViewer scope="memory" subtitle="workspace/memory/" />
      </div>
    </div>
  );
}
