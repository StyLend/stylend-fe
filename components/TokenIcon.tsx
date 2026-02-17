import Image from "next/image";

const TOKEN_LOGOS: Record<string, string> = {
  WETH: "https://coin-images.coingecko.com/coins/images/39810/large/weth.png",
  WBTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
  USDC: "https://static.optimism.io/data/USDC/logo.png",
  USDT: "https://coin-images.coingecko.com/coins/images/39963/large/usdt.png?1724952731",
};

interface TokenIconProps {
  symbol: string;
  color: string;
  size?: number;
}

export default function TokenIcon({ symbol, color, size = 32 }: TokenIconProps) {
  const logo = TOKEN_LOGOS[symbol.toUpperCase()];

  if (logo) {
    return (
      <div className="shrink-0 rounded-full overflow-hidden" style={{ width: size, height: size }}>
        <Image
          src={logo}
          alt={symbol}
          width={size}
          height={size}
          className="rounded-full object-cover"
        />
      </div>
    );
  }

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
