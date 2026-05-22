import { PageHeader } from '../components/PageHeader.tsx';
import { MarkdownViewer } from '../components/MarkdownViewer.tsx';

export function ReportsRoute() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Reports"
        subtitle="Generated artifacts — analysis, planning, postmortems."
      />
      <div className="flex-1 min-h-0">
        <MarkdownViewer scope="reports" subtitle="workspace/reports/" />
      </div>
    </div>
  );
}
