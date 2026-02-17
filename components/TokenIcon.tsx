interface TokenIconProps {
  symbol: string;
  color: string;
  size?: number;
}

export default function TokenIcon({ symbol, color, size = 32 }: TokenIconProps) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.38,
      }}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}
