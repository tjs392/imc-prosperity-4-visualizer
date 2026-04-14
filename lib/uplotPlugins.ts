import uPlot from "uplot";

type BusEntry = {
  key: string;
  plot: uPlot;
};

const scaleBus: BusEntry[] = [];
let suppressPropagation = false;

export function registerScaleSync(plot: uPlot, key: string) {
  scaleBus.push({ key, plot });
}

export function unregisterScaleSync(plot: uPlot) {
  const idx = scaleBus.findIndex((e) => e.plot === plot);
  if (idx >= 0) scaleBus.splice(idx, 1);
}

export function broadcastScale(
  source: uPlot,
  key: string,
  min: number,
  max: number
) {
  if (suppressPropagation) return;
  suppressPropagation = true;
  try {
    for (const entry of scaleBus) {
      if (entry.key !== key) continue;
      if (entry.plot === source) continue;
      const curMin = entry.plot.scales.x.min;
      const curMax = entry.plot.scales.x.max;
      if (curMin === min && curMax === max) continue;
      entry.plot.setScale("x", { min, max });
    }
  } finally {
    suppressPropagation = false;
  }
}

export function wheelZoomPlugin(factor: number = 0.75): uPlot.Plugin {
  let xMin: number, xMax: number, xRange: number;

  function clampRange(
    nRange: number,
    nMin: number,
    nMax: number,
    fRange: number,
    fMin: number,
    fMax: number
  ): [number, number] {
    if (nRange > fRange) {
      return [fMin, fMax];
    }
    if (nMin < fMin) {
      return [fMin, fMin + nRange];
    }
    if (nMax > fMax) {
      return [fMax - nRange, fMax];
    }
    return [nMin, nMax];
  }

  return {
    hooks: {
      ready: (u: uPlot) => {
        xMin = u.scales.x.min ?? 0;
        xMax = u.scales.x.max ?? 0;
        xRange = xMax - xMin;

        const over = u.over;
        const rect = () => over.getBoundingClientRect();

        over.addEventListener(
          "wheel",
          (e: WheelEvent) => {
            e.preventDefault();
            const r = rect();
            const { left } = u.cursor;
            if (left === undefined || left === null || left < 0) return;

            const leftPct = left / r.width;
            const xVal = u.posToVal(left, "x");
            const oxRange =
              (u.scales.x.max ?? xMax) - (u.scales.x.min ?? xMin);

            const nxRange =
              e.deltaY < 0 ? oxRange * factor : oxRange / factor;
            let nxMin = xVal - leftPct * nxRange;
            let nxMax = nxMin + nxRange;
            [nxMin, nxMax] = clampRange(
              nxRange,
              nxMin,
              nxMax,
              xRange,
              xMin,
              xMax
            );

            u.batch(() => {
              u.setScale("x", { min: nxMin, max: nxMax });
            });
          },
          { passive: false }
        );
      },
    },
  };
}

export function scaleSyncPlugin(key: string): uPlot.Plugin {
  return {
    hooks: {
      setScale: [
        (u: uPlot, scaleKey: string) => {
          if (scaleKey !== "x") return;
          const min = u.scales.x.min;
          const max = u.scales.x.max;
          if (min === undefined || max === undefined) return;
          if (min === null || max === null) return;
          broadcastScale(u, key, min as number, max as number);
        },
      ],
    },
  };
}

export function resetUPlotX(plot: uPlot | null) {
  if (!plot) return;
  const xs = plot.data[0] as number[];
  if (!xs || xs.length === 0) return;
  plot.setScale("x", {
    min: xs[0],
    max: xs[xs.length - 1],
  });
}