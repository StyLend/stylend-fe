import TokenIcon from "./TokenIcon";

interface Column {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render: (row: Record<string, unknown>) => React.ReactNode;
}

interface AssetTableProps {
  title: string;
  titleValue?: string;
  columns: Column[];
  data: Record<string, unknown>[];
  emptyMessage?: string;
  actionLabel?: string;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export { formatUsd, formatNumber };

export default function AssetTable({
  title,
  titleValue,
  columns,
  data,
  emptyMessage = "Nothing here yet",
}: AssetTableProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
        {titleValue && (
          <span className="text-sm font-medium text-[var(--text-secondary)]">{titleValue}</span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--text-tertiary)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Column headers */}
          <div className="hidden sm:grid px-5 py-3 border-b border-[var(--border)]" style={{ gridTemplateColumns: `2fr ${columns.slice(1).map(() => "1fr").join(" ")}` }}>
            {columns.map((col) => (
              <div
                key={col.key}
                className={`text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                }`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {data.map((row, idx) => (
            <div
              key={idx}
              className="grid items-center px-5 py-3.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors duration-150 cursor-pointer"
              style={{ gridTemplateColumns: `2fr ${columns.slice(1).map(() => "1fr").join(" ")}` }}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={`text-sm ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                  }`}
                >
                  {col.render(row)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Pre-built column renderers
export function AssetColumn({ symbol, name, color }: { symbol: string; name: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <TokenIcon symbol={symbol} color={color} size={36} />
      <div>
        <div className="font-semibold text-[var(--text-primary)]">{symbol}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{name}</div>
      </div>
    </div>
  );
}

export function ApyBadge({ value, type }: { value: number; type: "supply" | "borrow" }) {
  const color = type === "supply" ? "var(--accent)" : "var(--accent-light)";
  return (
    <span className="font-medium" style={{ color }}>
      {value.toFixed(2)}%
    </span>
  );
}

export function CollateralToggle({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={`
        w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer
        ${enabled ? "bg-[var(--accent)]" : "bg-[var(--bg-tertiary)]"}
      `}
    >
      <div
        className={`
          w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform duration-200
          ${enabled ? "translate-x-[18px]" : "translate-x-[3px]"}
        `}
      />
    </div>
  );
}

export function ActionButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "outline" }) {
  return (
    <button
      className={`
        px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer
        ${
          variant === "primary"
            ? "bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white"
            : "border border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent-glow)]"
        }
      `}
    >
      {label}
    </button>
  );
}
