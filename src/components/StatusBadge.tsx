const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  setup: { label: "Setup", cls: "badge-slate" },
  data_imported: { label: "Data Imported", cls: "badge-blue" },
  draft_ready: { label: "Draft Ready", cls: "badge-amber" },
  drafting: { label: "Drafting", cls: "badge-amber" },
  drafted: { label: "Drafted", cls: "badge-green" },
  scoring: { label: "Scoring", cls: "badge-blue" },
  completed: { label: "Completed", cls: "badge-green" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, cls: "badge-slate" };
  return <span className={meta.cls}>{meta.label}</span>;
}
