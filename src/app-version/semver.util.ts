/* eslint-disable prettier/prettier */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/** Numeric comparison of "x.y.z" versions: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}
