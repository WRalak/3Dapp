"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/utils";

const INK = "#161513";
const CLAY = "#9c5b3e";
const GRID = "#e2dcd2";
const AXIS = { fontSize: 11, fill: "#8a8277" };

function shortDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function RevenueChart({ data, currency }: { data: { date: string; revenueCents: number; orders: number }[]; currency: string }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Revenue over time">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={INK} stopOpacity={0.18} />
              <stop offset="1" stopColor={INK} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => formatMoney(v, currency).replace(/\.00$/, "")} tick={AXIS} axisLine={false} tickLine={false} width={70} />
          <Tooltip
            contentStyle={{ borderRadius: 0, border: `1px solid ${GRID}`, fontSize: 12 }}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(v, name) => (name === "revenueCents" ? [formatMoney(Number(v), currency), "Revenue"] : [String(v), "Orders"])}
          />
          <Area type="monotone" dataKey="revenueCents" stroke={INK} strokeWidth={1.5} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountChart({ data, dataKey, label }: { data: Record<string, string | number>[]; dataKey: string; label: string }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
          <Tooltip contentStyle={{ borderRadius: 0, border: `1px solid ${GRID}`, fontSize: 12 }} labelFormatter={(l) => shortDate(String(l))} formatter={(v) => [String(v), label]} />
          <Bar dataKey={dataKey} fill={INK} radius={0} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ data, currency }: { data: { category: string; revenueCents: number }[]; currency: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Sales by category">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => formatMoney(v, currency).replace(/\.00$/, "")} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="category" tick={AXIS} axisLine={false} tickLine={false} width={90} />
          <Tooltip contentStyle={{ borderRadius: 0, border: `1px solid ${GRID}`, fontSize: 12 }} formatter={(v) => [formatMoney(Number(v), currency), "Revenue"]} />
          <Bar dataKey="revenueCents" fill={CLAY} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
