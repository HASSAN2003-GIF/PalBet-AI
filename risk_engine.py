#!/usr/bin/env python3
"""
Betting Risk Engine v2.

What it does
------------
Pulls head-to-head odds from The Odds API for ALL available bookmakers, removes each
bookmaker's margin, builds a (sharp-weighted) market-consensus fair probability, and flags
selections where one bookmaker's price is meaningfully better than the consensus of the
OTHER books (leave-one-out, so a book never validates its own price). Stakes use fractional
Kelly with hard caps. Form data comes from ESPN where available and is labelled by source.

CLI (positional contract unchanged from v1; argv[1] is ignored, as before):
    python risk_engine.py <ignored> <api_key | -> <menu | odds | value> [sport_key]

    menu   list sports (free endpoint, cached 24h)
    odds   every upcoming match with analysis (same keys as v1 + new ones)
    value  only actionable value bets, best first

stdout is ALWAYS valid JSON (an array). Logs/errors go to stderr.
The API key may also come from the ODDS_API_KEY environment variable (preferred: a key on the
command line is visible to other local users via `ps`).

Environment (all optional)
--------------------------
ODDS_API_KEY, ODDS_REGIONS (us,eu), RISK_ENGINE_BANKROLL (1000), RISK_ENGINE_MIN_EDGE (0.03),
RISK_ENGINE_MAX_EDGE (0.15), RISK_ENGINE_KELLY_FRACTION (0.25), RISK_ENGINE_MAX_STAKE_PCT (0.05),
RISK_ENGINE_MAX_EXPOSURE_PCT (0.15), RISK_ENGINE_MIN_BOOKS (4), RISK_ENGINE_MAX_QUOTE_AGE_MIN (240),
RISK_ENGINE_ODDS_TTL (300 s), RISK_ENGINE_NO_CACHE, RISK_ENGINE_CACHE_DIR, RISK_ENGINE_DEVIG
(power|proportional), RISK_ENGINE_SYNTHETIC_FORM (1), RISK_ENGINE_STRICT (non-zero exit on
failure), RISK_ENGINE_LOG (WARNING).
"""
import difflib
import hashlib
import json
import logging
import math
import os
import re
import sys
import tempfile
import threading
import time
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from statistics import NormalDist, pstdev

import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LOG = logging.getLogger("risk_engine")
ODDS_API = "https://api.the-odds-api.com/v4"

# Books whose prices are better estimates of true probability get more weight in the consensus.
# Everything else weighs 1.0. These are assumptions about market quality, not measured values.
SHARP_WEIGHTS = {"pinnacle": 3.0, "betfair_ex_eu": 2.0, "betfair_ex_uk": 2.0,
                 "matchbook": 2.0, "smarkets": 1.5}

# (typical total points, std-dev of final margin) -- only leagues listed here get a score model.
BASKETBALL_PARAMS = {"basketball_nba": (222.0, 12.0), "basketball_wnba": (163.0, 11.0),
                     "basketball_ncaab": (142.0, 11.0), "basketball_euroleague": (160.0, 11.0)}

ESPN_SLUGS = {
    'soccer_epl': 'soccer/eng.1', 'soccer_spain_la_liga': 'soccer/esp.1',
    'soccer_italy_serie_a': 'soccer/ita.1', 'soccer_germany_bundesliga': 'soccer/ger.1',
    'soccer_france_ligue_one': 'soccer/fra.1', 'soccer_usa_mls': 'soccer/usa.1',
    'basketball_nba': 'basketball/nba',
    # added (same ESPN URL scheme; failures degrade gracefully to "no form data")
    'soccer_efl_champ': 'soccer/eng.2', 'soccer_netherlands_eredivisie': 'soccer/ned.1',
    'soccer_portugal_primeira_liga': 'soccer/por.1', 'basketball_wnba': 'basketball/wnba',
    'icehockey_nhl': 'hockey/nhl', 'americanfootball_nfl': 'football/nfl',
    'baseball_mlb': 'baseball/mlb',
}


# --------------------------------------------------------------------------- configuration
def _env_number(name, default, cast=float, lo=None, hi=None):
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        val = cast(raw)
    except ValueError:
        LOG.warning("Ignoring invalid %s=%r (using %s)", name, raw, default)
        return default
    bad = (isinstance(val, float) and not math.isfinite(val)) or \
          (lo is not None and val < lo) or (hi is not None and val > hi)
    if bad:
        LOG.warning("Ignoring out-of-range %s=%r (using %s)", name, raw, default)
        return default
    return val


def _env_flag(name, default):
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in ("1", "true", "yes", "on")


class Config:
    def __init__(self):
        regions = [r.strip() for r in os.environ.get("ODDS_REGIONS", "us,eu").lower().split(",")]
        self.regions = [r for r in regions if r in {"us", "us2", "uk", "au", "eu"}] or ["us", "eu"]
        self.bankroll = _env_number("RISK_ENGINE_BANKROLL", 1000.0, lo=1.0)
        self.min_edge = _env_number("RISK_ENGINE_MIN_EDGE", 0.03, lo=0.0, hi=1.0)
        self.max_plausible_edge = _env_number("RISK_ENGINE_MAX_EDGE", 0.15, lo=0.01, hi=10.0)
        self.kelly_fraction = _env_number("RISK_ENGINE_KELLY_FRACTION", 0.25, lo=0.01, hi=1.0)
        self.max_stake_pct = _env_number("RISK_ENGINE_MAX_STAKE_PCT", 0.05, lo=0.001, hi=1.0)
        self.max_exposure_pct = _env_number("RISK_ENGINE_MAX_EXPOSURE_PCT", 0.15, lo=0.001, hi=1.0)
        self.min_books = _env_number("RISK_ENGINE_MIN_BOOKS", 4, cast=int, lo=2, hi=50)
        self.max_quote_age_min = _env_number("RISK_ENGINE_MAX_QUOTE_AGE_MIN", 240.0, lo=1.0)
        self.odds_ttl = _env_number("RISK_ENGINE_ODDS_TTL", 300.0, lo=0.0)
        self.form_ttl = 6 * 3600.0
        self.menu_ttl = 24 * 3600.0
        self.max_stale = 24 * 3600.0
        self.use_cache = not _env_flag("RISK_ENGINE_NO_CACHE", False)
        uid = getattr(os, "getuid", lambda: "u")()
        self.cache_dir = Path(os.environ.get("RISK_ENGINE_CACHE_DIR") or
                              Path(tempfile.gettempdir()) / f"risk_engine_cache_{uid}")
        method = os.environ.get("RISK_ENGINE_DEVIG", "power").strip().lower()
        self.devig_method = method if method in ("power", "proportional") else "power"
        self.allow_synthetic_form = _env_flag("RISK_ENGINE_SYNTHETIC_FORM", True)
        self.strict = _env_flag("RISK_ENGINE_STRICT", False)


CFG = Config()


class DataSourceError(RuntimeError):
    """A remote data source failed in a way the caller should know about."""


# --------------------------------------------------------------------------- HTTP + cache
_SESSION = None
_SESSION_LOCK = threading.Lock()


def _session():
    """One pooled session with bounded retries/backoff for transient failures (reused)."""
    global _SESSION
    with _SESSION_LOCK:
        if _SESSION is None:
            s = requests.Session()
            kwargs = dict(total=3, connect=3, read=2, status=3, backoff_factor=0.6,
                          status_forcelist=(429, 500, 502, 503, 504),
                          respect_retry_after_header=True)
            try:
                retry = Retry(allowed_methods=frozenset(["GET"]), **kwargs)
            except TypeError:  # very old urllib3
                retry = Retry(**kwargs)
            s.mount("https://", HTTPAdapter(max_retries=retry, pool_maxsize=8))
            s.headers.update({"User-Agent": "risk-engine/2.0"})
            _SESSION = s
        return _SESSION


def _redact(text, secret=None):
    text = str(text)
    if secret:
        text = text.replace(secret, "***")
    return re.sub(r"(apiKey=)[^&\s'\"]+", r"\1***", text, flags=re.I)


def _cache_path(url, params):
    # the API key is deliberately NOT part of the key / filename
    safe = sorted((k, str(v)) for k, v in (params or {}).items() if k.lower() != "apikey")
    digest = hashlib.sha256(json.dumps([url, safe]).encode()).hexdigest()[:32]
    return CFG.cache_dir / f"{digest}.json"


def _read_cache(path):
    try:
        blob = json.loads(path.read_text())
        ts = float(blob["ts"])
        return max(0.0, time.time() - ts), blob["data"]
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write_cache(path, data):
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        tmp.write_text(json.dumps({"ts": time.time(), "data": data}))
        os.replace(tmp, path)  # atomic: readers never see a half-written file
    except (OSError, TypeError, ValueError) as exc:
        LOG.debug("cache write skipped: %s", exc)


def http_get_json(url, params=None, ttl=0.0, headers=None, secret=None):
    """GET -> (json, meta). Serves fresh cache within `ttl`; falls back to stale cache only on
    transient failures (network / 429 / 5xx). Error text never contains the API key."""
    path = _cache_path(url, params) if (ttl > 0 and CFG.use_cache) else None
    cached = _read_cache(path) if path else None
    if cached and cached[0] <= ttl:
        return cached[1], {"source": "cache", "age": cached[0], "remaining": None}
    try:
        resp = _session().get(url, params=params, headers=headers, timeout=(5, 15))
        remaining = resp.headers.get("x-requests-remaining")
        if remaining is not None:
            LOG.info("Odds API credits remaining: %s", remaining)
            try:
                if int(remaining) < 20:
                    LOG.warning("Odds API credits almost exhausted: %s left", remaining)
            except ValueError:
                pass
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        msg = _redact(f"{type(exc).__name__}: {exc}", secret)
        if status:
            msg = f"HTTP {status} - {msg}"
        transient = status is None or status == 429 or status >= 500
        if cached and transient and cached[0] <= CFG.max_stale:
            LOG.warning("Fetch failed (%s); serving %.0fs-old cached data", msg, cached[0])
            return cached[1], {"source": "stale_cache", "age": cached[0], "remaining": None}
        raise DataSourceError(msg) from None  # `from None`: no URL-with-key in tracebacks
    if path:
        _write_cache(path, data)
    return data, {"source": "network", "age": 0.0, "remaining": remaining}


# --------------------------------------------------------------------------- risk engine
class BettingRiskEngine:
    def __init__(self, bankroll=1000):
        try:
            bankroll = float(bankroll)
        except (TypeError, ValueError):
            raise ValueError("bankroll must be a number") from None
        if not math.isfinite(bankroll) or bankroll <= 0:
            raise ValueError("bankroll must be positive and finite")
        self.bankroll = bankroll

    def calculate_edge(self, true_prob, decimal_odds):
        """Expected profit per 1 unit staked."""
        return (true_prob * decimal_odds) - 1.0

    def calculate_kelly_stake(self, prob, odds, kelly_fraction=None):
        """Fractional Kelly, capped at CFG.max_stake_pct of bankroll.
        Accepts 0.55 or 55 (percent). Unifies the two conflicting v1 definitions (the class
        one used FULL Kelly; the fractional one at module level was unreachable dead code)."""
        frac = CFG.kelly_fraction if kelly_fraction is None else kelly_fraction
        try:
            p, o, frac = float(prob), float(odds), float(frac)
        except (TypeError, ValueError):
            return 0.0
        if not all(math.isfinite(v) for v in (p, o, frac)):
            return 0.0
        if p > 1.0:
            p /= 100.0
        if not 0.0 < p < 1.0 or o <= 1.0 or frac <= 0.0:
            return 0.0
        b = o - 1.0
        full = (b * p - (1.0 - p)) / b
        if full <= 0.0:
            return 0.0
        return round(self.bankroll * min(full * min(frac, 1.0), CFG.max_stake_pct), 2)

    def apply_exposure_cap(self, rows):
        """Scale value-bet stakes down if their sum exceeds the portfolio exposure cap."""
        picks = [r for r in rows if r.get("is_value_bet") and r.get("stake", 0) > 0]
        total = sum(r["stake"] for r in picks)
        cap = self.bankroll * CFG.max_exposure_pct
        if total > cap > 0:
            scale = cap / total
            for r in picks:
                r["stake"] = round(r["stake"] * scale, 2)
                r["expected_profit"] = round(r["stake"] * r["edge"], 2)
                r["stake_scaled"] = True
        return rows


# --------------------------------------------------------------------------- probability maths
def devig(prices, method=None):
    """Decimal odds of one market -> fair probabilities summing to 1.
    'power' (default) solves sum(q_i**k)=1, which removes more margin from longshots than the
    naive proportional split and so counters favourite-longshot bias."""
    method = method or CFG.devig_method
    q = [1.0 / p for p in prices]
    s = sum(q)
    if method == "power" and s > 1.0 and all(0.0 < x < 1.0 for x in q):
        lo, hi = 1.0, 200.0
        for _ in range(80):
            k = (lo + hi) / 2.0
            if sum(x ** k for x in q) > 1.0:
                lo = k
            else:
                hi = k
        out = [x ** ((lo + hi) / 2.0) for x in q]
        t = sum(out)
        return [x / t for x in out]
    return [x / s for x in q]


def poisson_pmf(lmbda, k):
    return (lmbda ** k * math.exp(-lmbda)) / math.factorial(k)


_GOALS = np.arange(0, 11)
_FACT = np.array([math.factorial(int(k)) for k in _GOALS], dtype=float)
_LAMBDAS = np.arange(0.10, 4.0001, 0.05)


@lru_cache(maxsize=1)
def _soccer_grid():
    lam = _LAMBDAS
    pmf = np.exp(-lam)[:, None] * lam[:, None] ** _GOALS[None, :] / _FACT[None, :]   # (G, K)
    joint = pmf[:, None, :, None] * pmf[None, :, None, :]                             # (G, G, K, K)
    H, A = np.meshgrid(_GOALS, _GOALS, indexing="ij")
    masks = (H > A, H == A, H < A)
    pH, pD, pA = ((joint * m).sum(axis=(2, 3)) for m in masks)
    return {"joint": joint, "H": H, "A": A, "masks": masks, "pH": pH, "pD": pD, "pA": pA}


def fit_soccer_model(p_home, p_draw, p_away):
    """Find the independent-Poisson (lambda_home, lambda_away) whose 1X2 probabilities best match
    the market, then read the most likely scoreline CONSISTENT with the most likely result, plus
    Over 2.5 and BTTS, from that same fitted distribution (v1 used ad-hoc multipliers)."""
    v = np.array([p_home, p_draw, p_away], dtype=float)
    if not np.all(np.isfinite(v)) or np.any(v < 0) or v.sum() <= 0:
        raise ValueError("invalid probabilities")
    ph, pd_, pa = v / v.sum()
    g = _soccer_grid()
    err = (g["pH"] - ph) ** 2 + (g["pD"] - pd_) ** 2 + (g["pA"] - pa) ** 2
    i, j = np.unravel_index(int(np.argmin(err)), err.shape)
    joint = g["joint"][i, j]
    joint = joint / joint.sum()
    outcome = int(np.argmax([ph, pd_, pa]))
    masked = np.where(g["masks"][outcome], joint, -1.0)
    h, a = np.unravel_index(int(np.argmax(masked)), masked.shape)
    return {"score": f"{int(h)} - {int(a)}",
            "lambda_home": float(_LAMBDAS[i]), "lambda_away": float(_LAMBDAS[j]),
            "over25": float(joint[(g["H"] + g["A"]) >= 3].sum()),
            "btts": float(joint[(g["H"] >= 1) & (g["A"] >= 1)].sum()),
            "fit_rmse": float(math.sqrt(err.min() / 3.0))}


def basketball_model(p_home, sport_key="basketball_nba"):
    """Margin ~ Normal(mu, sigma): mu = sigma * z(p_home). Deterministic (v1 used unseeded
    random totals, so the same match showed a different score on every refresh)."""
    total, sigma = BASKETBALL_PARAMS[sport_key]
    p = min(max(float(p_home), 0.01), 0.99)
    mu = sigma * NormalDist().inv_cdf(p)
    h, a = int(round((total + mu) / 2.0)), int(round((total - mu) / 2.0))
    if h == a:
        h, a = (h + 1, a) if mu >= 0 else (h, a + 1)
    spread = round(-mu * 2.0) / 2.0
    return {"score": f"{h} - {a}", "spread": "0.0" if spread == 0 else f"{spread:+.1f}", "margin": mu}


def tennis_model(p_home):
    """Best-of-3 assumption: solve set-win prob s from match-win prob, P(3 sets) = 2s(1-s)."""
    p = min(max(float(p_home), 0.001), 0.999)
    lo, hi = 0.0, 1.0
    for _ in range(60):
        s = (lo + hi) / 2.0
        if s * s * (3.0 - 2.0 * s) < p:
            lo = s
        else:
            hi = s
    return {"p_three_sets": 2.0 * s * (1.0 - s)}


def compute_dynamic_score(p_home, p_away, p_draw, sport_type="soccer"):
    if sport_type == "basketball":
        return basketball_model(p_home)["score"]
    if sport_type == "tennis":
        if p_home > 0.68: return "2 - 0"
        elif p_home >= 0.50: return "2 - 1"
        elif p_away > 0.68: return "0 - 2"
        else: return "1 - 2"
    return fit_soccer_model(p_home, p_draw, p_away)["score"]


# --------------------------------------------------------------------------- form data
def get_team_logo(team_name):
    encoded_name = urllib.parse.quote(team_name)
    return f"https://ui-avatars.com/api/?name={encoded_name}&background=ffffff&color=0f172a&rounded=true&bold=true&format=svg&border=1&border-color=e2e8f0"


def generate_recent_form(team_name, win_prob, sport_type="soccer"):
    """Deterministic SYNTHETIC form (not real results). Only used when real data is missing."""
    current_week = datetime.now().isocalendar()[1]
    seed_string = f"{team_name}_{current_week}"
    seed_hash = int(hashlib.md5(seed_string.encode('utf-8')).hexdigest(), 16) % (2**32)
    rng = np.random.RandomState(seed_hash)
    form = []
    for _ in range(5):
        rand = rng.random_sample()
        if rand < win_prob:
            form.append("W")
        else:
            if sport_type == "soccer" and rand < win_prob + ((1.0 - win_prob) * 0.4):
                form.append("D")
            else:
                form.append("L")
    return ",".join(form)


_ALIASES = {"man utd": "manchester united", "man united": "manchester united",
            "man city": "manchester city", "spurs": "tottenham hotspur",
            "tottenham": "tottenham hotspur", "wolves": "wolverhampton wanderers",
            "nottm forest": "nottingham forest", "la clippers": "los angeles clippers",
            "la lakers": "los angeles lakers"}
_STOP = {"fc", "afc", "cf", "sc", "ac", "as", "the", "and"}


def normalize_team(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s.replace("&", " and "))
    s = _ALIASES.get(" ".join(s.split()), " ".join(s.split()))
    return " ".join(t for t in s.split() if t not in _STOP)


def match_team(team_name, mapping):
    """Exact -> unique token-subset -> strict fuzzy (>=0.85 AND clearly ahead of runner-up).
    v1 accepted ANY fuzzy ratio > 0.5, so e.g. 'Manchester City' could get Manchester United's
    form. Ambiguity now returns None instead of a guess."""
    target = normalize_team(team_name)
    if not target or not mapping:
        return None
    if target in mapping:
        return target
    t = set(target.split())
    subs = [k for k in mapping if set(k.split()) <= t or t <= set(k.split())]
    if subs:
        return subs[0] if len({id(mapping[k]) for k in subs}) == 1 else None
    scored = sorted(((difflib.SequenceMatcher(None, target, k).ratio(), k) for k in mapping),
                    reverse=True)
    if scored[0][0] >= 0.85 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.05):
        return scored[0][1]
    return None


def _parse_espn_standings(data):
    out = {}
    if not isinstance(data, dict):
        return out
    children = data.get('children') or []
    groups = children if children else [data]
    for group in groups:
        entries = ((group or {}).get('standings') or {}).get('entries') or []
        for entry in entries:
            team = entry.get('team') or {}
            form_letters, source = [], None
            stats = entry.get('stats') or []
            for stat in stats:  # an explicit 'form' stat always wins
                if stat.get('name') == 'form':
                    form_letters = [c for c in str(stat.get('displayValue', '')).upper() if c in 'WDL']
                    source = "espn_form"
                    break
            if not form_letters:  # otherwise a streak ("W3") is the best proxy -- labelled as such
                for stat in stats:
                    if stat.get('name') == 'streak':
                        m = re.match(r"\s*([WL])\s*(\d*)", str(stat.get('displayValue', '')).upper())
                        if m:
                            form_letters = [m.group(1)] * min(int(m.group(2) or 1), 5)
                            source = "espn_streak"
            if form_letters:
                rec = {"form": ",".join(form_letters[:5]), "source": source}
                for nm in {team.get('name'), team.get('displayName')}:
                    if nm:
                        out[normalize_team(nm)] = rec  # same dict object for both name variants
    return out


def scrape_real_form_with_source(sport_key):
    """ESPN standings -> {normalized_team: {"form", "source"}}. {} on any failure (logged)."""
    slug = ESPN_SLUGS.get(sport_key)
    if not slug:
        return {}
    url = f"https://site.api.espn.com/apis/v2/sports/{slug}/standings"
    try:
        data, _ = http_get_json(url, ttl=CFG.form_ttl, headers={"User-Agent": "Mozilla/5.0"})
    except DataSourceError as exc:
        LOG.warning("ESPN form unavailable for %s: %s", sport_key, exc)
        return {}
    return _parse_espn_standings(data)


def scrape_real_form(sport_key):
    """v1-compatible: {team_lower: "W,D,L,..."}."""
    return {k: v["form"] for k, v in scrape_real_form_with_source(sport_key).items()}


def lookup_form(team_name, real_data, fallback_prob, sport_type):
    """-> (form_string, source) where source is espn_form | espn_streak | synthetic | unavailable."""
    if real_data:
        key = match_team(team_name, real_data)
        if key:
            rec = real_data[key]
            return rec["form"], rec["source"]
    if CFG.allow_synthetic_form:
        return generate_recent_form(team_name, fallback_prob, sport_type), "synthetic"
    return "", "unavailable"


def get_real_form(team_name, real_data_dict, fallback_prob, sport_type):
    """v1-compatible wrapper (accepts {name: "W,D,L"} or the richer dict form)."""
    norm = {normalize_team(k): (v if isinstance(v, dict) else {"form": v, "source": "espn"})
            for k, v in (real_data_dict or {}).items()}
    return lookup_form(team_name, norm, fallback_prob, sport_type)[0]


# --------------------------------------------------------------------------- odds pipeline
_SPORT_RE = re.compile(r"^[a-z0-9_]{1,64}$")
_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{8,128}$")


def classify_sport(sport_key):
    """v1 treated every non-soccer, non-basketball sport (NFL, NHL, MMA...) as tennis."""
    if sport_key.startswith("soccer"): return "soccer"
    if sport_key in BASKETBALL_PARAMS: return "basketball"
    if sport_key.startswith("tennis"): return "tennis"
    return "generic"


def fetch_sports_menu(api_key):
    try:
        data, _ = http_get_json(f"{ODDS_API}/sports/", {"apiKey": api_key},
                                ttl=CFG.menu_ttl, secret=api_key)
    except DataSourceError as exc:
        LOG.error("Sports menu fetch failed: %s", exc)
        return []
    return data if isinstance(data, list) else []


def _valid_price(x):
    try:
        p = float(x)
    except (TypeError, ValueError):
        return None
    return p if math.isfinite(p) and 1.0 < p <= 1000.0 else None


def _parse_ts(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def collect_quotes(game, now, max_age_min):
    """-> (quotes, three_way, n_stale). quotes = {book_key: {"title", "prices": {slot: price}}}.
    Looks up the 'h2h' market by key (v1 assumed markets[0]); drops stale or incomplete books
    (v1 silently invented a 3.2 draw price / 2.0 away price when they were missing)."""
    home, away = game.get("home_team"), game.get("away_team")
    raw, stale = {}, 0
    for bk in game.get("bookmakers") or []:
        key = bk.get("key") or bk.get("title")
        market = next((m for m in (bk.get("markets") or []) if m.get("key") == "h2h"), None)
        if not key or not market:
            continue
        ts = _parse_ts(market.get("last_update") or bk.get("last_update"))
        if ts and (now - ts).total_seconds() > max_age_min * 60:
            stale += 1
            continue
        prices = {}
        for o in market.get("outcomes") or []:
            name, price = o.get("name"), _valid_price(o.get("price"))
            if price is None:
                continue
            if name == home: slot = "home"
            elif name == away: slot = "away"
            elif isinstance(name, str) and name.lower() == "draw": slot = "draw"
            else: continue
            prices.setdefault(slot, price)
        if "home" in prices and "away" in prices:
            raw[key] = {"title": bk.get("title") or key, "prices": prices}
    three_way = bool(raw) and sum("draw" in q["prices"] for q in raw.values()) * 2 >= len(raw)
    quotes = {}
    for k, q in raw.items():
        if three_way and "draw" not in q["prices"]:
            continue
        if not three_way:
            q["prices"].pop("draw", None)
        quotes[k] = q
    return quotes, three_way, stale


def _consensus(book_probs, weights, slots, exclude=None):
    keys = [k for k in book_probs if k != exclude]
    if not keys:
        return None
    tw = sum(weights[k] for k in keys)
    vec = {s: sum(weights[k] * book_probs[k][s] for k in keys) / tw for s in slots}
    tot = sum(vec.values())
    return {s: v / tot for s, v in vec.items()}


def analyze_game(game, sport, sport_type, form_data, now):
    quotes, three_way, n_stale = collect_quotes(game, now, CFG.max_quote_age_min)
    if not quotes:
        return None
    if sport_type == "soccer" and not three_way:
        LOG.warning("Skipping %s vs %s: soccer h2h without a draw price",
                    game.get("home_team"), game.get("away_team"))
        return None
    slots = ["home", "draw", "away"] if three_way else ["home", "away"]
    book_probs = {k: dict(zip(slots, devig([q["prices"][s] for s in slots]))) for k, q in quotes.items()}
    weights = {k: SHARP_WEIGHTS.get(k, 1.0) for k in quotes}
    consensus = _consensus(book_probs, weights, slots)
    n_books = len(quotes)

    outcomes = {}
    for s in slots:
        best_key = max(sorted(quotes), key=lambda k: quotes[k]["prices"][s])
        loo = _consensus(book_probs, weights, slots, exclude=best_key) if n_books >= CFG.min_books else None
        outcomes[s] = {
            "best_price": quotes[best_key]["prices"][s],
            "best_bookmaker": quotes[best_key]["title"],
            "consensus_prob": round(consensus[s], 4),
            # fair prob from every book EXCEPT the one quoting the best price
            "fair_prob": round(loo[s], 4) if loo else None,
            "book_dispersion": round(pstdev([bp[s] for bp in book_probs.values()]), 4) if n_books > 1 else 0.0,
        }
    overround_best = sum(1.0 / o["best_price"] for o in outcomes.values())

    p_home = round(consensus["home"], 3)
    p_draw = round(consensus["draw"], 3) if three_way else 0
    p_away = round(1.0 - p_home - p_draw, 3)

    note = "Score/market figures are model estimates derived from consensus probabilities, not bookmaker lines."
    if sport_type == "soccer":
        m = fit_soccer_model(p_home, p_draw, p_away)
        pred_score = m["score"]
        m1_label, m1_val = "O2.5", f"{round(m['over25'] * 100)}%"
        m2_label, m2_val = "BTTS", f"{round(m['btts'] * 100)}%"
    elif sport_type == "basketball":
        m = basketball_model(p_home, sport)
        pred_score = m["score"]
        m1_label, m1_val = "Spread", m["spread"]
        m2_label, m2_val = "Total", "N/A"
    elif sport_type == "tennis":
        pred_score = compute_dynamic_score(p_home, p_away, 0, "tennis")
        m1_label, m1_val = "Set Spread", "-1.5" if p_home > 0.65 else "+1.5"
        m2_label, m2_val = "P(3 sets)", f"{round(tennis_model(p_home)['p_three_sets'] * 100)}%"
        note += " Tennis figures assume best-of-3."
    else:
        pred_score = "N/A"
        m1_label, m1_val = "Win% Home", f"{round(p_home * 100)}%"
        m2_label, m2_val = "Win% Away", f"{round(p_away * 100)}%"

    commence = game.get("commence_time") or ""
    dt = _parse_ts(commence)
    if dt is None:
        return None
    soccer_ish = "soccer" if sport_type == "soccer" else "other"
    home_form, home_src = lookup_form(game["home_team"], form_data, p_home, soccer_ish)
    away_form, away_src = lookup_form(game["away_team"], form_data, p_away, soccer_ish)
    top_home = outcomes["home"]

    return {
        "match": f"{game['home_team']} vs {game['away_team']}",
        "home_team": game["home_team"], "away_team": game["away_team"],
        "home_logo": get_team_logo(game["home_team"]), "away_logo": get_team_logo(game["away_team"]),
        "home_form": home_form, "away_form": away_form,
        "home_form_source": home_src, "away_form_source": away_src,
        "bookmaker": top_home["best_bookmaker"],
        "commence_time": commence, "date_str": dt.astimezone(timezone.utc).strftime("%Y-%m-%d"),
        "odds_home": outcomes["home"]["best_price"],
        "odds_draw": outcomes["draw"]["best_price"] if three_way else 0,
        "odds_away": outcomes["away"]["best_price"],
        "prob_home": p_home, "prob_draw": p_draw, "prob_away": p_away,
        "pred_score": pred_score,
        "market_1_label": m1_label, "market_1_val": m1_val,
        "market_2_label": m2_label, "market_2_val": m2_val,
        "is_soccer": sport_type == "soccer",
        # --- new ---
        "sport_type": sport_type, "n_books": n_books, "n_stale_books_ignored": n_stale,
        "outcomes": outcomes, "overround_best": round(overround_best, 4),
        "arbitrage": overround_best < 1.0,
        "is_live": dt <= now,
        "model_note": note,
    }


def evaluate_row(agent, row):
    """Add edge / stake / verdict. Edge = fair_prob * best_price - 1, on the best of
    home/draw/away (v1 could only ever evaluate the home side)."""
    best, edges = None, {}
    for slot, o in row.get("outcomes", {}).items():
        fp = o.get("fair_prob")
        if fp is None:
            edges[slot] = None
            continue
        e = agent.calculate_edge(fp, o["best_price"])
        edges[slot] = round(e, 4)
        if best is None or e > best[1]:
            best = (slot, e)

    names = {"home": row["home_team"], "away": row["away_team"], "draw": "Draw"}
    status, stake, sel = "no_edge", 0.0, None
    if best is None:
        edge = 0.0
        status = "insufficient_data"
        rationale = (f"Only {row.get('n_books', 0)} usable bookmaker(s); at least {CFG.min_books} are "
                     f"needed for a trustworthy consensus. No bet suggested.")
    else:
        sel, edge = best
        o = row["outcomes"][sel]
        fair_price = 1.0 / o["fair_prob"]
        detail = (f"{names[sel]} @ {o['best_price']}x ({o['best_bookmaker']}) vs consensus fair price "
                  f"{fair_price:.2f}x from the other {row['n_books'] - 1} books "
                  f"(fair prob {o['fair_prob'] * 100:.1f}%).")
        if row.get("is_live"):
            status = "live"
            rationale = "Match already started: pre-match consensus is not valid for in-play prices. " + detail
        elif edge > CFG.max_plausible_edge:
            status = "verify"
            rationale = (f"Edge of {edge * 100:.1f}% is implausibly large - usually a stale or erroneous "
                         f"quote. Verify manually before betting; no stake assigned. " + detail)
        elif edge > CFG.min_edge:
            status = "value"
            stake = agent.calculate_kelly_stake(o["fair_prob"], o["best_price"])
            rationale = (f"Price beats market consensus: edge {edge * 100:.1f}%. " + detail +
                         f" Stake = {CFG.kelly_fraction:g}x Kelly, capped at {CFG.max_stake_pct * 100:g}% of bankroll.")
        else:
            rationale = "Odds reflect fair market value. No statistical edge detected. " + detail
    if row.get("arbitrage"):
        rationale += (f" Best prices across books sum to {row['overround_best']:.3f} (<1): a possible arbitrage - "
                      f"confirm the quotes are live and bettable.")

    is_val = status == "value"
    row.update({
        "edge": round(float(edge), 4), "edges": edges, "stake": round(float(stake), 2),
        "is_value_bet": is_val, "status": status, "rationale": rationale,
        "selection": sel, "selection_team": names.get(sel) if sel else None,
        "selection_odds": row["outcomes"][sel]["best_price"] if sel else None,
        "expected_profit": round(stake * edge, 2) if is_val else 0.0,
    })
    if sel:
        row["bookmaker"] = row["outcomes"][sel]["best_bookmaker"]
    return row


def _fetch_live_odds(api_key, sport="soccer_epl", now=None):
    if not _SPORT_RE.match(sport or ""):
        raise ValueError(f"invalid sport key: {sport!r}")
    now = now or datetime.now(timezone.utc)
    sport_type = classify_sport(sport)
    params = {"apiKey": api_key, "regions": ",".join(CFG.regions), "markets": "h2h", "oddsFormat": "decimal"}
    with ThreadPoolExecutor(max_workers=1) as pool:   # ESPN form fetch overlaps the odds call
        form_future = pool.submit(scrape_real_form_with_source, sport)
        try:
            data, meta = http_get_json(f"{ODDS_API}/sports/{sport}/odds/", params,
                                       ttl=CFG.odds_ttl, secret=api_key)
        finally:
            form_data = form_future.result()
    if not isinstance(data, list):
        raise DataSourceError("Unexpected odds payload (not a list)")
    rows, skipped = [], 0
    for game in data:
        if not isinstance(game, dict) or not game.get("home_team") or not game.get("away_team"):
            skipped += 1
            continue
        row = analyze_game(game, sport, sport_type, form_data, now)
        if row is None:
            skipped += 1
            continue
        row["data_source"] = meta["source"]
        row["data_age_seconds"] = round(meta["age"])
        rows.append(row)
    if skipped:
        LOG.info("%d of %d events skipped (no usable h2h data)", skipped, len(data))
    return rows


def fetch_live_odds(api_key, sport="soccer_epl"):
    """v1-compatible: list of market rows, [] on failure (now logged, with the key redacted)."""
    try:
        return _fetch_live_odds(api_key, sport)
    except (DataSourceError, ValueError) as exc:
        LOG.error("Odds fetch failed: %s", exc)
        return []


# --------------------------------------------------------------------------- CLI
def _finite(obj):
    """Make output strictly valid JSON: numpy -> python, NaN/inf -> null."""
    if isinstance(obj, dict): return {str(k): _finite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [_finite(v) for v in obj]
    if isinstance(obj, np.generic): obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj): return None
    return obj


def _emit(payload, error=None, code=0):
    if error:
        LOG.error("%s", error)
    sys.stdout.write(json.dumps(_finite(payload), allow_nan=False) + "\n")
    sys.stdout.flush()
    return code if CFG.strict else 0


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    logging.basicConfig(stream=sys.stderr, format="%(levelname)s %(name)s: %(message)s",
                        level=getattr(logging, os.environ.get("RISK_ENGINE_LOG", "WARNING").upper(), logging.WARNING))
    key_arg = argv[2] if len(argv) > 2 else None
    action = argv[3] if len(argv) > 3 else "odds"
    sport_key = argv[4] if len(argv) > 4 else "soccer_epl"
    from_argv = bool(key_arg) and key_arg.lower() not in ("-", "null", "none", "undefined")
    api_key = key_arg if from_argv else os.environ.get("ODDS_API_KEY")
    if from_argv:
        LOG.info("API key supplied on the command line is visible via `ps`; prefer ODDS_API_KEY.")

    if action not in ("menu", "odds", "value"):
        return _emit([], f"Unknown action {action!r} (use menu|odds|value)", 2)
    if not api_key:
        return _emit([], "No API key: pass it as argv[2] or set ODDS_API_KEY", 2)
    if not _KEY_RE.match(api_key):
        return _emit([], "API key has an unexpected format", 2)
    try:
        agent = BettingRiskEngine(bankroll=CFG.bankroll)
        if action == "menu":
            return _emit(fetch_sports_menu(api_key))
        rows = [evaluate_row(agent, r) for r in _fetch_live_odds(api_key, sport_key)]
        agent.apply_exposure_cap(rows)
        if action == "value":
            rows = sorted((r for r in rows if r["is_value_bet"]),
                          key=lambda r: (r["edge"], r["stake"]), reverse=True)
        return _emit(rows)
    except (DataSourceError, ValueError) as exc:
        return _emit([], _redact(f"{type(exc).__name__}: {exc}", api_key), 1)


if __name__ == "__main__":
    sys.exit(main())