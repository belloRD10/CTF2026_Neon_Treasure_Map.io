(function (global) {
  'use strict';

  function knobSegs(L, U, sign) {
    const u = U * sign;
    return [
      { c1: [0.15 * L, 0],        c2: [0.27 * L, 0],        p: [0.35 * L, 0] },
      { c1: [0.29 * L, 0.30 * u], c2: [0.30 * L, 0.92 * u], p: [0.42 * L, 0.95 * u] },
      { c1: [0.47 * L, 1.10 * u], c2: [0.53 * L, 1.10 * u], p: [0.58 * L, 0.95 * u] },
      { c1: [0.67 * L, 0.92 * u], c2: [0.71 * L, 0.70 * u], p: [0.66 * L, 0.45 * u] },
      { c1: [0.71 * L, 0.16 * u], c2: [0.63 * L, 0],        p: [0.58 * L, 0] },
      { c1: [0.72 * L, 0],        c2: [0.86 * L, 0],        p: [1.00 * L, 0] }
    ];
  }

  function reverseSegs(segs) {
    const out = [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      out.push({ c1: s.c2, c2: s.c1, p: i === 0 ? [0, 0] : segs[i - 1].p });
    }
    return out;
  }

  function tileOutline(c, r, g) {
    const { cols, rows, cw, ch, horiz, vert } = g;
    const ops = [];
    const line = (x, y) => ops.push({ t: 'l', x, y });
    const cubic = (c1, c2, p) => ops.push({ t: 'c', c1, c2, p });

    if (r > 0) {
      for (const s of horiz[r - 1][c]) {
        cubic([s.c1[0], s.c1[1]], [s.c2[0], s.c2[1]], [s.p[0], s.p[1]]);
      }
    } else line(cw, 0);

    if (c < cols - 1) {
      for (const s of vert[c][r]) {
        cubic([cw + s.c1[1], s.c1[0]], [cw + s.c2[1], s.c2[0]], [cw + s.p[1], s.p[0]]);
      }
    } else line(cw, ch);

    if (r < rows - 1) {
      for (const s of reverseSegs(horiz[r][c])) {
        cubic([s.c1[0], ch + s.c1[1]], [s.c2[0], ch + s.c2[1]], [s.p[0], ch + s.p[1]]);
      }
    } else line(0, ch);

    if (c > 0) {
      for (const s of reverseSegs(vert[c - 1][r])) {
        cubic([s.c1[1], s.c1[0]], [s.c2[1], s.c2[0]], [s.p[1], s.p[0]]);
      }
    } else line(0, 0);

    return ops;
  }

  function flatten(ops, steps) {
    const n = steps || 14;
    const pts = [];
    let cur = [0, 0];
    for (const op of ops) {
      pts.push(cur);
      if (op.t === 'l') {
        cur = [op.x, op.y];
      } else {
        const p0 = cur;
        for (let i = 1; i <= n; i++) {
          const t = i / n, m = 1 - t;
          pts.push([
            m * m * m * p0[0] + 3 * m * m * t * op.c1[0] + 3 * m * t * t * op.c2[0] + t * t * t * op.p[0],
            m * m * m * p0[1] + 3 * m * m * t * op.c1[1] + 3 * m * t * t * op.c2[1] + t * t * t * op.p[1]
          ]);
        }
        cur = op.p;
      }
    }
    pts.push(cur);
    return pts;
  }

  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function build(cols, rows, cw, ch, knobU) {
    const horiz = [];
    for (let r = 0; r < rows - 1; r++) {
      horiz[r] = [];
      for (let c = 0; c < cols; c++) horiz[r][c] = knobSegs(cw, knobU, 1);
    }
    const vert = [];
    for (let c = 0; c < cols - 1; c++) {
      vert[c] = [];
      for (let r = 0; r < rows; r++) vert[c][r] = knobSegs(ch, knobU, 1);
    }

    const g = { cols, rows, cw, ch, horiz, vert };
    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ops = tileOutline(c, r, g);
        tiles.push({ c, r, ops, poly: flatten(ops) });
      }
    }
    return { horiz, vert, tiles };
  }

  const api = { knobSegs, reverseSegs, tileOutline, flatten, inPoly, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.JigsawGeom = api;
})(typeof window !== 'undefined' ? window : globalThis);
