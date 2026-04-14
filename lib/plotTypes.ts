import { ProductSeriesRow } from "./types";

export type LinePlotType = {
  kind: "line";
  id: string;
  label: string;
  color: string;
  valueLabel: string;
  getValue: (row: ProductSeriesRow) => number | null;
};

export type VolumePlotType = {
  kind: "volume";
  id: string;
  label: string;
};

export type PricePlotType = {
  kind: "price";
  id: string;
  label: string;
};

export type PositionPlotType = {
  kind: "position";
  id: string;
  label: string;
};

export type PlotType =
  | LinePlotType
  | VolumePlotType
  | PricePlotType
  | PositionPlotType;

export const PLOT_TYPES: PlotType[] = [
  {
    kind: "line",
    id: "pnl",
    label: "Profit / Loss",
    color: "#f5f5f5",
    valueLabel: "pnl",
    getValue: (r) => r.pnl,
  },
  {
    kind: "price",
    id: "price",
    label: "Price",
  },
  {
    kind: "position",
    id: "position",
    label: "Position",
  },
  {
    kind: "volume",
    id: "volume",
    label: "Order Book Volume",
  },
];

export function getPlotType(id: string): PlotType {
  return PLOT_TYPES.find((p) => p.id === id) ?? PLOT_TYPES[0];
}