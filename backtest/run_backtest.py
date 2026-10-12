#!/usr/bin/env python3
"""
PAL-PREDICT backtest: measure the risk engine against real historical results.

Data: football-data.co.uk season files (results + opening and closing odds from Pinnacle,
the market average, individual bookmakers, and over/under 2.5). Files are cached in
backtest/data/ (git-ignored).

What it measures (fitting on TRAIN seasons, reporting on TEST seasons only):
  A. 1X2 probability quality: Brier score, log loss, favourite hit rate and calibration for
     opening vs closing odds, average vs Pinnacle, power vs proportional margin removal.
     (Answers: how much do fresher odds help? which de-vig is better?)
  B. Score model: plain Poisson (current engine) vs Dixon-Coles, with and without the
     over/under 2.5 market. Fits Dixon-Coles rho on TRAIN by maximum likelihood of the real
     scores. Uses the real engine function risk_engine.fit_soccer_model.
  C. Value prices: replays the engine's value rule (per-book de-vig, sharp-weighted
     leave-one-out consensus, best price, min books, edge band) on opening prices and
     scores every flag by ROI and closing-line value (CLV) against Pinnacle's closing price.

Usage (from the repo root, with the project venv):
    venv/bin/python backtest/run_backtest.py --download        # fetch data, then run
    venv/bin/python backtest/run_backtest.py                   # run on cached data
Writes backtest/REPORT.md and backtest/results.json.
"""
import argparse
import csv
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import risk_engine as RE  # noqa: E402  (the real engine under test)

DATA = HERE / "data"
URL = "https://www.football-data.co.uk/mmz4281/{season}/{code}.csv"
LEAGUES = {
    "E0": "England Premier League", "E1": "England Championship", "E2": "England League One",
    "E3": "England League Two", "SC0": "Scotland Premiership", "D1": "Germany Bundesliga",
    "D2": "Germany 2. Bundesliga", "I1": "Italy Serie A", "I2": "Italy Serie B",
    "SP1": "Spain La Liga", "SP2": "Spain Segunda", "F1": "France Ligue 1", "F2": "France Ligue 2",
    "N1": "Netherlands Eredivisie", "B1": "Belgium Pro League", "P1": "Portugal Primeira",
    "T1": "Turkey Super Lig", "G1": "Greece Super League",
}
TRAIN = ["2223", "2324"]
TEST = ["2425", "2526"]

# Individual books in the files -> weight the engine would give them (see RE.SHARP_WEIGHTS).
BOOKS = {"PS": 3.0, "BFE": 2.0, "B365": 1.0, "BFD": 1.0, "BMGM": 1.0, "BV": 1.0, "BW": 1.0, "CL": 1.0, "LB": 1.0}
EPS = 1e-12


# --------------------------------------------------------------------------- data
def download(seasons, codes):
    DATA.mkdir(parents=True, exist_ok=True)
    for s in seasons:
        for c in codes:
            path = DATA / f"{c}_{s}.csv"
            if path.exists() and path.stat().st_size > 1000:
                continue
            req = urllib.request.Request(URL.format(season=s, code=c), headers={"User-Agent": "palbet-backtest/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    path.write_bytes(r.read())
                print(f"  downloaded {path.name}")
            except Exception as exc:  # a missing league/season is fine
                print(f"  skipped {path.name}: {exc}")
            time.sleep(0.3)  # be polite to a free service


def _f(row, key):
    try:
        v = float(row.get(key, "") or "nan")
    except ValueError:
        return float("nan")
    return v if math.isfinite(v) and v > 1.0 else float("nan")


def _triple(row, prefix, closing=False):
    c = "C" if closing else ""
    return [_f(row, f"{prefix}{c}{x}") for x in "HDA"]


def load(seasons, codes):
    matches = []
    for s in seasons:
        for c in codes:
            path = DATA / f"{c}_{s}.csv"
            if not path.exists():
                continue
            with path.open(encoding="utf-8-sig", errors="replace", newline="") as fh:
                for row in csv.DictReader(fh):
                    try:
                        hg, ag = int(row["FTHG"]), int(row["FTAG"])
                    except (KeyError, ValueError, TypeError):
                        continue
                    matches.append({
                        "league": c, "season": s, "hg": hg, "ag": ag,
                        "res": 0 if hg > ag else (1 if hg == ag else 2),
                        "open_avg": _triple(row, "Avg"), "close_avg": _triple(row, "Avg", True),
                        "open_pin": _triple(row, "PS"), "close_pin": _triple(row, "PS", True),
                        "books": {b: _triple(row, b) for b in BOOKS},
                        "over_open": (_f(row, "Avg>2.5"), _f(row, "Avg<2.5")),
                        "over_close": (_f(row, "AvgC>2.5"), _f(row, "AvgC<2.5")),
                    })
    return matches


def ok(prices):
    return all(math.isfinite(p) for p in prices)


def fair(prices, method="power"):
    return RE.devig(list(prices), method)


# --------------------------------------------------------------------------- A. 1X2 quality
def score_1x2(matches, source, method):
    rows = [(fair(m[source], method), m["res"]) for m in matches if ok(m[source])]
    if not rows:
        return None
    P = np.array([p for p, _ in rows])
    Y = np.zeros_like(P)
    Y[np.arange(len(rows)), [r for _, r in rows]] = 1
    fav = P.argmax(axis=1)
    return {
        "n": len(rows),
        "brier": float(((P - Y) ** 2).sum(axis=1).mean()),
        "log_loss": float(-np.log(np.clip((P * Y).sum(axis=1), EPS, 1)).mean()),
        "fav_hit": float((fav == Y.argmax(axis=1)).mean()),
        "fav_expected": float(P.max(axis=1).mean()),
    }


def calibration(matches, source="close_pin"):
    buckets = {}
    for m in matches:
        if not ok(m[source]):
            continue
        for i, p in enumerate(fair(m[source])):
            b = min(9, int(p * 10))
            d = buckets.setdefault(b, [0, 0.0, 0])
            d[0] += 1
            d[1] += p
            d[2] += int(i == m["res"])
    return [{"bucket": f"{b * 10}-{b * 10 + 10}%", "n": d[0], "predicted": d[1] / d[0], "observed": d[2] / d[0]}
            for b, d in sorted(buckets.items())]


# --------------------------------------------------------------------------- B. score model
def model_inputs(m):
    """1X2 + over 2.5 the engine would see near kickoff (closing market average)."""
    if not ok(m["close_avg"]):
        return None
    p = fair(m["close_avg"])
    over = fair(m["over_close"])[0] if ok(m["over_close"]) else None
    return p, over


def fit_rho(train, use_totals, grid):
    """Maximum-likelihood rho on TRAIN scores (lambdas re-fitted to the market for every rho)."""
    data = [(model_inputs(m), m) for m in train]
    data = [(x, m) for x, m in data if x and (x[1] is not None or not use_totals)]
    best = None
    for rho in grid:
        ll = 0.0
        for (p, over), m in data:
            fit = RE.fit_soccer_model(*p, p_over25=over if use_totals else None, rho=rho)
            ll += math.log(max(fit["joint"][min(m["hg"], 10), min(m["ag"], 10)], EPS))
        ll /= len(data)
        if best is None or ll > best[1]:
            best = (float(rho), ll)
    return best[0], len(data)


def score_models(test, variants):
    out = {}
    for name, (rho, use_totals) in variants.items():
        n = ll = exact = over_b = btts_b = 0.0
        low_pred = low_obs = 0.0
        for m in test:
            x = model_inputs(m)
            if not x or (use_totals and x[1] is None):
                continue
            p, over = x
            fit = RE.fit_soccer_model(*p, p_over25=over if use_totals else None, rho=rho)
            j = fit["joint"]
            hg, ag = min(m["hg"], 10), min(m["ag"], 10)
            n += 1
            ll += math.log(max(j[hg, ag], EPS))
            exact += fit["score"] == f"{m['hg']} - {m['ag']}"
            over_b += (fit["over25"] - (m["hg"] + m["ag"] >= 3)) ** 2
            btts_b += (fit["btts"] - (m["hg"] > 0 and m["ag"] > 0)) ** 2
            low_pred += j[0, 0] + j[1, 1]
            low_obs += (m["hg"], m["ag"]) in ((0, 0), (1, 1))
        out[name] = {"rho": rho, "totals": use_totals, "n": int(n), "score_log_lik": ll / n,
                     "exact_score_hit": exact / n, "over25_brier": over_b / n, "btts_brier": btts_b / n,
                     "p_0_0_or_1_1_predicted": low_pred / n, "p_0_0_or_1_1_observed": low_obs / n}
    # Baseline: the market's own over/under price, no model at all.
    rows = [(fair(m["over_close"])[0], m["hg"] + m["ag"] >= 3) for m in test if ok(m["over_close"])]
    out["_market_over25_brier"] = sum((p - y) ** 2 for p, y in rows) / len(rows)
    return out


# --------------------------------------------------------------------------- C. value prices
def value_flags(matches, min_books):
    """Replay the engine's value rule on opening prices; return the best-edge selection per
    match (no edge cap here, so bands above the engine's cap can be inspected too)."""
    flags = []
    for m in matches:
        books = {b: q for b, q in m["books"].items() if ok(q)}
        if len(books) < min_books or not ok(m["close_pin"]):
            continue
        probs = {b: fair(q) for b, q in books.items()}
        best = None
        for s in range(3):
            book = max(sorted(books), key=lambda b: books[b][s])
            others = [b for b in books if b != book]
            tw = sum(BOOKS[b] for b in others)
            vec = [sum(BOOKS[b] * probs[b][k] for b in others) / tw for k in range(3)]
            fp = vec[s] / sum(vec)
            edge = fp * books[book][s] - 1
            if best is None or edge > best[0]:
                best = (edge, s, books[book][s], fp)
        edge, s, price, fp = best
        close_fair = fair(m["close_pin"])[s]
        flags.append({"edge": edge, "sel": s, "price": price, "won": s == m["res"],
                      "clv": price * close_fair - 1, "fair": fp})
    return flags


def summarize_flags(flags, bands):
    """bands: list of (low, high) edge ranges; high=None means no upper limit."""
    out = []
    for lo, hi in bands:
        f = [x for x in flags if x["edge"] > lo and (hi is None or x["edge"] <= hi)]
        if not f:
            out.append({"min_edge": lo, "max_edge": hi, "n": 0})
            continue
        profit = sum(x["price"] - 1 if x["won"] else -1 for x in f)
        out.append({
            "min_edge": lo, "max_edge": hi, "n": len(f), "hit_rate": sum(x["won"] for x in f) / len(f),
            "avg_price": sum(x["price"] for x in f) / len(f), "roi": profit / len(f),
            "mean_clv": sum(x["clv"] for x in f) / len(f),
            "beat_close": sum(x["clv"] > 0 for x in f) / len(f),
        })
    return out


# --------------------------------------------------------------------------- report
def pct(x, d=1):
    return f"{x * 100:.{d}f}%"


def write_report(res):
    A, B, C = res["A"], res["B"], res["C"]
    L = ["# Risk engine backtest", "",
         f"Generated by `backtest/run_backtest.py` on {res['generated']}. Data: football-data.co.uk, "
         f"{len(res['leagues'])} leagues. Fitted on seasons {', '.join(res['train'])} "
         f"({res['n_train']} matches); every number below is from the unseen test seasons "
         f"{', '.join(res['test'])} ({res['n_test']} matches).", "",
         "## A. How good are the win/draw/loss probabilities?", "",
         "Lower Brier and log loss are better. Guessing one third each scores Brier 0.667, log loss 1.099.", "",
         "| Odds used | Margin removal | Matches | Brier | Log loss | Favourite won | Favourite expected |",
         "|---|---|---|---|---|---|---|"]
    for key, v in A["sources"].items():
        src, method = key.split("|")
        L.append(f"| {src} | {method} | {v['n']} | {v['brier']:.4f} | {v['log_loss']:.4f} | {pct(v['fav_hit'])} | {pct(v['fav_expected'])} |")
    L += ["", "Calibration of Pinnacle closing probabilities (said vs happened):", "",
          "| Chance band | Forecasts | Said | Happened |", "|---|---|---|---|"]
    L += [f"| {r['bucket']} | {r['n']} | {pct(r['predicted'])} | {pct(r['observed'])} |" for r in A["calibration"]]

    L += ["", "## B. Score model", "",
          f"Dixon-Coles rho fitted on training seasons: **{B['rho_1x2']:+.2f}** (1X2 only), "
          f"**{B['rho_totals']:+.2f}** (with over/under). Higher score log-likelihood is better.", "",
          "| Model | Score log-lik | Exact score right | Over 2.5 Brier | BTTS Brier | 0-0/1-1 said | 0-0/1-1 happened |",
          "|---|---|---|---|---|---|---|"]
    for name, v in B["models"].items():
        if name.startswith("_"):
            continue
        L.append(f"| {name} | {v['score_log_lik']:.4f} | {pct(v['exact_score_hit'])} | {v['over25_brier']:.4f} | "
                 f"{v['btts_brier']:.4f} | {pct(v['p_0_0_or_1_1_predicted'])} | {pct(v['p_0_0_or_1_1_observed'])} |")
    L += ["", f"Over 2.5 Brier of the bookmakers' own over/under price: {B['models']['_market_over25_brier']:.4f}.", "",
          "## C. Value prices (engine rule replayed on opening prices)", "",
          "CLV = flagged price against Pinnacle's closing fair price. Positive mean CLV means the flags "
          "systematically beat the final market: the best available evidence of real value. ROI over a "
          "few hundred flags is mostly noise.", "",
          f"Engine setting: value is flagged for edges above {pct(C['engine_min_edge'], 0)} and up to "
          f"{pct(C['engine_max_edge'], 0)} (larger edges are shown as 'verify', not value).", "",
          "| Edge band | Flags | Won | Avg price | ROI (1 unit each) | Mean CLV | Beat the close |",
          "|---|---|---|---|---|---|---|"]

    def band(r):
        return f"{pct(r['min_edge'], 0)}–{pct(r['max_edge'], 0)}" if r["max_edge"] is not None else f"over {pct(r['min_edge'], 0)}"

    for key, title in (("bands", None), ("engine", "Engine's value window")):
        if title:
            L += ["", f"**{title}:**", "", "| Edge band | Flags | Won | Avg price | ROI (1 unit each) | Mean CLV | Beat the close |",
                  "|---|---|---|---|---|---|---|"]
        for r in C[key]:
            if not r["n"]:
                L.append(f"| {band(r)} | 0 | | | | | |")
                continue
            L.append(f"| {band(r)} | {r['n']} | {pct(r['hit_rate'])} | {r['avg_price']:.2f} | "
                     f"{r['roi'] * 100:+.1f}% | {r['mean_clv'] * 100:+.2f}% | {pct(r['beat_close'])} |")
    L += ["", "Caveat: 'opening' prices are a single snapshot per match taken days before kickoff, and the "
          "best price across books may not have been available at the same moment.", ""]
    (HERE / "REPORT.md").write_text("\n".join(L))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--download", action="store_true", help="fetch missing season files first")
    ap.add_argument("--leagues", default=",".join(LEAGUES), help="comma-separated football-data codes")
    args = ap.parse_args(argv)
    codes = [c.strip() for c in args.leagues.split(",") if c.strip()]

    if args.download:
        print("Downloading season files...")
        download(TRAIN + TEST, codes)

    train, test = load(TRAIN, codes), load(TEST, codes)
    if not train or not test:
        sys.exit("No data. Run with --download first.")
    print(f"Loaded {len(train)} training and {len(test)} test matches.")

    t0 = time.time()
    A = {"sources": {}, "calibration": calibration(test)}
    for src in ("open_avg", "close_avg", "open_pin", "close_pin"):
        for method in ("proportional", "power"):
            r = score_1x2(test, src, method)
            if r:
                A["sources"][f"{src}|{method}"] = r
    print(f"A done ({time.time() - t0:.0f}s)")

    grid = np.round(np.arange(-0.20, 0.0501, 0.01), 2)
    rho_1x2, _ = fit_rho(train, False, grid)
    rho_tot, _ = fit_rho(train, True, grid)
    B = {"rho_1x2": rho_1x2, "rho_totals": rho_tot, "models": score_models(test, {
        "Poisson, 1X2 only (previous engine)": (0.0, False),
        "Dixon-Coles, 1X2 only (engine default)": (rho_1x2, False),
        "Poisson + over/under market": (0.0, True),
        "Dixon-Coles + over/under market (RISK_ENGINE_TOTALS=1)": (rho_tot, True),
    })}
    print(f"B done ({time.time() - t0:.0f}s): rho {rho_1x2:+.2f} / {rho_tot:+.2f}")

    flags = value_flags(test, RE.CFG.min_books)
    C = {
        "engine_min_edge": RE.CFG.min_edge, "engine_max_edge": RE.CFG.max_plausible_edge,
        "bands": summarize_flags(flags, [(0.0, 0.03), (0.03, 0.05), (0.05, 0.08), (0.08, 0.10), (0.10, 0.15), (0.15, None)]),
        "engine": summarize_flags(flags, [(RE.CFG.min_edge, RE.CFG.max_plausible_edge)]),
    }
    print(f"C done ({time.time() - t0:.0f}s)")

    res = {"generated": time.strftime("%Y-%m-%d"), "leagues": codes, "train": TRAIN, "test": TEST,
           "n_train": len(train), "n_test": len(test), "A": A, "B": B, "C": C}
    (HERE / "results.json").write_text(json.dumps(res, indent=2))
    write_report(res)
    print((HERE / "REPORT.md").read_text())


if __name__ == "__main__":
    main()
