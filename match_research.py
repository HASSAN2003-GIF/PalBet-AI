"""Real-world match dossier for the PAL-PREDICT analyst, from ESPN's public site API.

No API key is needed. Everything here is best effort: any failure returns None and the
analyst carries on with the model data, saying plainly what it could not check.

    research(match) -> {"event_id", "url", "text", "sources"} | None

`text` is a plain-text block for the prompt; `sources` is a list of {"title", "url"}
the website shows under the answer so people can check the facts themselves.
"""
import datetime as dt
import difflib

from risk_engine import DataSourceError, http_get_json, normalize_team

BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
TTL = 900  # seconds; team news and line-ups move, so keep the cache short

# The Odds API sport key -> ESPN league slug.
ESPN_LEAGUES = {
    "soccer_epl": "eng.1",
    "soccer_efl_champ": "eng.2",
    "soccer_england_championship": "eng.2",
    "soccer_england_league1": "eng.3",
    "soccer_england_league2": "eng.4",
    "soccer_fa_cup": "eng.fa",
    "soccer_england_efl_cup": "eng.league_cup",
    "soccer_spain_la_liga": "esp.1",
    "soccer_spain_segunda_division": "esp.2",
    "soccer_italy_serie_a": "ita.1",
    "soccer_italy_serie_b": "ita.2",
    "soccer_germany_bundesliga": "ger.1",
    "soccer_germany_bundesliga2": "ger.2",
    "soccer_germany_liga3": "ger.3",
    "soccer_france_ligue_one": "fra.1",
    "soccer_france_ligue_two": "fra.2",
    "soccer_netherlands_eredivisie": "ned.1",
    "soccer_portugal_primeira_liga": "por.1",
    "soccer_belgium_first_div": "bel.1",
    "soccer_turkey_super_league": "tur.1",
    "soccer_spl": "sco.1",
    "soccer_greece_super_league": "gre.1",
    "soccer_austria_bundesliga": "aut.1",
    "soccer_switzerland_superleague": "sui.1",
    "soccer_denmark_superliga": "den.1",
    "soccer_norway_eliteserien": "nor.1",
    "soccer_sweden_allsvenskan": "swe.1",
    "soccer_poland_ekstraklasa": "pol.1",
    "soccer_usa_mls": "usa.1",
    "soccer_mexico_ligamx": "mex.1",
    "soccer_brazil_campeonato": "bra.1",
    "soccer_brazil_serie_b": "bra.2",
    "soccer_argentina_primera_division": "arg.1",
    "soccer_chile_campeonato": "chi.1",
    "soccer_japan_j_league": "jpn.1",
    "soccer_korea_kleague1": "kor.1",
    "soccer_china_superleague": "chn.1",
    "soccer_australia_aleague": "aus.1",
    "soccer_saudi_arabia_pro_league": "ksa.1",
    "soccer_uefa_champs_league": "uefa.champions",
    "soccer_uefa_europa_league": "uefa.europa",
    "soccer_uefa_europa_conference_league": "uefa.europa.conf",
    "soccer_uefa_nations_league": "uefa.nations",
    "soccer_conmebol_copa_libertadores": "conmebol.libertadores",
    "soccer_conmebol_copa_sudamericana": "conmebol.sudamericana",
    "soccer_fifa_world_cup_qualifiers_europe": "fifa.worldq.uefa",
    "soccer_africa_cup_of_nations": "caf.nations",
}


# --------------------------------------------------------------------------- helpers
def _get(league, endpoint, params=None):
    data, _meta = http_get_json(f"{BASE}/{league}/{endpoint}", params=params or {}, ttl=TTL)
    return data if isinstance(data, dict) else {}


def _team_names(team):
    return [team.get(k) for k in ("displayName", "shortDisplayName", "name", "location") if team.get(k)]


def same_team(name, candidates):
    """True when an odds-feed team name and one of ESPN's names are the same club."""
    a = normalize_team(name)
    if not a:
        return False
    ta = set(a.split())
    for cand in candidates:
        b = normalize_team(cand)
        if not b:
            continue
        tb = set(b.split())
        if a == b or ta <= tb or tb <= ta:
            return True
        if difflib.SequenceMatcher(None, a, b).ratio() >= 0.82:
            return True
    return False


def _parse_time(value):
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _day(value):
    when = _parse_time(value)
    return when.strftime("%d %b %Y") if when else "date unknown"


def _sides(competition):
    out = {}
    for comp in competition.get("competitors") or []:
        out[comp.get("homeAway")] = comp
    return out


# --------------------------------------------------------------------------- event lookup
def find_event(league, home, away, kickoff):
    """ESPN event id for this fixture, or None. ESPN files games under US dates, so the
    kick-off day and the days either side are checked; both teams must match."""
    start = _parse_time(kickoff) or dt.datetime.now(dt.timezone.utc)
    for offset in (0, -1, 1):
        day = (start + dt.timedelta(days=offset)).strftime("%Y%m%d")
        board = _get(league, "scoreboard", {"dates": day})
        for event in board.get("events") or []:
            sides = _sides((event.get("competitions") or [{}])[0])
            h, a = sides.get("home", {}).get("team", {}), sides.get("away", {}).get("team", {})
            if same_team(home, _team_names(h)) and same_team(away, _team_names(a)):
                return str(event.get("id"))
    return None


# --------------------------------------------------------------------------- summary parts
def table_lines(summary, teams):
    """League position, record and points for both clubs from the summary's standings."""
    lines = []
    groups = (summary.get("standings") or {}).get("groups") or []
    for group in groups:
        entries = ((group.get("standings") or {}).get("entries")) or []
        size = len(entries)
        for entry in entries:
            for team_id, name in teams.items():
                if str(entry.get("id")) != team_id:
                    continue
                stats = {s.get("name"): s.get("displayValue") for s in entry.get("stats") or []}
                lines.append(
                    f"{name}: {stats.get('rank', '?')} of {size}, played {stats.get('gamesPlayed', '?')}, "
                    f"won {stats.get('wins', '?')} drawn {stats.get('ties', '?')} lost {stats.get('losses', '?')}, "
                    f"goal difference {stats.get('pointDifferential', '?')}, {stats.get('points', '?')} points"
                )
    return lines


def recent_results(summary, teams):
    """Last results per club, newest first, written from that club's point of view."""
    out = {}
    for block in summary.get("lastFiveGames") or []:
        team_id = str((block.get("team") or {}).get("id"))
        if team_id not in teams:
            continue
        games = []
        for g in block.get("events") or []:
            is_home = str(g.get("homeTeamId")) == team_id
            mine, theirs = (g.get("homeTeamScore"), g.get("awayTeamScore"))
            if not is_home:
                mine, theirs = theirs, mine
            opponent = (g.get("opponent") or {}).get("displayName", "unknown")
            games.append((g.get("gameDate") or "", f"{_day(g.get('gameDate'))}: {g.get('gameResult', '?')} "
                          f"{mine}-{theirs} {'v' if is_home else 'at'} {opponent}"
                          f" ({g.get('competitionName') or 'competition unknown'})"))
        games.sort(key=lambda x: x[0], reverse=True)
        out[teams[team_id]] = [text for _, text in games]
    return out


def head_to_head(summary, limit=5):
    lines = []
    for series in summary.get("seasonseries") or []:
        if series.get("type") not in (None, "head-to-head"):
            continue
        events = sorted(series.get("events") or [], key=lambda e: e.get("date") or "", reverse=True)
        for e in events[:limit]:
            sides = _sides(e)
            h, a = sides.get("home", {}), sides.get("away", {})
            if not h or not a or (e.get("statusType") or {}).get("completed") is False:
                continue
            lines.append(f"{_day(e.get('date'))}: {(h.get('team') or {}).get('displayName')} {h.get('score', '?')}-"
                         f"{a.get('score', '?')} {(a.get('team') or {}).get('displayName')}")
        if series.get("summary"):
            lines.append(f"ESPN summary: {series['summary']} (over the meetings ESPN holds; old games say little about today)")
        break
    return lines


def lineups(summary):
    """Confirmed starting line-ups, only once ESPN has published them."""
    out = {}
    for side in summary.get("rosters") or []:
        players = side.get("roster") or []
        starters = [p for p in players if p.get("starter")]
        if not starters:
            continue
        name = (side.get("team") or {}).get("displayName", side.get("homeAway"))
        names = [f"{(p.get('athlete') or {}).get('displayName', '?')}"
                 f" ({(p.get('position') or {}).get('abbreviation', '')})".replace(" ()", "") for p in starters]
        formation = f" in a {side['formation']}" if side.get("formation") else ""
        out[name] = f"{', '.join(names)}{formation}"
    return out


def related_news(summary, league, teams, limit=4):
    """ESPN stories that mention either club: match previews, injury news, manager quotes."""
    articles = list((summary.get("news") or {}).get("articles") or [])
    for team_id in teams:
        try:
            articles += (_get(league, "news", {"team": team_id, "limit": 8}).get("articles") or [])
        except DataSourceError:
            pass
    names = [n.lower() for n in teams.values()]

    def mentions(art):
        text = f"{art.get('headline') or ''} {art.get('description') or ''}".lower()
        return any(n in text for n in names)

    # Stories naming a club in full come first; ones only tagged with it (round-ups) after.
    ranked = sorted(articles, key=lambda a: (mentions(a), a.get("published") or ""), reverse=True)
    seen, out = set(), []
    for art in ranked:
        headline = (art.get("headline") or "").strip()
        if not headline or headline in seen:
            continue
        cat_ids = {str(c.get("teamId")) for c in art.get("categories") or [] if c.get("teamId")}
        if not (cat_ids & set(teams)) and not mentions(art):
            continue
        seen.add(headline)
        out.append({
            "headline": headline,
            "description": (art.get("description") or "").strip()[:280],
            "published": art.get("published"),
            "url": ((art.get("links") or {}).get("web") or {}).get("href"),
        })
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------- dossier
def _fresh(article, now, days=21):
    when = _parse_time(article.get("published"))
    return when is None or (now - when) <= dt.timedelta(days=days)


def research(match, now=None):
    """Build the ESPN dossier for one match payload (as sent by Laravel). None if unavailable."""
    now = now or dt.datetime.now(dt.timezone.utc)
    league = ESPN_LEAGUES.get(str(match.get("sport_key") or "").lower())
    home = (match.get("home") or {}).get("name") if isinstance(match.get("home"), dict) else match.get("home")
    away = (match.get("away") or {}).get("name") if isinstance(match.get("away"), dict) else match.get("away")
    if not league or not home or not away:
        return None
    try:
        event_id = find_event(league, home, away, match.get("kickoff"))
        if not event_id:
            return None
        summary = _get(league, "summary", {"event": event_id})
    except DataSourceError:
        return None

    sides = _sides(((summary.get("header") or {}).get("competitions") or [{}])[0])
    teams = {}
    for key in ("home", "away"):
        team = (sides.get(key) or {}).get("team") or {}
        if team.get("id"):
            teams[str(team["id"])] = team.get("displayName") or (home if key == "home" else away)
    status = ((((summary.get("header") or {}).get("competitions") or [{}])[0].get("status") or {})
              .get("type") or {}).get("description")

    url = f"https://www.espn.com/soccer/match/_/gameId/{event_id}"
    lines = [f"--- REAL-WORLD DATA (ESPN, fetched {now.strftime('%d %b %Y %H:%M')} UTC) ---"]
    if status:
        lines.append(f"ESPN match status: {status}")
    venue = ((summary.get("gameInfo") or {}).get("venue") or {}).get("fullName")
    if venue:
        lines.append(f"Venue: {venue}")

    table = table_lines(summary, teams)
    lines.append("League table: " + ("; ".join(table) if table else "not available for this competition."))

    recent = recent_results(summary, teams)
    for name in teams.values():
        games = recent.get(name)
        lines.append(f"{name} last results (newest first): " + (" | ".join(games) if games else "not available."))

    h2h = head_to_head(summary)
    lines.append("Head-to-head: " + (" | ".join(h2h) if h2h else "no previous meetings on record at ESPN."))

    xi = lineups(summary)
    if xi:
        for name, text in xi.items():
            lines.append(f"CONFIRMED starting line-up, {name}: {text}")
    else:
        lines.append("Starting line-ups: not published yet.")

    try:
        news = [n for n in related_news(summary, league, teams) if _fresh(n, now)]
    except DataSourceError:
        news = []
    if news:
        for n in news:
            lines.append(f"News ({_day(n['published'])}): {n['headline']}. {n['description']}")
    else:
        lines.append("ESPN news: no recent stories about either club.")
    lines.append("ESPN does not publish injury lists for football; do not infer injuries from this block.")
    lines.append("-" * 46)

    sources = [{"title": "ESPN match page", "url": url}]
    sources += [{"title": n["headline"], "url": n["url"]} for n in news if n.get("url")]
    return {"event_id": event_id, "url": url, "text": "\n".join(lines), "sources": sources}
