// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other protocol the snapshot shows still waiting on a launch of its own: it records no token and
// is not a wrapped, staked or bridged product of a token that already trades, not an exchange, and
// not a versioned pool of another protocol. Nothing is capped and nothing is hand-picked: if the
// snapshot carries such a protocol, the board ranks it.
//
// radar-4 prices a launch from the launches the market has already priced, with a fitted curve
// instead of a hand-set multiple, and it grades itself out of sample before it believes itself:
//
//   peers    = the protocols that record a market cap above zero with TVL above zero (a cap of
//              zero or less is a broken print, excluded and counted), one per ticker symbol.
//   curve    = log(mcap) = a + b x log(TVL), fit by least squares over the peers, then refit once
//              with residuals winsorized at the median +/- 2.5 x MAD, so one wild print bends
//              the curve instead of breaking it. b is the size exponent: the old flat multiple
//              is the special case b = 1, and the blind tests below decide which one ships.
//   offsets  = each category's mean stage-1 residual, shrunk toward zero by n / (n + k): a
//              category priced by one peer borrows most of its price from the whole market.
//   terms    = two candidate terms, a growth term on the seven-day TVL change and an age term on
//              the time with no token. Each is admitted only by the blind tests: kept if it
//              improves out-of-sample log-RMSE in both leave-one-out and walk-forward, kept at
//              half weight if it helps one and hurts the other, dropped if it hurts both.
//   implied  = exp(a + category offset + b x log(TVL) + growth term + age term), rounded and
//              floored at 1: the fitted curve evaluated at the row's own figures, so a row's
//              value follows from the snapshot's figures by the same arithmetic that priced
//              the peers. Chains are not a value term: reach is priced in the farm plan, where
//              a second chain is a real cost and a real second surface, not a multiplier.
//
// The validation is part of the product, not a footnote: leave-one-out over every peer,
// walk-forward over the listing-date axis (each launch priced only by launches already known),
// a published term-selection table, and 200 seeded bootstrap refits that give every row a rank
// range. The numbers the dashboard states are the numbers this program computes at run time.
//
// No protocol name is ever special-cased: the same function scores every row, and every fitted
// value is recomputed from the snapshot the program is given, so a future snapshot reprices
// the board and re-runs the tests.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/**
 * The model's stated constants: the fitting discipline and the farm-plan costing assumptions.
 * Everything fitted (the curve, the offsets, the chosen terms) is an output, not a constant;
 * everything here is an assumption the dashboard prints next to the numbers it produces.
 */
export interface ModelConstants {
  mad_factor: number;
  shrink_candidates: number[];
  growth_floor: number;
  growth_cap: number;
  refits: number;
  refit_seed: number;
  allocation: number;
  farm_tvl_share: number;
  opportunity_rate: number;
  bridge_fee_usd: number;
  swap_rate: number;
  gas_ethereum: number;
  gas_solana: number;
  gas_other: number;
  gas_unknown: number;
}

export const MODEL: ModelConstants = {
  mad_factor: 2.5,
  shrink_candidates: [2, 4, 8],
  growth_floor: -60,
  growth_cap: 120,
  refits: 200,
  refit_seed: 0x5eed,
  allocation: 0.05,
  farm_tvl_share: 0.005,
  opportunity_rate: 0.05,
  bridge_fee_usd: 6,
  swap_rate: 0.003,
  gas_ethereum: 8,
  gas_solana: 0.25,
  gas_other: 1.5,
  gas_unknown: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of the published term-selection table: what the blind tests did to one candidate. */
export interface SelectionRow {
  term: string;
  loo_delta: number | null;
  wf_delta: number | null;
  decision: string;
}

/** One out-of-sample score line: errors of predicted against actual log market caps. */
export interface ValidationLine {
  n: number;
  log_rmse: number;
  median_abs_log: number;
  median_ape: number;
  within_2x: number;
}

/** The fitted model as the dashboard states it: the curve, the terms kept, and the test scores. */
export interface FitReport {
  peers_used: number;
  peers_seen: number;
  broken_prints: number;
  dated_peers: number;
  intercept: number;
  size_exponent: number;
  shrink_k: number;
  shrink_table: { k: number; loo: number; wf: number }[];
  growth_coef: number;
  growth_weight: number;
  age_coef: number;
  age_weight: number;
  validation: { loo: ValidationLine; wf: ValidationLine };
  selection: SelectionRow[];
}

/** A row's farm plan, costed to the dollar: the verdict is arithmetic, not adjectives. */
export interface FarmPlan {
  capital_usd: number;
  hold_days: number;
  start_date: string;
  end_date: string;
  actions: number;
  gas_usd: number;
  bridge_usd: number;
  swap_usd: number;
  opportunity_usd: number;
  plan_cost_usd: number;
  expected_value_usd: number;
  net_usd: number;
  break_even_usd: number | null;
  break_even_days: number | null;
  break_even_date: string | null;
  verdict: 'farm' | 'thin' | 'skip';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  rank_lo: number;
  rank_hi: number;
  implied_lo: number;
  implied_hi: number;
  model: {
    curve_base_log: number;
    size_exponent: number;
    category_offset: number;
    category_peers: number;
    growth_term: number;
    age_term: number;
  };
  plan: FarmPlan;
  farm_steps: string[];
}

/** The dashboard's compact view of one row: the fit components and the costed plan travel with it. */
export interface RadarRow {
  rank: number;
  slug: string;
  watchlist: boolean;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  rank_lo: number;
  rank_hi: number;
  implied_lo: number;
  implied_hi: number;
  fit_base_log: number;
  fit_b: number;
  fit_growth: number;
  fit_age: number;
  fit_offset: number;
  category_peers: number;
  plan: FarmPlan;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One line of the coverage ledger: where one snapshot protocol landed, and why. */
export interface CoverageEntry {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  status: 'ranked' | 'traded' | 'aside';
  rank: number;
  peer: boolean;
  reason: string;
}

/** Everything the dashboard needs: the board, the live set, and the fitted model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: FitReport;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  coverage: CoverageEntry[];
  coverage_counts: { total: number; ranked: number; traded: number; aside: number };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list, or 0 for an empty one. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round2 = (n: number): number => Math.round(n * 1e2) / 1e2;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** mulberry32: the one source of randomness in the program, seeded and stated, for the refits. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a product of a token that already trades, never a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying one of these whole words is a wrapped or staked product, not a launch. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name are that exchange's own product. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a product of a token that
 * already trades. This is the watchlist's own definition of a launch of its own, applied to the
 * whole snapshot: the watchlist is the floor, and this is the rest of the radar above it.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((name) => p.name.startsWith(name))) return false;
  return true;
}

/** One priced launch the curve learns from: a peer, with the figures the fit reads. */
export interface Peer {
  slug: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  symbol: string | null;
}

/**
 * The comps set: every protocol whose recorded market cap is a real price (above zero) with TVL
 * above zero. A recorded cap of zero or less is a broken print: it is excluded and counted, never
 * winsorized into the fit the way the old clamp did. One peer per ticker symbol — the largest
 * TVL print of a symbol is the market's price for it; on this snapshot no symbol repeats, so the
 * step changes nothing and says so.
 */
export function cleanPeers(snapshot: Snapshot): { peers: Peer[]; seen: number; broken: number } {
  const seen = snapshot.protocols.filter((p) => p.mcap_usd !== null);
  const broken = seen.filter((p) => p.mcap_usd! <= 0 || p.tvl_usd <= 0).length;
  const candidates = seen
    .filter((p) => p.mcap_usd! > 0 && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      listed_at: p.listed_at,
      symbol: p.symbol,
    }));
  const bestBySymbol = new Map<string, Peer>();
  for (const peer of candidates) {
    if (peer.symbol === null) continue;
    const prev = bestBySymbol.get(peer.symbol);
    if (prev === undefined || peer.tvl_usd > prev.tvl_usd) bestBySymbol.set(peer.symbol, peer);
  }
  const peers = candidates.filter((peer) => peer.symbol === null || bestBySymbol.get(peer.symbol) === peer);
  return { peers, seen: seen.length, broken };
}

/** The growth variable: the seven-day TVL change, clamped to the stated band, as a fraction. */
export function growthVar(change_7d: number | null, model: ModelConstants = MODEL): number {
  const raw = finite(change_7d, 0);
  return Math.min(model.growth_cap, Math.max(model.growth_floor, raw)) / 100;
}

/** The age variable: log years-with-no-token, with the peer-median age standing in for an unknown one. */
export function ageVar(age_days: number | null, medianAge: number): number {
  return Math.log(1 + (age_days ?? medianAge) / 365);
}

/** The median age of a peer set's dated peers, or 365 when none is dated. */
function medianAgeOf(peers: Peer[]): number {
  const ages = peers.map((p) => p.age_days).filter((a): a is number => a !== null).sort((x, y) => x - y);
  return ages.length > 0 ? median(ages) : 365;
}

/** Solve a small linear system by Gauss-Jordan elimination with partial pivoting. */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    const d = m[c]![c]!;
    for (let j = c; j <= n; j++) m[c]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      if (f === 0) continue;
      for (let j = c; j <= n; j++) m[r]![j]! -= f * m[c]![j]!;
    }
  }
  return m.map((row) => row[n]!);
}

/** Ordinary least squares through the normal equations: the only fitting machinery in the program. */
function ols(x: number[][], y: number[]): number[] {
  const k = x[0]!.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (let r = 0; r < x.length; r++) {
    for (let i = 0; i < k; i++) {
      xty[i]! += x[r]![i]! * y[r]!;
      for (let j = 0; j < k; j++) xtx[i]![j]! += x[r]![i]! * x[r]![j]!;
    }
  }
  return solveLinear(xtx, xty);
}

/** One candidate shape of the model: which terms are in, and how the size slope is treated. */
export interface FitConfig {
  slope: 'free' | number;
  k: number;
  growth: boolean;
  age: boolean;
}

/** A fitted model: the curve and the shrunk category offsets, ready to price any row. */
export interface FittedModel {
  a: number;
  b: number;
  g: number;
  h: number;
  offsets: Map<string | null, number>;
  counts: Map<string | null, number>;
  median_age: number;
}

/**
 * Fit one candidate shape over a peer set. Stage 1 is least squares on logs, fit twice: the
 * second fit reads targets whose residuals were winsorized at the median +/- MAD_FACTOR x MAD,
 * so one wild print bends the curve instead of breaking it. Stage 2 prices each category at its
 * mean stage-1 residual (against the true caps, not the winsorized targets), shrunk toward zero
 * by n / (n + k). Deterministic: no randomness, no clock, iteration in snapshot order.
 */
export function fitVariant(peers: Peer[], cfg: FitConfig, model: ModelConstants = MODEL): FittedModel {
  const medianAge = medianAgeOf(peers);
  const design = (p: Peer): { x: number[]; y: number } => {
    const lt = Math.log(p.tvl_usd);
    const x: number[] = [1];
    if (cfg.slope === 'free') x.push(lt);
    if (cfg.growth) x.push(growthVar(p.change_7d, model));
    if (cfg.age) x.push(ageVar(p.age_days, medianAge));
    const y = Math.log(p.mcap_usd) - (cfg.slope === 'free' ? 0 : cfg.slope * lt);
    return { x, y };
  };
  const rows = peers.map(design);
  const x = rows.map((r) => r.x);
  const y = rows.map((r) => r.y);
  const dot = (beta: number[], v: number[]): number => beta.reduce((s, b, i) => s + b * v[i]!, 0);
  let beta = ols(x, y);
  const resid = y.map((yi, i) => yi - dot(beta, x[i]!));
  const sortedResid = [...resid].sort((p, q) => p - q);
  const med = median(sortedResid);
  const mad = median(resid.map((r) => Math.abs(r - med)).sort((p, q) => p - q));
  if (mad > 0) {
    const lo = med - model.mad_factor * mad;
    const hi = med + model.mad_factor * mad;
    const y2 = y.map((_, i) => dot(beta, x[i]!) + Math.min(hi, Math.max(lo, resid[i]!)));
    beta = ols(x, y2);
  }
  const unpack = (beta: number[]): { a: number; b: number; g: number; h: number } => {
    let i = 1;
    const b = cfg.slope === 'free' ? beta[i++]! : cfg.slope;
    const g = cfg.growth ? beta[i++]! : 0;
    const h = cfg.age ? beta[i++]! : 0;
    return { a: beta[0]!, b, g, h };
  };
  const { a, b, g, h } = unpack(beta);
  const residByCat = new Map<string | null, number[]>();
  peers.forEach((p, i) => {
    const r = y[i]! - dot(beta, x[i]!);
    const arr = residByCat.get(p.category) ?? [];
    arr.push(r);
    residByCat.set(p.category, arr);
  });
  const offsets = new Map<string | null, number>();
  const counts = new Map<string | null, number>();
  for (const [category, rs] of residByCat) {
    const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
    offsets.set(category, mean * (rs.length / (rs.length + cfg.k)));
    counts.set(category, rs.length);
  }
  return { a, b, g, h, offsets, counts, median_age: medianAge };
}

/** The model's log price for one row's figures under one fit: curve, offset, and terms. */
export function predictLog(fit: FittedModel, tvl_usd: number, category: string | null, change_7d: number | null, age_days: number | null, model: ModelConstants = MODEL): number {
  return (
    fit.a +
    fit.b * Math.log(tvl_usd) +
    fit.g * growthVar(change_7d, model) +
    fit.h * ageVar(age_days, fit.median_age) +
    (fit.offsets.get(category) ?? 0)
  );
}

/** A fit with its term coefficients scaled: how a term the tests half-keep is shipped. */
function scaled(fit: FittedModel, growthWeight: number, ageWeight: number): FittedModel {
  return { ...fit, g: fit.g * growthWeight, h: fit.h * ageWeight };
}

/** The raw score line of a set of log errors (predicted minus actual). */
function rawMetrics(errs: number[]): ValidationLine {
  const n = errs.length;
  if (n === 0) return { n: 0, log_rmse: 0, median_abs_log: 0, median_ape: 0, within_2x: 0 };
  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / n);
  const absSorted = errs.map((e) => Math.abs(e)).sort((x, y) => x - y);
  const apeSorted = errs.map((e) => Math.abs(Math.exp(e) - 1)).sort((x, y) => x - y);
  const within = errs.filter((e) => Math.abs(e) <= Math.log(2)).length / n;
  return { n, log_rmse: rmse, median_abs_log: median(absSorted), median_ape: median(apeSorted), within_2x: within };
}

const roundLine = (v: ValidationLine): ValidationLine => ({
  n: v.n,
  log_rmse: round3(v.log_rmse),
  median_abs_log: round3(v.median_abs_log),
  median_ape: round4(v.median_ape),
  within_2x: round4(v.within_2x),
});

/**
 * Leave-one-out: every peer is priced by a model fit on the other peers, in the candidate's
 * shape, with the shipped term weights applied. The selection itself is not re-run per fold —
 * the form is frozen, the coefficients are not.
 */
function looEval(peers: Peer[], cfg: FitConfig, growthWeight: number, ageWeight: number, model: ModelConstants): ValidationLine {
  const errs: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const train = peers.filter((_, j) => j !== i);
    const fit = scaled(fitVariant(train, cfg, model), growthWeight, ageWeight);
    const p = peers[i]!;
    errs.push(predictLog(fit, p.tvl_usd, p.category, p.change_7d, p.age_days, model) - Math.log(p.mcap_usd));
  }
  return rawMetrics(errs);
}

/**
 * Walk-forward on the listing-date axis: starting from the first date at which 30 launches are
 * already known, each 180-day window's launches are priced by a model fit only on launches
 * listed before the window — as of each launch, priced only by launches already known.
 */
function wfEval(dated: Peer[], cfg: FitConfig, growthWeight: number, ageWeight: number, model: ModelConstants): ValidationLine {
  if (dated.length < 31) return rawMetrics([]);
  const rows = [...dated].sort((x, y) => (x.listed_at! < y.listed_at! ? -1 : x.listed_at! > y.listed_at! ? 1 : x.slug < y.slug ? -1 : 1));
  const ord = (p: Peer): number => Date.parse(`${p.listed_at}T00:00:00Z`) / DAY_MS;
  let t = ord(rows[29]!);
  const errs: number[] = [];
  for (;;) {
    const train = rows.filter((p) => ord(p) <= t);
    const test = rows.filter((p) => ord(p) > t && ord(p) <= t + 180);
    if (test.length === 0) break;
    const fit = scaled(fitVariant(train, cfg, model), growthWeight, ageWeight);
    for (const p of test) errs.push(predictLog(fit, p.tvl_usd, p.category, p.change_7d, p.age_days, model) - Math.log(p.mcap_usd));
    t += 180;
  }
  return rawMetrics(errs);
}

/**
 * The blind-test rule, applied uniformly: a candidate is kept at full weight if it improves
 * out-of-sample log-RMSE in both tests, dropped if it hurts both, and kept at half weight when
 * the tests disagree. Deltas are variant minus base, so a negative delta is an improvement.
 */
function decide(looDelta: number, wfDelta: number): number {
  const eps = 1e-12;
  const looHelps = looDelta < -eps;
  const wfHelps = wfDelta < -eps;
  const looHurts = looDelta > eps;
  const wfHurts = wfDelta > eps;
  if (looHelps && wfHelps) return 1;
  if (looHurts && wfHurts) return 0;
  return 0.5;
}

const weightWord = (w: number): string => (w === 1 ? 'kept' : w === 0.5 ? 'kept at half weight' : 'dropped');

/** The outcome of the term selection: the shipped fit, its shape, and its published report. */
export interface SelectedModel {
  fit: FittedModel;
  cfg: FitConfig;
  growthWeight: number;
  ageWeight: number;
  report: FitReport;
}

/**
 * Run the blind tests and ship what survives them. Order: the size exponent against the flat
 * multiple, the shrinkage k on the surviving slope form, then the growth and age terms at that
 * k (age judged on the dated peers, the only ones that can judge it). The headline validation
 * lines are the shipped model's own out-of-sample scores, form frozen, coefficients refit.
 */
export function selectModel(peers: Peer[], stats: { seen: number; broken: number }, model: ModelConstants = MODEL): SelectedModel {
  const dated = peers.filter((p) => p.age_days !== null);
  const candidates = model.shrink_candidates;
  const baseK = candidates.includes(4) ? 4 : candidates[0]!;
  const flatCfg: FitConfig = { slope: 1, k: baseK, growth: false, age: false };
  const curveCfg: FitConfig = { slope: 'free', k: baseK, growth: false, age: false };
  const looFlat = looEval(peers, flatCfg, 1, 1, model);
  const wfFlat = wfEval(dated, flatCfg, 1, 1, model);
  const looCurve = looEval(peers, curveCfg, 1, 1, model);
  const wfCurve = wfEval(dated, curveCfg, 1, 1, model);
  const wB = decide(looCurve.log_rmse - looFlat.log_rmse, wfCurve.log_rmse - wfFlat.log_rmse);
  const formSlope: 'free' | number = wB === 0 ? 1 : 'free';

  const shrinkRows = candidates.map((k) => {
    const cfg: FitConfig = { slope: formSlope, k, growth: false, age: false };
    return { k, loo: looEval(peers, cfg, 1, 1, model), wf: wfEval(dated, cfg, 1, 1, model) };
  });
  let kStar = shrinkRows[0]!.k;
  let bestSum = Infinity;
  for (const row of shrinkRows) {
    const sum = row.loo.log_rmse + row.wf.log_rmse;
    if (sum < bestSum) {
      bestSum = sum;
      kStar = row.k;
    }
  }
  const baseCfg: FitConfig = { slope: formSlope, k: kStar, growth: false, age: false };
  const looBase = shrinkRows.find((r) => r.k === kStar)!.loo;
  const wfBase = shrinkRows.find((r) => r.k === kStar)!.wf;

  const looGrowth = looEval(peers, { ...baseCfg, growth: true }, 1, 1, model);
  const wfGrowth = wfEval(dated, { ...baseCfg, growth: true }, 1, 1, model);
  const wG = decide(looGrowth.log_rmse - looBase.log_rmse, wfGrowth.log_rmse - wfBase.log_rmse);

  const looDatedBase = looEval(dated, baseCfg, 1, 1, model);
  const looDatedAge = looEval(dated, { ...baseCfg, age: true }, 1, 1, model);
  const wfAge = wfEval(dated, { ...baseCfg, age: true }, 1, 1, model);
  const wH = decide(looDatedAge.log_rmse - looDatedBase.log_rmse, wfAge.log_rmse - wfBase.log_rmse);

  let slope: 'free' | number = formSlope;
  if (wB === 0.5) {
    const free = fitVariant(peers, { slope: 'free', k: kStar, growth: false, age: false }, model);
    slope = 1 + 0.5 * (free.b - 1);
  }
  const cfg: FitConfig = { slope, k: kStar, growth: wG > 0, age: wH > 0 };
  const fit = scaled(fitVariant(peers, cfg, model), wG, wH);
  const loo = looEval(peers, cfg, wG, wH, model);
  const wf = wfEval(dated, cfg, wG, wH, model);

  const selection: SelectionRow[] = [
    {
      term: 'Size exponent (free b vs flat b = 1)',
      loo_delta: round3(looCurve.log_rmse - looFlat.log_rmse),
      wf_delta: round3(wfCurve.log_rmse - wfFlat.log_rmse),
      decision: wB === 0 ? 'dropped — the flat multiple ships' : `${weightWord(wB)} — b = ${fit.b.toFixed(3)} ships`,
    },
    {
      term: 'Category shrinkage k',
      loo_delta: null,
      wf_delta: null,
      decision: `k = ${kStar} of ${candidates.join(' / ')} — lowest combined leave-one-out + walk-forward log-RMSE`,
    },
    {
      term: 'Growth term (7-day TVL change)',
      loo_delta: round3(looGrowth.log_rmse - looBase.log_rmse),
      wf_delta: round3(wfGrowth.log_rmse - wfBase.log_rmse),
      decision: wG === 0 ? 'dropped — growth is row data and a plan input, not a value term' : weightWord(wG),
    },
    {
      term: 'Age term (time with no token)',
      loo_delta: round3(looDatedAge.log_rmse - looDatedBase.log_rmse),
      wf_delta: round3(wfAge.log_rmse - wfBase.log_rmse),
      decision: wH === 0 ? 'dropped from the value — age still sets each plan\'s hold and cadence' : weightWord(wH),
    },
  ];
  const report: FitReport = {
    peers_used: peers.length,
    peers_seen: stats.seen,
    broken_prints: stats.broken,
    dated_peers: dated.length,
    intercept: round4(fit.a),
    size_exponent: round4(fit.b),
    shrink_k: kStar,
    shrink_table: shrinkRows.map((r) => ({ k: r.k, loo: round3(r.loo.log_rmse), wf: round3(r.wf.log_rmse) })),
    growth_coef: round4(fit.g),
    growth_weight: wG,
    age_coef: round4(fit.h),
    age_weight: wH,
    validation: { loo: roundLine(loo), wf: roundLine(wf) },
    selection,
  };
  return { fit, cfg, growthWeight: wG, ageWeight: wH, report };
}

/** The nearest-rank percentile of a list, sorted here so callers pass refit order. */
function percentile(values: number[], p: number): number {
  const s = [...values].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

/**
 * Rank ranges from seeded bootstrap refits: the peers are resampled with replacement, the
 * shipped form (terms frozen, selection not re-run) is refit, and the board is re-scored.
 * Each row publishes its 5th–95th percentile rank and implied value across the refits.
 */
function refitRanges(
  peers: Peer[],
  cfg: FitConfig,
  growthWeight: number,
  ageWeight: number,
  candidates: { slug: string; tvl_usd: number; category: string | null; change_7d: number | null; age_days: number | null }[],
  model: ModelConstants,
): Map<string, { rank_lo: number; rank_hi: number; implied_lo: number; implied_hi: number }> {
  const rand = mulberry32(model.refit_seed);
  const ranks = new Map<string, number[]>(candidates.map((c) => [c.slug, []]));
  const values = new Map<string, number[]>(candidates.map((c) => [c.slug, []]));
  for (let r = 0; r < model.refits; r++) {
    const sample = peers.map(() => peers[Math.floor(rand() * peers.length)]!);
    const fit = scaled(fitVariant(sample, cfg, model), growthWeight, ageWeight);
    const scored = candidates.map((c) => ({
      slug: c.slug,
      implied: c.tvl_usd > 0 ? Math.max(1, Math.round(Math.exp(predictLog(fit, c.tvl_usd, c.category, c.change_7d, c.age_days, model)))) : 1,
    }));
    scored.sort((x, y) => y.implied - x.implied || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
    scored.forEach((s, i) => {
      ranks.get(s.slug)!.push(i + 1);
      values.get(s.slug)!.push(s.implied);
    });
  }
  const out = new Map<string, { rank_lo: number; rank_hi: number; implied_lo: number; implied_hi: number }>();
  for (const c of candidates) {
    out.set(c.slug, {
      rank_lo: percentile(ranks.get(c.slug)!, 5),
      rank_hi: percentile(ranks.get(c.slug)!, 95),
      implied_lo: percentile(values.get(c.slug)!, 5),
      implied_hi: percentile(values.get(c.slug)!, 95),
    });
  }
  return out;
}

/** The ISO date `days` after an ISO date, from the date itself — never from the wall clock. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** A dollar figure as a step string carries it: whole dollars bare, cents to two places. */
function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return n < 0 ? `-$${body}` : `$${body}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The stated gas table: one action's gas by the class of the plan's first chain. */
function gasPerAction(chain: string | undefined, model: ModelConstants): number {
  if (chain === undefined) return model.gas_unknown;
  if (chain === 'Ethereum') return model.gas_ethereum;
  if (chain === 'Solana') return model.gas_solana;
  return model.gas_other;
}

/**
 * A row's farm plan, costed to the dollar from stated assumptions. Cost is gas for every counted
 * action (setup, core, second action, one a week of the hold, and the claim check) at the first
 * chain's rate, plus the bridge fee when the plan works a second chain, plus swap fees in and
 * out for DEX and yield categories (in only otherwise), plus the yield given up carrying the
 * deposit. Value is the farmer's TVL-time share of a stated 5% community allocation, where the
 * farming capital competing for that allocation is a stated 0.5% of TVL — the whole TVL is not
 * farming, and pretending it is prices every plan at cents. The verdict is the arithmetic:
 * farm at twice the cost, thin at cost, skip below it.
 */
export function planFor(p: SnapshotProtocol, age: number | null, implied: number, asOf: string, model: ModelConstants = MODEL): FarmPlan {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const actions = 4 + Math.ceil(hold / 7);
  const gas = actions * gasPerAction(p.chains[0], model);
  const bridge = p.chains.length >= 2 ? model.bridge_fee_usd : 0;
  const c = (p.category ?? '').toLowerCase();
  const swap = model.swap_rate * capital * (c.includes('dex') || c.includes('yield') ? 2 : 1);
  const opportunity = capital * model.opportunity_rate * (hold / 365);
  const cost = gas + bridge + swap + opportunity;
  const value = p.tvl_usd > 0 ? (implied * model.allocation * (capital * hold)) / (model.farm_tvl_share * p.tvl_usd * 365) : 0;
  const verdict: FarmPlan['verdict'] = value >= 2 * cost ? 'farm' : value >= cost ? 'thin' : 'skip';
  // The timeline's middle marker: expected value accrues in proportion to the days farmed, so the
  // day it covers the all-in cost is the hold scaled by cost over value. Past the hold it still
  // prints — a skip plan's honest timeline is enter, exit, and a break-even that never lands.
  const breakEvenDays = value > 0 ? Math.ceil((hold * cost) / value) : null;
  return {
    capital_usd: capital,
    hold_days: hold,
    start_date: asOf,
    end_date: addDays(asOf, hold),
    actions,
    gas_usd: round2(gas),
    bridge_usd: round2(bridge),
    swap_usd: round2(swap),
    opportunity_usd: round2(opportunity),
    plan_cost_usd: round2(cost),
    expected_value_usd: round2(value),
    net_usd: round2(value - cost),
    break_even_usd: value > 0 ? round2((implied * cost) / value) : null,
    break_even_days: breakEvenDays,
    break_even_date: breakEvenDays === null ? null : addDays(asOf, breakEvenDays),
    verdict,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A small deterministic hash of a slug, for stable per-protocol phrasing choices. */
export function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second action: the step that makes the wallet's record a pattern, not a visit. */
function secondActionFor(p: SnapshotProtocol, chain: string, gas1: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) return {
    text: `Mint the stablecoin ${name} issues against your collateral at a conservative ratio, and park the minted coins in the deepest pool for them on ${chain}.`,
    cost: `about ${gas1} of gas, and the collateral stays locked`,
    time: '15 minutes',
  };
  if (c.includes('lend') || c.includes('collateral')) return {
    text: `Borrow against the position once — no more than a third of what you supplied — supply the borrowed funds back, and check the health factor every week after.`,
    cost: `about ${gas1} of gas for the loop`,
    time: '15 minutes, then 2 minutes a week',
  };
  if (c.includes('dex')) return {
    text: `Make two or three small swaps through ${name} on ${chain} in the same session, so the wallet's record shows trading activity as well as liquidity.`,
    cost: `about ${gas1} of gas and the swap fees`,
    time: '10 minutes',
  };
  if (c.includes('bridge')) return {
    text: `Bridge a second, smaller amount back the other way a few days later, so the wallet has traffic through ${name} in both directions.`,
    cost: 'bridge fees of about $6',
    time: '15 minutes',
  };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return {
    text: `Open one small position on ${name} and close it the same week, then repeat on the other side, so the record shows real trading rather than one deposit.`,
    cost: 'trading fees of about $2 to $5 a round trip',
    time: '15 minutes a week',
  };
  if (c.includes('curator') || c.includes('allocator')) return {
    text: `Split the position: keep two thirds of it in ${name}'s largest vault and move one third into a second vault it curates, so the wallet holds more than one strategy.`,
    cost: `about ${gas1} of gas for the second deposit`,
    time: '10 minutes',
  };
  if (c.includes('prediction')) return {
    text: `Place small positions in two more markets on ${name}, on different days, and let at least one of them settle before you add any funds.`,
    cost: 'the stake in each market, kept small',
    time: '10 minutes a market',
  };
  if (c.includes('rwa')) return {
    text: `Read ${name}'s redemption terms before you add more: write the lock-up and the exit window in your farm log, and mint a second small tranche only inside that window.`,
    cost: 'nothing to read the terms',
    time: '15 minutes',
  };
  if (c.includes('chain')) return {
    text: `Use two of the applications live on ${name} itself — a swap and a deposit — so the wallet is active on the chain, not only bridged into it.`,
    cost: `about ${gas1} of gas in total`,
    time: '20 minutes',
  };
  if (c.includes('stable')) return {
    text: `Swap a small amount into the paired asset ${name} is built around and hold both sides for a week, so the wallet uses the peg mechanism and not only the deposit box.`,
    cost: `about ${gas1} of gas and the swap fee`,
    time: '10 minutes',
  };
  return {
    text: `Repeat the core action a second time with a smaller amount a few days later, so the wallet's record is a pattern of use, not a single visit.`,
    cost: `about ${gas1} of gas`,
    time: '10 minutes',
  };
}

/** The weekly-cadence step, phrased by the protocol's own seven-day TVL momentum. */
function cadenceStep(p: SnapshotProtocol, gas1: string): FarmStep {
  const change = p.change_7d;
  const cost = `about ${gas1} of gas a week`;
  const time = '10 minutes a week';
  if (change === null) return {
    text: `Make one qualifying action each week — a deposit, a borrow, a swap or a vote — and keep the cadence even: the record shows no seven-day TVL change for ${p.name}, so steady use is the signal to build.`,
    cost,
    time,
  };
  const shown = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  if (change >= 10) return {
    text: `TVL is up ${shown} in seven days: growth windows are when points programs tend to open, so finish the first full cycle this week rather than next, then keep one qualifying action a week.`,
    cost,
    time,
  };
  if (change <= -10) return {
    text: `TVL is down ${shown} in seven days: keep the position at the starter size, make one small qualifying action a week, and add nothing until two weekly checks in a row stop falling.`,
    cost,
    time,
  };
  return {
    text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the size steady while TVL moves sideways (${shown} in seven days).`,
    cost,
    time,
  };
}

/** The hold step, phrased by how long the protocol has already run with no token, dated by the plan. */
function holdStep(p: SnapshotProtocol, age: number | null, plan: FarmPlan): FarmStep {
  const hold = plan.hold_days;
  const cost = `the $${plan.capital_usd} stays in the position; carrying it gives up about ${fmtMoney(plan.opportunity_usd)} of yield`;
  const time = `${hold} days, ${plan.start_date} to ${plan.end_date}`;
  if (age !== null && age < 120) return {
    text: `${p.name} was first listed ${age} days ago: hold the position for at least ${hold} days, until ${plan.end_date} — a launch's first snapshot usually reaches back to the earliest wallets, and this one is still early.`,
    cost,
    time,
  };
  if (age !== null && age > 730) return {
    text: `Hold for at least ${hold} days, until ${plan.end_date}, then reassess: ${p.name} has run ${(age / 365).toFixed(1)} years with no token, so keep the position only while its cost stays near zero and treat any launch as a bonus, not a plan.`,
    cost,
    time,
  };
  return {
    text: `Hold the position for at least ${hold} days, until ${plan.end_date}, so the activity is counted in more than one snapshot.`,
    cost,
    time,
  };
}

/**
 * A protocol's farm plan: seven or eight steps, each an action with a cost and a time, generated
 * from the protocol's own record — its category's two actions, its chains, its seven-day
 * momentum and its age — and carrying the costed plan's own numbers: the deposit, the total gas,
 * the dated hold, and a closing verdict that nets expected value against all-in cost. No step is
 * written for a protocol by name, and two protocols with different records never receive the
 * same plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, plan: FarmPlan, model: ModelConstants = MODEL): FarmStep[] {
  const chain = chainOf(p);
  const gas1 = fmtMoney(gasPerAction(p.chains[0], model));
  const capital = plan.capital_usd;
  const steps: FarmStep[] = [
    slugHash(p.slug) % 2 === 0
      ? {
          text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
          cost: `about ${gas1} of gas for the first transaction`,
          time: '5 minutes',
        }
      : {
          text: `Create a wallet you use only for this farm, fund it from your main wallet, and store its seed phrase on paper — never in a screenshot or a cloud note.`,
          cost: `about ${gas1} of gas to fund it`,
          time: '10 minutes',
        },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital; ${fmtMoney(plan.gas_usd)} of gas across ${plan.actions} actions in all`,
      time: '15 minutes to set up',
    },
    secondActionFor(p, chain, gas1),
  ];
  if (p.chains.length >= 2) {
    steps.push({
      text: `Repeat the core action on ${p.chains[1]}: ${p.name} runs on ${p.chains.length} chains, and activity is usually counted per chain, so a second chain doubles the surfaces a snapshot can see.`,
      cost: `the $${model.bridge_fee_usd} bridge fee, plus gas on ${p.chains[1]}`,
      time: '20 minutes',
    });
  }
  steps.push(cadenceStep(p, gas1));
  steps.push(holdStep(p, age, plan));
  steps.push({
    text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
    cost: 'no fee to check, and never pay to claim',
    time: '10 minutes',
  });
  const verdictSentence =
    plan.break_even_usd !== null
      ? `Verdict: ${plan.verdict} — this plan costs ${fmtMoney(plan.plan_cost_usd)} all-in against ${fmtMoney(plan.expected_value_usd)} of expected value (net ${fmtMoney(plan.net_usd)}), and it breaks even if the launch is worth ${fmtMoney(plan.break_even_usd)}.`
      : `Verdict: ${plan.verdict} — this plan costs ${fmtMoney(plan.plan_cost_usd)} all-in against ${fmtMoney(plan.expected_value_usd)} of expected value (net ${fmtMoney(plan.net_usd)}), and no launch value makes it pay.`;
  steps.push({
    text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. ${verdictSentence}`,
    cost: 'nothing but the log',
    time: '5 minutes',
  });
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/**
 * The coverage ledger: every protocol in the snapshot, with the disposition the radar gave it and
 * the reason, in the order the board reads — ranked rows first by rank, the rest by TVL. Nothing
 * is silently dropped: a protocol is ranked, or its token already trades (the fitted curve learns
 * from the clean ones — they are the anchors, not candidates), or it records no token of its own
 * because it is a product of one that trades, and the reason says which rule caught it, in the
 * same order isRankable applies them.
 */
export function coverageLedger(snapshot: Snapshot, ranks: Map<string, number>, peerSlugs: Set<string>): CoverageEntry[] {
  const entries = snapshot.protocols.map((p): CoverageEntry => {
    const base = { slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd };
    const rank = ranks.get(p.slug) ?? 0;
    if (rank > 0) {
      return { ...base, status: 'ranked', rank, peer: false, reason: 'Records no token: priced by the fitted curve and ranked on the board.' };
    }
    if (!isPreToken(p)) {
      let reason: string;
      if (peerSlugs.has(p.slug)) reason = 'Token trades — one of the launches the curve is fitted on: an anchor, not a candidate.';
      else if (p.mcap_usd !== null && p.mcap_usd <= 0) reason = 'Records a market cap of zero or less — a broken print, kept out of the fit.';
      else if (p.mcap_usd === null) reason = 'Records a token but no market cap: the market prices it, not the model.';
      else if (p.tvl_usd <= 0) reason = 'Token trades and records no TVL, so it cannot anchor the curve.';
      else reason = 'Token already trades: the market prices it, not the model.';
      return { ...base, status: 'traded', rank: 0, peer: peerSlugs.has(p.slug), reason };
    }
    let reason: string;
    if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) reason = `Records no token of its own: ${p.category} is a product of a token that already trades.`;
    else if (VERSIONED.test(p.name)) reason = 'Records no token of its own: the name ends in a version marker — a later release of another protocol.';
    else if (PRODUCT_WORD.test(p.name)) reason = 'Records no token of its own: the name says wrapped or staked — a product of a token that already trades.';
    else reason = 'Records no token of its own: the name begins with an exchange — that exchange\u2019s own product.';
    return { ...base, status: 'aside', rank: 0, peer: false, reason };
  });
  entries.sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return entries;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The board, the shipped fit, and its report: fit first, then price, then range, then cost. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; report: FitReport } {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol still waiting on a launch of its own, at any size. No
  // cap and no TVL cut: a radar that keeps only the largest early protocols misses the launches
  // it exists to find early. A chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const { peers, seen, broken } = cleanPeers(snapshot);
  const sel = selectModel(peers, { seen, broken }, model);
  const fit = sel.fit;
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const base = fit.a + (fit.offsets.get(p.category) ?? 0);
    const gt = fit.g * growthVar(p.change_7d, model);
    const at = fit.h * ageVar(age, fit.median_age);
    const implied = p.tvl_usd > 0 ? Math.max(1, Math.round(Math.exp(base + fit.b * Math.log(p.tvl_usd) + gt + at))) : 1;
    return { p, age, implied, base, gt, at };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const ranges = refitRanges(peers, sel.cfg, sel.growthWeight, sel.ageWeight, scored.map((s) => ({ slug: s.p.slug, tvl_usd: s.p.tvl_usd, category: s.p.category, change_7d: s.p.change_7d, age_days: s.age })), model);
  const board = scored.map((s, i) => {
    const plan = planFor(s.p, s.age, s.implied, snapshot.as_of, model);
    const range = ranges.get(s.p.slug)!;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      rank_lo: range.rank_lo,
      rank_hi: range.rank_hi,
      implied_lo: range.implied_lo,
      implied_hi: range.implied_hi,
      model: {
        curve_base_log: s.base,
        size_exponent: fit.b,
        category_offset: fit.offsets.get(s.p.category) ?? 0,
        category_peers: fit.counts.get(s.p.category) ?? 0,
        growth_term: s.gt,
        age_term: s.at,
      },
      plan,
      farm_steps: farmSteps(s.p, s.age, plan, model).map(stepText),
    };
  });
  return { board, report: sel.report };
}

/** A board row's compact form for data.js: fit components, rank range, and the costed plan. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    watchlist,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    implied_lo: row.implied_lo,
    implied_hi: row.implied_hi,
    fit_base_log: row.model.curve_base_log,
    fit_b: row.model.size_exponent,
    fit_growth: row.model.growth_term,
    fit_age: row.model.age_term,
    fit_offset: row.model.category_offset,
    category_peers: row.model.category_peers,
    plan: row.plan,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, report } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const peerSlugs = new Set(cleanPeers(snapshot).peers.map((p) => p.slug));
  const coverage = coverageLedger(snapshot, new Map(board.map((r) => [r.slug, r.rank])), peerSlugs);
  const traded = coverage.filter((e) => e.status === 'traded').length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit: report,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watch.has(r.slug))),
    live,
    coverage,
    coverage_counts: { total: coverage.length, ranked: board.length, traded, aside: coverage.length - board.length - traded },
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
