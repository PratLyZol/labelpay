export function sol(lamports: string | number | bigint, digits = 4) {
  const n = Number(lamports) / 1e9;
  return `${n.toFixed(digits)} SOL`;
}
export function short(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
export function pct(n: number, d: number) {
  return d ? `${Math.round((100 * n) / d)}%` : "–";
}
