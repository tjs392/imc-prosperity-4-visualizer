const PALETTE = [
  "#60a5fa",
  "#f97316",
  "#a3e635",
  "#e879f9",
  "#22d3ee",
  "#fbbf24",
];

export function getProductColor(product: string, index: number): string {
  return PALETTE[index % PALETTE.length];
}

export function buildColorMap(products: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  products.forEach((p, i) => {
    map[p] = PALETTE[i % PALETTE.length];
  });
  return map;
}