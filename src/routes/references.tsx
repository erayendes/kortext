import { PageHeader } from '../components/PageHeader.tsx';
import { MarkdownViewer } from '../components/MarkdownViewer.tsx';

export function ReferencesRoute() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="References"
        subtitle="Blueprint, ADRs, domain glossary — human source-of-truth."
      />
      <div className="flex-1 min-h-0">
        <MarkdownViewer scope="references" subtitle="workspace/references/" />
      </div>
    </div>
  );
}
