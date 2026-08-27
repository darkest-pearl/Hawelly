import type { TransferTone } from "../../lib/milestone-2-fixtures";

export function StatusBadge({ label, tone }: { label: string; tone: TransferTone }) {
  return <span className={`status-badge status-${tone}`}>{label}</span>;
}
