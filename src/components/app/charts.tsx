"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STATUS_LABELS, type ShipmentStatus } from "@/lib/domain/shipment-status";

const axisStyle = { fill: "#9BAFC1", fontSize: 10 } as const;
const gridStroke = "#1d3549";

const tooltipStyle = {
  backgroundColor: "#102234",
  border: "1px solid #294054",
  borderRadius: 10,
  fontSize: 11,
  color: "#F5F8FC",
} as const;

export function VolumeChart({ data }: { data: { date: string; created: number; delivered: number }[] }) {
  if (data.length === 0) {
    return <p className="px-4 py-10 text-center text-xs text-muted">Sem movimentos no período selecionado.</p>;
  }
  return (
    <div className="h-[260px] w-full px-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B8F36A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#B8F36A" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="deliveredFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickFormatter={(value: string) => value.slice(5)} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#9BAFC1" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9BAFC1" }} />
          <Area type="monotone" dataKey="created" name="Criadas" stroke="#B8F36A" strokeWidth={2} fill="url(#createdFill)" />
          <Area type="monotone" dataKey="delivered" name="Entregues" stroke="#60A5FA" strokeWidth={2} fill="url(#deliveredFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending_quote: "#fbbf24",
  quoted: "#a78bfa",
  confirmed: "#60a5fa",
  assigned: "#38bdf8",
  picked_up: "#818cf8",
  in_transit: "#22d3ee",
  out_for_delivery: "#facc15",
  delivered: "#4ade80",
  on_hold: "#94a3b8",
  exception: "#f87171",
  failed_delivery: "#fb7185",
  returned: "#a78bfa",
  cancelled: "#475569",
};

export function StatusBarChart({ data }: { data: { status: string; count: number }[] }) {
  const chartData = data.map((row) => ({
    status: STATUS_LABELS[row.status as ShipmentStatus] ?? row.status,
    count: row.count,
    fill: STATUS_COLORS[row.status] ?? "#64748b",
  }));
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="status" tick={{ ...axisStyle, fontSize: 9 }} interval={0} angle={-22} textAnchor="end" height={60} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" name="Encomendas" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.status} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DelayTrendChart({ data }: { data: { date: string; created: number; delivered: number }[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickFormatter={(value: string) => value.slice(5)} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="delivered" name="Entregues" stroke="#B8F36A" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="created" name="Criadas" stroke="#9BAFC1" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
