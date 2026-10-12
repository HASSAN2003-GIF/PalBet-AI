"""Accuracy experiments for the 1X2 probabilities. Fit on TRAIN seasons, score on TEST.

    venv/bin/python -u backtest/experiments.py

Questions answered (all on unseen test seasons, same matches for every row in a table):
  1. Margin removal: proportional vs power vs Shin.
  2. Which prices: Pinnacle only vs market average vs the engine's sharp-weighted consensus.
  3. A small calibration layer (fitted on train) on top of the market.
  4. How much accuracy is lost by using early prices instead of prices near kick-off.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import run_backtest as BT  # noqa: E402

EPS = 1e-12


# --------------------------------------------------------------------------- margin removal
def shin(prices):
    """Shin (1993): margin comes from insider trading, so longshots carry more of it."""
    q = [1.0 / p for p in prices]
    s = sum(q)
    if s <= 1.0:
        return [x / s for x in q]

    def probs(z):
        return [(math.sqrt(z * z + 4 * (1 - z) * x * x / s) - z) / (2 * (1 - z)) for x in q]

    lo, hi = 0.0, 0.5
    for _ in range(60):
        z = (lo + hi) / 2
        if sum(probs(z)) > 1.0:
            lo = z
        else:
            hi = z
    p = probs((lo + hi) / 2)
    t = sum(p)
    return [x / t for x in p]


def devig(prices, method):
    return shin(prices) if method == "shin" else BT.fair(prices, method)


SHARP = {"PS": 3.0, "BFE": 2.0}   # same idea as the engine's SHARP_WEIGHTS; every other book 1.0
SKIP = {"Max", "Avg", "BbMx", "BbAv"}


def load(seasons):
    """Every match with per-book opening and closing 1X2 prices, books found from the header."""
    import csv
    out = []
    for s in seasons:
        for code in BT.LEAGUES:
            path = BT.DATA / f"{code}_{s}.csv"
            if not path.exists():
                continue
            with path.open(encoding="utf-8-sig", errors="replace", newline="") as fh:
                reader = csv.DictReader(fh)
                cols = set(reader.fieldnames or [])
                open_books = [c[:-1] for c in cols if c.endswith("H") and c[:-1] + "D" in cols and c[:-1] + "A" in cols
                              and not c[:-1].endswith("C") and c[:-1] not in SKIP and ">" not in c and "<" not in c]
                for row in reader:
                    try:
                        hg, ag = int(row["FTHG"]), int(row["FTAG"])
                    except (KeyError, ValueError, TypeError):
                        continue
                    m = {"league": code, "season": s, "res": 0 if hg > ag else (1 if hg == ag else 2),
                         "open": {}, "close": {}}
                    for b in open_books:
                        o, c = BT._triple(row, b), BT._triple(row, b, True)
                        if BT.ok(o):
                            m["open"][b] = o
                        if BT.ok(c):
                            m["close"][b] = c
                    m["open_avg"], m["close_avg"] = BT._triple(row, "Avg"), BT._triple(row, "Avg", True)
                    out.append(m)
    return out


def consensus(books, method, sharp=None):
    """Engine-style weighted consensus of every book's fair probabilities."""
    sharp = SHARP if sharp is None else sharp
    acc, wsum = np.zeros(3), 0.0
    for book, triple in books.items():
        w = sharp.get(book, 1.0)
        acc += w * np.array(devig(triple, method))
        wsum += w
    return (acc / wsum).tolist() if wsum >= 3.0 else None  # Pinnacle, or at least three books


# --------------------------------------------------------------------------- scoring
def per_match(P, res):
    """Per-match Brier and log loss arrays."""
    Y = np.zeros_like(P)
    Y[np.arange(len(res)), res] = 1
    return ((P - Y) ** 2).sum(axis=1), -np.log(np.clip((P * Y).sum(axis=1), EPS, 1))


def summary(P, res, base=None):
    brier, ll = per_match(P, res)
    out = {"n": len(res), "brier": float(brier.mean()), "log_loss": float(ll.mean())}
    if base is not None:  # paired difference vs a baseline on the same matches, with a 95% interval
        d = ll - base
        out["ll_diff"] = float(d.mean())
        out["ll_diff_ci"] = float(1.96 * d.std(ddof=1) / math.sqrt(len(d)))
    return out


# --------------------------------------------------------------------------- calibration layer
def recalibrate(P, a, home, draw):
    """p_i ∝ p_i^a · exp(shift_i): a>1 sharpens favourites, the shifts nudge home / draw."""
    L = a * np.log(np.clip(P, EPS, 1)) + np.array([home, draw, 0.0])
    L -= L.max(axis=1, keepdims=True)
    E = np.exp(L)
    return E / E.sum(axis=1, keepdims=True)


def fit_layer(P, res):
    best = (1.0, 0.0, 0.0)
    loss = lambda p: per_match(recalibrate(P, *p), res)[1].mean()
    best_loss = loss(best)
    for step in (0.05, 0.02, 0.01, 0.005):   # coordinate search, shrinking steps
        improved = True
        while improved:
            improved = False
            for i in range(3):
                for sign in (-1, 1):
                    cand = list(best)
                    cand[i] += sign * step
                    l = loss(cand)
                    if l < best_loss - 1e-9:
                        best, best_loss, improved = tuple(cand), l, True
    return best


def leaguewise_layer(train, test, key):
    """Same layer fitted per league (more parameters: checks if leagues differ)."""
    out = np.array(test["P"][key])
    for lg in set(test["league"]):
        tr = [i for i, x in enumerate(train["league"]) if x == lg]
        te = [i for i, x in enumerate(test["league"]) if x == lg]
        if len(tr) < 600 or not te:
            continue
        params = fit_layer(np.array(train["P"][key])[tr], np.array(train["res"])[tr])
        out[te] = recalibrate(np.array(test["P"][key])[te], *params)
    return out


# --------------------------------------------------------------------------- dataset
VARIANTS = {
    # name: (when, which prices, margin removal)
    "pin_close_prop": ("close", "pin", "proportional"),
    "pin_close_power": ("close", "pin", "power"),
    "pin_close_shin": ("close", "pin", "shin"),
    "avg_close_power": ("close", "avg", "power"),
    "cons_close_prop": ("close", "cons", "proportional"),
    "cons_close_power": ("close", "cons", "power"),
    "cons_close_shin": ("close", "cons", "shin"),
    "pin_open_power": ("open", "pin", "power"),
    "pin_open_shin": ("open", "pin", "shin"),
    "avg_open_power": ("open", "avg", "power"),
    "cons_open_power": ("open", "cons", "power"),
    "cons_open_shin": ("open", "cons", "shin"),
    "cons10_open_shin": ("open", "cons10", "shin"),
    "cons25_open_shin": ("open", "cons25", "shin"),
    "cons10_close_shin": ("close", "cons10", "shin"),
    "cons25_close_shin": ("close", "cons25", "shin"),
}
HEAVY = {"cons10": {"PS": 10.0, "BFE": 4.0}, "cons25": {"PS": 25.0, "BFE": 8.0}}


def build(matches):
    """Only matches where every variant exists, so every row is scored on the same games."""
    data = {"P": {k: [] for k in VARIANTS}, "res": [], "league": []}
    for m in matches:
        row = {}
        for name, (when, src, method) in VARIANTS.items():
            books = m[when]
            if src == "pin":
                p = devig(books["PS"], method) if "PS" in books else None
            elif src == "avg":
                tri = m[f"{when}_avg"]
                p = devig(tri, method) if BT.ok(tri) else None
            else:
                p = consensus(books, method, HEAVY.get(src))
            if p is None:
                break
            row[name] = p
        else:
            for name, p in row.items():
                data["P"][name].append(p)
            data["res"].append(m["res"])
            data["league"].append(m["league"])
    return data


# --------------------------------------------------------------------------- value flags
def value_replay(matches, fair_mode, method):
    """Replay the value rule on opening prices. fair_mode:
       'loo'      today's engine: weighted consensus of every book except the one quoting the price
       'pinnacle' Pinnacle's own fair price when the best price is elsewhere, else 'loo'."""
    flags = []
    for m in matches:
        books = m["open"]
        if len(books) < 4 or "PS" not in m["close"]:
            continue
        probs = {b: devig(q, method) for b, q in books.items()}
        best = None
        for s in range(3):
            book = max(sorted(books), key=lambda b: books[b][s])
            if fair_mode == "pinnacle" and "PS" in books and book != "PS":
                fp = probs["PS"][s]
            else:
                others = [b for b in books if b != book]
                tw = sum(SHARP.get(b, 1.0) for b in others)
                vec = [sum(SHARP.get(b, 1.0) * probs[b][k] for b in others) / tw for k in range(3)]
                fp = vec[s] / sum(vec)
            edge = fp * books[book][s] - 1
            if best is None or edge > best[0]:
                best = (edge, s, books[book][s])
        edge, s, price = best
        flags.append({"edge": edge, "price": price, "won": s == m["res"],
                      "clv": price * devig(m["close"]["PS"], "power")[s] - 1})
    out = []
    for lo, hi in ((0.03, 0.05), (0.05, 0.10), (0.10, None)):
        f = [x for x in flags if x["edge"] > lo and (hi is None or x["edge"] <= hi)]
        if f:
            out.append({"band": f"{lo:.0%}-{hi:.0%}" if hi else f">{lo:.0%}", "n": len(f),
                        "mean_clv": sum(x["clv"] for x in f) / len(f),
                        "beat_close": sum(x["clv"] > 0 for x in f) / len(f),
                        "roi": sum(x["price"] - 1 if x["won"] else -1 for x in f) / len(f)})
    return out


# --------------------------------------------------------------------------- main
def main():
    test_matches = load(BT.TEST)
    for mode, method in (("loo", "power"), ("loo", "shin"), ("pinnacle", "power"), ("pinnacle", "shin")):
        for r in value_replay(test_matches, mode, method):
            print(f"value {mode:8s} {method:6s} {r['band']:7s} n={r['n']:5d} CLV={r['mean_clv']:+.4f} "
                  f"beat={r['beat_close']:.3f} roi={r['roi']:+.3f}")
    if "--value-only" in sys.argv:
        return
    train, test = build(load(BT.TRAIN)), build(load(BT.TEST))
    res = np.array(test["res"])
    print(f"train {len(train['res'])} matches, test {len(res)} matches (every variant available)")
    P = {k: np.array(v) for k, v in test["P"].items()}
    base_key = "cons_open_power"   # what the engine does today when it runs well before kick-off
    base_ll = per_match(P[base_key], res)[1]
    out = {"n_train": len(train["res"]), "n_test": int(len(res)), "baseline": base_key, "rows": {}}

    for name in VARIANTS:
        out["rows"][name] = summary(P[name], res, base_ll)

    # calibration layer, fitted on train, for the engine's own consensus at both timings
    for key in ("cons_open_power", "cons_close_power", "cons_open_shin", "cons_close_shin"):
        params = fit_layer(np.array(train["P"][key]), np.array(train["res"]))
        out["rows"][f"{key}+layer"] = {**summary(recalibrate(P[key], *params), res, base_ll),
                                       "params": [round(x, 3) for x in params]}
        out["rows"][f"{key}+league_layer"] = summary(leaguewise_layer(train, test, key), res, base_ll)

    # draw calibration: is the market's draw price systematically off?
    for key in ("cons_open_power", "cons_close_power"):
        out[f"draw_{key}"] = {"said": float(P[key][:, 1].mean()), "happened": float((res == 1).mean())}

    (HERE / "experiments.json").write_text(json.dumps(out, indent=2))
    print(f"{'variant':34s} {'brier':>8s} {'logloss':>8s} {'vs today':>10s} {'±95%':>8s}")
    for name, r in out["rows"].items():
        print(f"{name:34s} {r['brier']:8.4f} {r['log_loss']:8.4f} {r['ll_diff']:+10.4f} {r['ll_diff_ci']:8.4f}"
              + (f"  params={r['params']}" if "params" in r else ""))
    for k, v in out.items():
        if k.startswith("draw_"):
            print(k, v)


if __name__ == "__main__":
    main()
