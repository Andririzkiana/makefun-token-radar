# Token Radar

[![make.fun — Build the best token launch radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
![Token Radar rank](https://make.fun/badge/token-radar-01/Andririzkiana/makefun-token-radar/rank.svg)
![Token Radar reward](https://make.fun/badge/token-radar-01/Andririzkiana/makefun-token-radar/reward.svg)

Entry for the [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty on make.fun.

A ranking model and "night radar" dashboard for the make.fun
token-radar-01 bounty ("Build the best token launch radar").

Token Radar reads the competition snapshot of token-launch protocols,
scores every protocol with a transparent implied-value model, and
publishes a fully ranked board: 198 protocols, sorted by implied
value, with the complete 40-protocol watchlist covered.

## The radar-5 model

radar-5 keeps radar-4's fitted curve and adds the accounting around it: a coverage
ledger that counts every protocol in the snapshot, and a dated break-even marker on
every farm plan's timeline.

radar-4 replaces radar-3's hand-set category multiple with a curve
fitted on the launches the market has already priced, graded out of
sample before it is believed:

- **Comps.** 144 protocols record a market cap; 16 print zero or less
  and are excluded as broken prints, leaving **128 clean peers**
  (cap > 0, TVL > 0, one per ticker symbol — no symbol repeats in
  this snapshot). 95 of the 128 carry a listing date.
- **Fit.** `log(mcap) = a + b · log(TVL)` by least squares, refit once
  with residuals winsorized at the median ± 2.5 × MAD, plus a
  per-category offset (mean stage-1 residual shrunk by n / (n + k)).
  Fitted size exponent **b = 0.546** — launches price sub-linearly in
  size; the flat multiple (b = 1) is the rejected special case.
- **Blind tests.** Every candidate term ships only if it improves
  out-of-sample log-RMSE in both leave-one-out (LOO) and walk-forward
  (WF, expanding 180-day windows on the listing-date axis, 65 of the
  95 dated peers tested); helping one test and hurting the other
  halves its weight; hurting both drops it.

  | Candidate | LOO Δ | WF Δ | Decision |
  |---|---|---|---|
  | Size exponent (free b vs flat 1) | −0.168 | −0.225 | kept — b = 0.546 |
  | Growth term (7d TVL change) | −0.001 | +0.049 | kept at half weight (applied coefficient −1.505) |
  | Age term (time with no token) | +0.018 | +0.119 | dropped from the value; age still sets each plan's hold |

  Shrinkage: k = 2 → LOO 2.152 / WF 2.066; k = 4 → 2.133 / 2.039;
  **k = 8** → 2.119 / 2.019 (lowest combined, ships).
- **The shipped model's own scores.** Leave-one-out: log-RMSE
  **2.116**, median APE 86%, 32% of peers priced within a factor of
  two (n = 128). Walk-forward: log-RMSE **2.032**, median APE 85%,
  34% within a factor of two (n = 65). Cross-sectional launch pricing
  is noisy; the radar publishes the noise instead of hiding it.
- **Rank ranges.** 200 bootstrap refits of the comps (mulberry32,
  seed 0x5EED, terms frozen, selection not re-run) give every row a
  5th–95th percentile rank and implied-value range.
- **Costed farm plans.** Each plan deposits a TVL-banded $50–$250 for
  an age-banded 30–60 days from the snapshot date (2026-11-14), with
  real exit dates. Cost counts every action at the first chain's gas
  (Ethereum $8, Solana $0.25, other chains $1.50, unlisted $3), a $6
  bridge fee on multi-chain plans, swap fees at 0.3% (in and out for
  DEX/yield categories), and forgone yield at 5%/yr. Expected value
  is the farmer's TVL-time share of a stated 5% community
  allocation, with the farming capital competing for it stated at
  **0.5% of TVL** (FARM_TVL_SHARE) — the whole TVL is not farming.
  Verdicts: farm at value ≥ 2 × cost, thin at ≥ cost, skip below —
  on this snapshot: **22 farm, 37 thin, 139 skip**. Each plan also
  carries a dated timeline — enter on the snapshot date, break even on
  the day the farmed value covers the all-in cost (printed even when
  it lands past the exit), exit at the end of the hold.

## Coverage: all 758 protocols, accounted for

The snapshot holds 758 protocols and the board ranks 198 of them. The
other 560 are counted, not dropped: 416 already trade — 128 of them
are the clean peers the curve is fitted on, so they are its anchors,
not its candidates — and 144 record no token of their own because they
are products of tokens that trade (bridges, staking wrappers, exchange
products, later versions). The dashboard's Coverage view lists every
protocol with its disposition and the reason, and the run's data
carries the same ledger, so the count checks line by line:
198 ranked + 416 traded + 144 set aside = 758.

## What it produces

- `board.json` — the ranked board (rank, name, implied value, rank
  range, the costed plan with its verdict, and 7–8 concrete farm
  steps per protocol).
- `dashboard/` — a self-contained static dashboard (board view with
  the fitted-model panel and verdict filter, per-protocol detail
  view with the plan costing and its dated timeline, and a coverage
  view accounting for all 758 protocols).
- `screenshots/` — 1440×900 captures of the three dashboard views.
- `dossier.json` — the full grading dossier, byte-identical to the
  kit's `buildDossier` output for the same run.

## Run it

```sh
node main.ts --input <kit>/input/snapshot.json
```

Requires Node 22. Output is deterministic: two runs over the same
snapshot produce byte-identical files.

## License

MIT — see `LICENSE`.
