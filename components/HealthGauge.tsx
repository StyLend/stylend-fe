interface HealthGaugeProps {
  value: number;
}

export default function HealthGauge({ value }: HealthGaugeProps) {
  // Map health factor to angle: 0 = -135deg, 10+ = 135deg (270 degree arc)
  const clampedValue = Math.min(value, 10);
  const percentage = clampedValue / 10;
  const angle = -135 + percentage * 270;

  const getColor = () => {
    if (value >= 3) return "var(--accent)";
    if (value >= 1.5) return "var(--accent-light)";
    return "var(--danger)";
  };

  const color = getColor();

  // SVG arc parameters
  const cx = 50;
  const cy = 50;
  const r = 38;
  const startAngle = -225;
  const endAngle = startAngle + percentage * 270;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const startX = cx + r * Math.cos(toRad(startAngle));
  const startY = cy + r * Math.sin(toRad(startAngle));
  const endX = cx + r * Math.cos(toRad(endAngle));
  const endY = cy + r * Math.sin(toRad(endAngle));
  const largeArc = percentage * 270 > 180 ? 1 : 0;

  // Track arc (full background)
  const trackEndAngle = startAngle + 270;
  const trackEndX = cx + r * Math.cos(toRad(trackEndAngle));
  const trackEndY = cy + r * Math.sin(toRad(trackEndAngle));

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[80px] h-[60px]">
        <svg viewBox="0 0 100 80" className="w-full h-full">
          {/* Track */}
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 1 1 ${trackEndX} ${trackEndY}`}
            fill="none"
            stroke="var(--bg-tertiary)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {percentage > 0 && (
            <path
              d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-0">
          <span className="text-lg font-bold text-[var(--text-primary)]">
            {value >= 10 ? "10+" : value.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
