interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
  subValue?: string;
}

export default function StatCard({ label, value, icon, valueColor, subValue }: StatCardProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--border-hover)] transition-colors duration-200">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center text-[var(--accent)]">
          {icon}
        </div>
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span
          className="text-2xl font-bold"
          style={{ color: valueColor || "var(--text-primary)" }}
        >
          {value}
        </span>
        {subValue && (
          <span className="text-xs text-[var(--text-tertiary)] mb-1">{subValue}</span>
        )}
      </div>
    </div>
  );
}
