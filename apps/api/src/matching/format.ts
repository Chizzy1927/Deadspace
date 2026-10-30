// Number formatting for the human-readable text the matcher returns (reasons, highlights).
export const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
export const miles = (n: number) => `${Math.round(n).toLocaleString('en-US')} mi`;
export const usd = (n: number) =>
  `$${n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
