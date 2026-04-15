import uPlot from "uplot";

export type XPlotLine = { value: number; label?: string };

/**
 * Hook fragment that draws vertical day-boundary plot lines (and optional labels)
 * onto a uPlot chart. Returns a draw hook to be merged into hooks.draw.
 */
export function makeXPlotLinesDrawHook(
  getLines: () => XPlotLine[] | undefined
) {
  return (u: uPlot) => {
    const lines = getLines();
    if (!lines || lines.length === 0) return;
    const ctx = u.ctx;
    ctx.save();
    ctx.strokeStyle = "#737373";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#a3a3a3";
    const top = u.bbox.top;
    const bottom = u.bbox.top + u.bbox.height;
    for (const pl of lines) {
      const x = u.valToPos(pl.value, "x", true);
      if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      if (pl.label) {
        ctx.setLineDash([]);
        ctx.fillText(pl.label, x + 4, top + 12);
        ctx.setLineDash([4, 4]);
      }
    }
    ctx.restore();
  };
}

/**
 * Hook fragment that draws horizontal y plot lines.
 */
export type YPlotLine = {
  value: number;
  color: string;
  dashed?: boolean;
  width?: number;
};

export function makeYPlotLinesDrawHook(getLines: () => YPlotLine[]) {
  return (u: uPlot) => {
    const lines = getLines();
    if (!lines || lines.length === 0) return;
    const ctx = u.ctx;
    const left = u.bbox.left;
    const right = left + u.bbox.width;
    const top = u.bbox.top;
    const bottom = top + u.bbox.height;
    ctx.save();
    for (const pl of lines) {
      const y = u.valToPos(pl.value, "y", true);
      if (y < top || y > bottom) continue;
      ctx.strokeStyle = pl.color;
      ctx.lineWidth = pl.width ?? 1;
      ctx.setLineDash(pl.dashed ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    ctx.restore();
  };
}

/**
 * Compute padded y-min/y-max from a set of nullable series.
 * Returns null if no finite data.
 */
export function computeYRange(
  seriesArrays: (number | null | undefined)[][],
  pad = 0.05
): { min: number; max: number } | null {
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const arr of seriesArrays) {
    for (const v of arr) {
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null;
  if (yMin === yMax) return { min: yMin - 1, max: yMax + 1 };
  const padAmt = (yMax - yMin) * pad;
  return { min: yMin - padAmt, max: yMax + padAmt };
}

/**
 * Standard dark axis styling shared across historical charts.
 */
export function darkAxes(opts?: {
  xLabel?: string;
  yLabel?: string;
}): uPlot.Axis[] {
  const x: uPlot.Axis = {
    stroke: "#a3a3a3",
    grid: { stroke: "#3a3d41", width: 1 },
    ticks: { stroke: "#525252", width: 1, size: 5 },
    values: (_u, splits) => splits.map((s) => String(s)),
    font: "11px sans-serif",
  };
  if (opts?.xLabel) {
    x.label = opts.xLabel;
    x.labelFont = "10px sans-serif";
    x.labelSize = 24;
  }
  const y: uPlot.Axis = {
    stroke: "#a3a3a3",
    grid: { stroke: "#3a3d41", width: 1 },
    ticks: { stroke: "#525252", width: 1, size: 5 },
    values: (_u, splits) => splits.map((s) => String(s)),
    font: "11px sans-serif",
  };
  if (opts?.yLabel) {
    y.label = opts.yLabel;
    y.labelFont = "10px sans-serif";
    y.labelSize = 24;
  }
  return [x, y];
}