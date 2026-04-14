"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";

const SYNC_PLOT_LINE_ID = "__sync_crosshair__";
let syncing = false;

export function useHighchartsSync(onHover?: (ts: number | null) => void) {
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  useEffect(() => {
    const drawSyncLineOn = (chart: Highcharts.Chart, x: number) => {
      if (!chart || !chart.xAxis || !chart.xAxis[0]) return;
      try {
        chart.xAxis[0].removePlotLine(SYNC_PLOT_LINE_ID);
        chart.xAxis[0].addPlotLine({
          id: SYNC_PLOT_LINE_ID,
          value: x,
          color: "#e5e5e5",
          width: 1,
          dashStyle: "Dash",
          zIndex: 5,
        });
      } catch {
        // chart destroyed mid-draw
      }
    };

    const clearSyncLines = () => {
      for (const chart of Highcharts.charts) {
        if (!chart || !chart.xAxis || !chart.xAxis[0]) continue;
        try {
          chart.xAxis[0].removePlotLine(SYNC_PLOT_LINE_ID);
        } catch {
          // chart destroyed
        }
      }
    };

    const handler = (e: MouseEvent) => {
      let sourceX: number | null = null;
      let sourceChart: Highcharts.Chart | null = null;
      let overAnyChart = false;

      for (const chart of Highcharts.charts) {
        if (!chart) continue;
        const container = chart.container;
        if (!container) continue;
        const rect = container.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          overAnyChart = true;
          sourceChart = chart;
          const event = chart.pointer.normalize(e);
          let closest: Highcharts.Point | undefined;
          for (const series of chart.series) {
            if (series.type === "scatter") continue;
            const point = series.searchPoint(event, true);
            if (
              point &&
              (!closest ||
                Math.abs(point.plotX! - event.chartX) <
                  Math.abs(closest.plotX! - event.chartX))
            ) {
              closest = point;
            }
          }
          if (closest) {
            sourceX = closest.x as number;
          }
          break;
        }
      }

      if (!overAnyChart) return;
      if (sourceX === null) return;

      onHoverRef.current?.(sourceX);

      for (const chart of Highcharts.charts) {
        if (!chart) continue;
        drawSyncLineOn(chart, sourceX);
        let closest: Highcharts.Point | undefined;
        for (const series of chart.series) {
          if (series.type === "scatter") continue;
          for (const point of series.points) {
            if (
              !closest ||
              Math.abs((point.x as number) - sourceX) <
                Math.abs((closest.x as number) - sourceX)
            ) {
              closest = point;
            }
          }
        }
        if (closest) {
          try {
            closest.onMouseOver();
          } catch {
            // ignore
          }
        }
      }
    };

    const clearHandler = (e: MouseEvent) => {
      for (const chart of Highcharts.charts) {
        if (!chart) continue;
        const container = chart.container;
        if (!container) continue;
        const rect = container.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          return;
        }
      }
      for (const chart of Highcharts.charts) {
        if (!chart) continue;
        if (chart.tooltip) chart.tooltip.hide();
      }
      clearSyncLines();
    };

    const extremesHandler = (e: unknown) => {
      if (syncing) return;
      const evt = e as {
        min: number;
        max: number;
        target: { chart: Highcharts.Chart };
      };
      const sourceChart = evt.target.chart;
      syncing = true;
      try {
        for (const chart of Highcharts.charts) {
          if (!chart || chart === sourceChart) continue;
          chart.xAxis[0].setExtremes(evt.min, evt.max, true, false);
        }
      } finally {
        syncing = false;
      }
    };

    const attached: Highcharts.Chart[] = [];
    const attachListeners = () => {
      for (const chart of Highcharts.charts) {
        if (!chart) continue;
        if (attached.includes(chart)) continue;
        Highcharts.addEvent(chart.xAxis[0], "afterSetExtremes", extremesHandler);
        attached.push(chart);
      }
    };

    attachListeners();
    const interval = window.setInterval(attachListeners, 500);

    document.addEventListener("mousemove", handler);
    document.addEventListener("mouseleave", clearHandler);

    const wheelHandler = (e: WheelEvent) => {
      let target: Highcharts.Chart | null = null;
      for (const chart of Highcharts.charts) {
        if (!chart) continue;
        const container = chart.container;
        if (!container) continue;
        const rect = container.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          target = chart;
          break;
        }
      }
      if (!target) return;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY)
          ? e.deltaX
          : e.shiftKey
          ? e.deltaY
          : 0;
      if (delta === 0) return;
      e.preventDefault();
      const axis = target.xAxis[0];
      if (!axis) return;
      const extremes = axis.getExtremes();
      const min = extremes.min ?? extremes.dataMin;
      const max = extremes.max ?? extremes.dataMax;
      if (min === undefined || max === undefined) return;
      const range = max - min;
      const pixelRange = axis.width || 1;
      const shift = (delta / pixelRange) * range;
      let newMin = min + shift;
      let newMax = max + shift;
      const dataMin = extremes.dataMin;
      const dataMax = extremes.dataMax;
      if (dataMin !== undefined && newMin < dataMin) {
        newMax += dataMin - newMin;
        newMin = dataMin;
      }
      if (dataMax !== undefined && newMax > dataMax) {
        newMin -= newMax - dataMax;
        newMax = dataMax;
      }
      axis.setExtremes(newMin, newMax, true, false);
    };
    document.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("mousemove", handler);
      document.removeEventListener("mouseleave", clearHandler);
      document.removeEventListener("wheel", wheelHandler);
      for (const chart of attached) {
        try {
          if (chart && chart.xAxis && chart.xAxis[0]) {
            Highcharts.removeEvent(chart.xAxis[0], "afterSetExtremes", extremesHandler);
          }
        } catch {
          // chart was destroyed, nothing to clean up
        }
      }
    };
  }, []);
}