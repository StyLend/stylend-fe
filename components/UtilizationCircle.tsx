interface UtilizationCircleProps {
  percentage: number;
  size?: number;
  color?: string;
}

export default function UtilizationCircle({
  percentage,
  size = 20,
  color,
}: UtilizationCircleProps) {
  const r = (size - 4) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (color) return color;
    if (percentage >= 80) return "var(--danger)";
    if (percentage >= 50) return "var(--accent-light)";
    return "var(--accent)";
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--bg-tertiary)"
        strokeWidth="2"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={getColor()}
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}
