// Lifetime stats (app-5.16, Manny 2026-11-15): the rig's own counters (0xA2) next to what Torchless has seen,
// plus per-jar numbers the Dr. Dabber app can't give. Reads only; never writes to the rig.

import type { JarDab, Jar } from "./jars";
import type { RigStats } from "../rig/rig-controller";
import { HeatProfile, LightModes } from "../rig/rig-controller";

/** One heat session as Torchless saw it, jar or not. */
export interface LifeDab { at: string; seconds: number; goal?: number; peak?: number; unit: "F" | "C"; profile?: string; preset?: number }

const KEY = "torchless.lifetimeV1";
const MAX = 3000;

export function loadLife(): LifeDab[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(d => d && typeof d.at === "string" && typeof d.seconds === "number") : [];
  } catch { return []; }
}

export function recordLife(d: JarDab, preset: number | undefined) {
  if (d.medium === "torch") return;
  const list = loadLife();
  const e: LifeDab = { at: d.at, seconds: d.seconds, unit: d.unit };
  if (d.goal !== undefined) e.goal = d.goal;
  if (d.peak !== undefined) e.peak = d.peak;
  if (d.profile !== undefined) e.profile = d.profile;
  if (preset !== undefined && preset >= 1 && preset <= 5) e.preset = preset;
  list.push(e);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* storage full or off */ }
}

const toUnit = (v: number, from: "F" | "C", celsius: boolean) =>
  from === "C" && !celsius ? Math.round(v * 9 / 5 + 32) : from === "F" && celsius ? Math.round((v - 32) * 5 / 9) : v;

export function durText(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function mode<T>(xs: T[]): T | undefined {
  const c = new Map<T, number>();
  let best: T | undefined, n = 0;
  for (const x of xs) { const k = (c.get(x) ?? 0) + 1; c.set(x, k); if (k > n) { n = k; best = x; } }
  return best;
}

export interface LifeSummary {
  dabs: number; seconds: number; avgSeconds: number; since: string | null;
  favTemp?: number; favPreset?: number; favProfile?: string; hottest?: number;
  last7: number; busiestDay?: { day: string; n: number };
  rated: number; avgRating?: number; grams: number;
  jars: { name: string; dabs: number; avg?: number; temp?: number; grams: number; best?: number }[];
}

/** Rig dabs (Torchless's own record, filled in from jar dab logs from before 5.16). Torch-mode dabs are left out. */
export function summarize(life: LifeDab[], jars: Jar[], celsius: boolean, now = Date.now()): LifeSummary {
  const byAt = new Map<string, LifeDab & { rating?: number; grams?: number }>();
  for (const d of life) byAt.set(d.at, { ...d });
  for (const j of jars) for (const d of j.dabs ?? []) {
    if (d.medium === "torch") continue;
    const e = byAt.get(d.at) ?? { at: d.at, seconds: d.seconds, unit: d.unit, goal: d.goal, peak: d.peak, profile: d.profile };
    e.rating = d.rating; e.grams = d.grams;
    byAt.set(d.at, e);
  }
  const all = [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at));
  const secs = all.reduce((t, d) => t + d.seconds, 0);
  const temps = all.filter(d => d.goal !== undefined).map(d => toUnit(d.goal!, d.unit, celsius));
  const peaks = all.filter(d => d.peak !== undefined).map(d => toUnit(d.peak!, d.unit, celsius));
  const days = mode(all.map(d => new Date(d.at).toDateString()));
  const dayN = days ? all.filter(d => new Date(d.at).toDateString() === days).length : 0;
  const rated = all.filter(d => d.rating !== undefined);
  const jarRows = jars.map(j => {
    const ds = (j.dabs ?? []).filter(d => d.medium !== "torch");
    const r = ds.filter(d => d.rating !== undefined).map(d => d.rating!);
    const best = ds.filter(d => d.rating !== undefined && d.goal !== undefined).sort((a, b) => b.rating! - a.rating!)[0];
    return {
      name: [j.strain, j.producer].filter(Boolean).join(" · ") || "Jar",
      dabs: ds.length,
      avg: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 10) / 10 : undefined,
      temp: mode(ds.filter(d => d.goal !== undefined).map(d => toUnit(d.goal!, d.unit, celsius))),
      grams: Math.round(ds.reduce((t, d) => t + (d.grams ?? 0), 0) * 100) / 100,
      best: best ? toUnit(best.goal!, best.unit, celsius) : undefined,
    };
  }).filter(r => r.dabs > 0).sort((a, b) => b.dabs - a.dabs);
  return {
    dabs: all.length, seconds: secs, avgSeconds: all.length ? Math.round(secs / all.length) : 0,
    since: all[0]?.at ?? null,
    favTemp: mode(temps), favPreset: mode(all.filter(d => d.preset !== undefined).map(d => d.preset!)),
    favProfile: mode(all.filter(d => d.profile).map(d => d.profile!)),
    hottest: peaks.length ? Math.max(...peaks) : undefined,
    last7: all.filter(d => now - Date.parse(d.at) < 7 * 864e5).length,
    busiestDay: days && dayN > 1 ? { day: days, n: dayN } : undefined,
    rated: rated.length,
    avgRating: rated.length ? Math.round(rated.reduce((t, d) => t + d.rating!, 0) / rated.length * 10) / 10 : undefined,
    grams: Math.round(all.reduce((t, d) => t + (d.grams ?? 0), 0) * 100) / 100,
    jars: jarRows,
  };
}

/** The rig's own counters as label / value rows. Only fields the rig sent. */
export function rigRows(st: RigStats, celsius: boolean): [string, string][] {
  const rows: [string, string][] = [];
  if (st.heatCycles !== undefined) rows.push(["Heat cycles", st.heatCycles.toLocaleString()]);
  if (st.mostInADay !== undefined) rows.push(["Most in a day", String(st.mostInADay)]);
  if (st.chargeCycles !== undefined) rows.push(["Charge cycles", String(st.chargeCycles)]);
  const ft = celsius ? st.favTempC : st.favTempF;
  if (ft) rows.push(["Favorite temp", `${ft}°`]);
  if (st.favProfile !== undefined && HeatProfile.name(st.favProfile).indexOf("Unknown") < 0) rows.push(["Favorite profile", HeatProfile.name(st.favProfile)]);
  if (st.favLight !== undefined && st.favLight <= 33) rows.push(["Favorite light", LightModes.name(st.favLight)]);
  return rows;
}
