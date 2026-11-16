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

## What it produces

- `board.json` — the ranked board (rank, name, implied value, and
  7–8 concrete farm steps per protocol).
- `dashboard/` — a self-contained static dashboard (board view,
  per-protocol detail view, and a Risk Curators filter view).
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
