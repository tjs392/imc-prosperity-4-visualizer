const SQRT_2 = Math.sqrt(2);

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * ax);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / SQRT_2));
}

export function bsCall(
  S: number,
  K: number,
  T: number,
  sigma: number,
  r = 0
): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return Math.max(S - K, 0);
  }
  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

const IV_LO = 1e-6;
const IV_HI = 5.0;
const IV_TOL = 1e-7;
const IV_MAX_ITER = 100;

export function impliedVol(
  price: number,
  S: number,
  K: number,
  T: number,
  extrinsicFloor = 0.5,
  r = 0
): number | null {
  if (T <= 0 || price <= 0 || S <= 0 || K <= 0) return null;
  const intrinsic = Math.max(S - K * Math.exp(-r * T), 0);
  const extrinsic = price - intrinsic;
  if (extrinsic < extrinsicFloor) return null;

  const f = (sigma: number) => bsCall(S, K, T, sigma, r) - price;

  let a = IV_LO;
  let b = IV_HI;
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) return null;
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let mflag = true;
  let d = c;

  for (let i = 0; i < IV_MAX_ITER; i++) {
    let s: number;
    if (fa !== fc && fb !== fc) {
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      s = b - (fb * (b - a)) / (fb - fa);
    }
    const lo = (3 * a + b) / 4;
    const hi = b;
    const sInRange = (lo < s && s < hi) || (hi < s && s < lo);
    const cond1 = !sInRange;
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const cond4 = mflag && Math.abs(b - c) < IV_TOL;
    const cond5 = !mflag && Math.abs(c - d) < IV_TOL;
    if (cond1 || cond2 || cond3 || cond4 || cond5) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }
    const fs = f(s);
    d = c;
    c = b;
    fc = fb;
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
    if (Math.abs(fb) < IV_TOL || Math.abs(b - a) < IV_TOL) {
      return b;
    }
  }
  return b;
}

export type ParabolaFit = { a: number; b: number; c: number; n: number };

export function fitParabola(xs: number[], ys: number[]): ParabolaFit | null {
  if (xs.length !== ys.length) return null;
  const n = xs.length;
  if (n < 3) return null;

  let sx = 0;
  let sx2 = 0;
  let sx3 = 0;
  let sx4 = 0;
  let sy = 0;
  let sxy = 0;
  let sx2y = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    const x2 = x * x;
    sx += x;
    sx2 += x2;
    sx3 += x2 * x;
    sx4 += x2 * x2;
    sy += y;
    sxy += x * y;
    sx2y += x2 * y;
  }

  const M = [
    [sx4, sx3, sx2],
    [sx3, sx2, sx],
    [sx2, sx, n],
  ];
  const V = [sx2y, sxy, sy];

  const sol = solve3x3(M, V);
  if (!sol) return null;
  return { a: sol[0], b: sol[1], c: sol[2], n };
}

function solve3x3(M: number[][], V: number[]): number[] | null {
  const m = [
    [M[0][0], M[0][1], M[0][2], V[0]],
    [M[1][0], M[1][1], M[1][2], V[1]],
    [M[2][0], M[2][1], M[2][2], V[2]],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-18) return null;
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }
    for (let row = col + 1; row < 3; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < 4; k++) m[row][k] -= factor * m[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let row = 2; row >= 0; row--) {
    let sum = m[row][3];
    for (let col = row + 1; col < 3; col++) sum -= m[row][col] * x[col];
    x[row] = sum / m[row][row];
  }
  return x;
}

export function evalParabola(fit: ParabolaFit, x: number): number {
  return fit.a * x * x + fit.b * x + fit.c;
}