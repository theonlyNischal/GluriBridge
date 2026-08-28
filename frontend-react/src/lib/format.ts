/** One place every real score/percentage figure in the app formats through — same rounding everywhere. */
export function fmtScore(n: number): string {
  return n.toFixed(1);
}
