// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other protocol the snapshot shows still waiting on a launch of its own: it records no token and
// is not a wrapped, staked or bridged product of a token that already trades, not an exchange, and
// not a versioned pool of another protocol. Nothing is capped and nothing is hand-picked: if the
// snapshot carries such a protocol, the board ranks it.
//
// Implied value follows only from the snapshot's own figures. The market has already priced the
// protocols that record a token, so their market cap over TVL is the revealed price of a launch:
//
//   peers      = the protocols that record a market cap: for each, ratio = mcap_usd / tvl_usd,
//                clamped to [RATIO_LO, RATIO_HI] so one broken print cannot price a category.
//   multiple   = the protocol's category multiple: the category's median ratio, shrunk toward
//                the global median ratio by the category's peer count, both taken in log space
//                (ratios are multiplicative, and log space stops one extreme peer pricing a
//                whole category): exp((n x ln catMedian + SHRINK_K x ln globalMedian)
//                / (n + SHRINK_K)). A category with no peers takes the global median.
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = MATURITY_FLOOR + min(age_days, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
//                (age_days unknown: UNKNOWN_AGE_DAYS)
//   reachMult  = 1 + REACH_PER_CHAIN x min(chains - 1, REACH_MAX_EXTRA): a launch is worth more
//                where more farmers can reach it, and the chains list is the snapshot's record.
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity x reachMult))
//
// No protocol name is ever special-cased: the same function scores every row, and every multiple
// is recomputed from the snapshot the program is given, so a future snapshot reprices the board.

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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  ratio_lo: number;
  ratio_hi: number;
  shrink_k: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_extra: number;
}

export const MODEL: ModelConstants = {
  ratio_lo: 0.02,
  ratio_hi: 3,
  shrink_k: 4,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  reach_per_chain: 0.02,
  reach_max_extra: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  model: {
    category_multiple: number;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
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
  category_multiple: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
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

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  peer_count: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
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

/** What the market pays for a launched protocol, per category and overall, from the snapshot itself. */
export interface PeerMultiples {
  global: number;
  peer_count: number;
  by_category: Map<string, { multiple: number; peers: number }>;
}

/**
 * The implied-value multiples: every protocol that records a market cap is a peer the market has
 * priced. Its market cap over TVL is winsorized, and the medians are taken in log space, per
 * category and overall. Each category's multiple is its log-median shrunk toward the global
 * log-median by its peer count, so a category priced by one protocol borrows most of its
 * multiple from the whole market, and one extreme print cannot price a category on its own.
 */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): PeerMultiples {
  const all: number[] = [];
  const perCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const logRatio = Math.log(Math.min(model.ratio_hi, Math.max(model.ratio_lo, p.mcap_usd / p.tvl_usd)));
    all.push(logRatio);
    if (p.category !== null) {
      const arr = perCategory.get(p.category) ?? [];
      arr.push(logRatio);
      perCategory.set(p.category, arr);
    }
  }
  all.sort((a, b) => a - b);
  const globalLog = all.length > 0 ? median(all) : Math.log(0.25);
  const by_category = new Map<string, { multiple: number; peers: number }>();
  for (const [category, logs] of perCategory) {
    logs.sort((a, b) => a - b);
    const n = logs.length;
    const shrunkLog = (n * median(logs) + model.shrink_k * globalLog) / (n + model.shrink_k);
    by_category.set(category, { multiple: Math.exp(shrunkLog), peers: n });
  }
  return { global: Math.exp(globalLog), peer_count: all.length, by_category };
}

/** The multiple and peer count one protocol is priced with: its category's, or the global median's. */
export function multipleFor(p: SnapshotProtocol, peers: PeerMultiples): { multiple: number; peerCount: number } {
  if (p.category !== null) {
    const entry = peers.by_category.get(p.category);
    if (entry !== undefined) return { multiple: entry.multiple, peerCount: entry.peers };
  }
  return { multiple: peers.global, peerCount: peers.peer_count };
}

/** The multipliers and the implied value one protocol gets under `model`, priced by `multiple`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, multiple: number): { implied: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * reachMult));
  return { implied, growthPct, growthMult, maturityMult, reachMult, age };
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

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
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

  const peers = peerMultiples(snapshot, model);
  const scored = [...chosen.values()].map((p) => {
    const { multiple, peerCount } = multipleFor(p, peers);
    const { implied, growthPct, growthMult, maturityMult, reachMult, age } = impliedValue(p, snapshot.as_of, model, multiple);
    return { p, implied, multiple, peerCount, growthPct, growthMult, maturityMult, reachMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes the row from this multiple, and a
      // rounded one would drift the page's number away from the board's on a large TVL.
      category_multiple: s.multiple,
      peer_count: s.peerCount,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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
function secondActionFor(p: SnapshotProtocol, chain: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) return {
    text: `Mint the stablecoin ${name} issues against your collateral at a conservative ratio, and park the minted coins in the deepest pool for them on ${chain}.`,
    cost: 'about $3 of gas, and the collateral stays locked',
    time: '15 minutes',
  };
  if (c.includes('lend') || c.includes('collateral')) return {
    text: `Borrow against the position once — no more than a third of what you supplied — supply the borrowed funds back, and check the health factor every week after.`,
    cost: 'about $3 of gas for the loop',
    time: '15 minutes, then 2 minutes a week',
  };
  if (c.includes('dex')) return {
    text: `Make two or three small swaps through ${name} on ${chain} in the same session, so the wallet's record shows trading activity as well as liquidity.`,
    cost: 'about $2 of gas and the swap fees',
    time: '10 minutes',
  };
  if (c.includes('bridge')) return {
    text: `Bridge a second, smaller amount back the other way a few days later, so the wallet has traffic through ${name} in both directions.`,
    cost: 'bridge fees of about $3 to $10',
    time: '15 minutes',
  };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return {
    text: `Open one small position on ${name} and close it the same week, then repeat on the other side, so the record shows real trading rather than one deposit.`,
    cost: 'trading fees of about $2 to $5 a round trip',
    time: '15 minutes a week',
  };
  if (c.includes('curator') || c.includes('allocator')) return {
    text: `Split the position: keep two thirds of it in ${name}'s largest vault and move one third into a second vault it curates, so the wallet holds more than one strategy.`,
    cost: 'about $3 of gas for the second deposit',
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
    cost: 'about $3 of gas in total',
    time: '20 minutes',
  };
  if (c.includes('stable')) return {
    text: `Swap a small amount into the paired asset ${name} is built around and hold both sides for a week, so the wallet uses the peg mechanism and not only the deposit box.`,
    cost: 'about $2 of gas and the swap fee',
    time: '10 minutes',
  };
  return {
    text: `Repeat the core action a second time with a smaller amount a few days later, so the wallet's record is a pattern of use, not a single visit.`,
    cost: 'about $2 of gas',
    time: '10 minutes',
  };
}

/** The weekly-cadence step, phrased by the protocol's own seven-day TVL momentum. */
function cadenceStep(p: SnapshotProtocol): FarmStep {
  const change = p.change_7d;
  const cost = 'about $2 of gas a week';
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

/** The hold step, phrased by how long the protocol has already run with no token. */
function holdStep(p: SnapshotProtocol, age: number | null, capital: number): FarmStep {
  const hold = holdDaysFor(age);
  const cost = `the $${capital} stays in the position`;
  const time = `${hold} days`;
  if (age !== null && age < 120) return {
    text: `${p.name} was first listed ${age} days ago: hold the position for at least ${hold} days — a launch's first snapshot usually reaches back to the earliest wallets, and this one is still early.`,
    cost,
    time,
  };
  if (age !== null && age > 730) return {
    text: `Hold for at least ${hold} days, then reassess: ${p.name} has run ${(age / 365).toFixed(1)} years with no token, so keep the position only while its cost stays near zero and treat any launch as a bonus, not a plan.`,
    cost,
    time,
  };
  return {
    text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
    cost,
    time,
  };
}

/**
 * A protocol's farm plan: seven or eight steps, each an action with a cost and a time, generated
 * from the protocol's own record — its category's two actions, its chains, its seven-day
 * momentum and its age. No step is written for a protocol by name, and two protocols with
 * different records never receive the same plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const steps: FarmStep[] = [
    slugHash(p.slug) % 2 === 0
      ? {
          text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
          cost: 'under $3 of gas for the first transaction',
          time: '5 minutes',
        }
      : {
          text: `Create a wallet you use only for this farm, fund it from your main wallet, and store its seed phrase on paper — never in a screenshot or a cloud note.`,
          cost: 'under $3 of gas to fund it',
          time: '10 minutes',
        },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    secondActionFor(p, chain),
  ];
  if (p.chains.length >= 2) {
    steps.push({
      text: `Repeat the core action on ${p.chains[1]}: ${p.name} runs on ${p.chains.length} chains, and activity is usually counted per chain, so a second chain doubles the surfaces a snapshot can see.`,
      cost: `bridge fees of about $3 to $10, plus gas on ${p.chains[1]}`,
      time: '20 minutes',
    });
  }
  steps.push(cadenceStep(p));
  steps.push(holdStep(p, age, capital));
  steps.push({
    text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
    cost: 'no fee to check, and never pay to claim',
    time: '10 minutes',
  });
  steps.push({
    text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
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

/** A board row's compact form for data.js, with the farm plan generated in the page. */
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
    category_multiple: row.model.category_multiple,
    peer_count: row.model.peer_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(peers.global),
    peer_count: peers.peer_count,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watch.has(r.slug))),
    live,
  };
  return { board, radar };
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
