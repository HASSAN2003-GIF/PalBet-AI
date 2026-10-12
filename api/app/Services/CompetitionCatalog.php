<?php

namespace App\Services;

use Illuminate\Support\Str;

/**
 * Turns The Odds API sport keys (e.g. "soccer_spain_la_liga") into display data:
 * the country/region the competition belongs to and a readable competition name.
 *
 * Known keys are mapped explicitly; anything else is derived from the key itself so a
 * newly scouted league still shows up with a sensible label instead of breaking the UI.
 */
class CompetitionCatalog
{
    /** @var array<string, array{0: string, 1: string}> key => [region, competition] */
    private const KNOWN = [
        'soccer_epl' => ['England', 'Premier League'],
        'soccer_efl_champ' => ['England', 'Championship'],
        'soccer_england_championship' => ['England', 'Championship'],
        'soccer_england_league1' => ['England', 'League One'],
        'soccer_england_league2' => ['England', 'League Two'],
        'soccer_fa_cup' => ['England', 'FA Cup'],
        'soccer_england_efl_cup' => ['England', 'EFL Cup'],
        'soccer_spain_la_liga' => ['Spain', 'La Liga'],
        'soccer_spain_segunda_division' => ['Spain', 'Segunda División'],
        'soccer_italy_serie_a' => ['Italy', 'Serie A'],
        'soccer_italy_serie_b' => ['Italy', 'Serie B'],
        'soccer_germany_bundesliga' => ['Germany', 'Bundesliga'],
        'soccer_germany_bundesliga2' => ['Germany', '2. Bundesliga'],
        'soccer_germany_liga3' => ['Germany', '3. Liga'],
        'soccer_france_ligue_one' => ['France', 'Ligue 1'],
        'soccer_france_ligue_two' => ['France', 'Ligue 2'],
        'soccer_netherlands_eredivisie' => ['Netherlands', 'Eredivisie'],
        'soccer_portugal_primeira_liga' => ['Portugal', 'Primeira Liga'],
        'soccer_belgium_first_div' => ['Belgium', 'First Division A'],
        'soccer_turkey_super_league' => ['Turkey', 'Süper Lig'],
        'soccer_spl' => ['Scotland', 'Premiership'],
        'soccer_greece_super_league' => ['Greece', 'Super League'],
        'soccer_austria_bundesliga' => ['Austria', 'Bundesliga'],
        'soccer_switzerland_superleague' => ['Switzerland', 'Super League'],
        'soccer_denmark_superliga' => ['Denmark', 'Superliga'],
        'soccer_norway_eliteserien' => ['Norway', 'Eliteserien'],
        'soccer_sweden_allsvenskan' => ['Sweden', 'Allsvenskan'],
        'soccer_poland_ekstraklasa' => ['Poland', 'Ekstraklasa'],
        'soccer_usa_mls' => ['USA', 'MLS'],
        'soccer_mexico_ligamx' => ['Mexico', 'Liga MX'],
        'soccer_brazil_campeonato' => ['Brazil', 'Série A'],
        'soccer_brazil_serie_b' => ['Brazil', 'Série B'],
        'soccer_argentina_primera_division' => ['Argentina', 'Primera División'],
        'soccer_chile_campeonato' => ['Chile', 'Primera División'],
        'soccer_japan_j_league' => ['Japan', 'J1 League'],
        'soccer_korea_kleague1' => ['South Korea', 'K League 1'],
        'soccer_china_superleague' => ['China', 'Super League'],
        'soccer_australia_aleague' => ['Australia', 'A-League'],
        'soccer_saudi_arabia_pro_league' => ['Saudi Arabia', 'Pro League'],
        'soccer_uefa_champs_league' => ['Europe', 'Champions League'],
        'soccer_uefa_europa_league' => ['Europe', 'Europa League'],
        'soccer_uefa_europa_conference_league' => ['Europe', 'Conference League'],
        'soccer_uefa_nations_league' => ['Europe', 'Nations League'],
        'soccer_conmebol_copa_libertadores' => ['South America', 'Copa Libertadores'],
        'soccer_conmebol_copa_sudamericana' => ['South America', 'Copa Sudamericana'],
        'soccer_fifa_world_cup_qualifiers_europe' => ['World', 'WC Qualifiers (Europe)'],
        'soccer_africa_cup_of_nations' => ['Africa', 'Africa Cup of Nations'],
        'basketball_nba' => ['USA', 'NBA'],
        'basketball_euroleague' => ['Europe', 'EuroLeague'],
    ];

    /** Regions that can appear at the start of an unknown key (after the sport prefix). */
    private const REGIONS = [
        'south_korea' => 'South Korea', 'saudi_arabia' => 'Saudi Arabia', 'usa' => 'USA',
        'england' => 'England', 'spain' => 'Spain', 'italy' => 'Italy', 'germany' => 'Germany',
        'france' => 'France', 'netherlands' => 'Netherlands', 'portugal' => 'Portugal',
        'belgium' => 'Belgium', 'turkey' => 'Turkey', 'greece' => 'Greece', 'austria' => 'Austria',
        'switzerland' => 'Switzerland', 'denmark' => 'Denmark', 'norway' => 'Norway',
        'sweden' => 'Sweden', 'finland' => 'Finland', 'poland' => 'Poland', 'ireland' => 'Ireland',
        'scotland' => 'Scotland', 'mexico' => 'Mexico', 'brazil' => 'Brazil',
        'argentina' => 'Argentina', 'chile' => 'Chile', 'japan' => 'Japan', 'korea' => 'South Korea',
        'china' => 'China', 'australia' => 'Australia', 'uefa' => 'Europe',
        'conmebol' => 'South America', 'fifa' => 'World', 'africa' => 'Africa',
    ];

    /**
     * @return array{key: string, sport: string, region: string, name: string}
     */
    public function describe(string $sportKey): array
    {
        $key = strtolower(trim($sportKey));
        $sport = $this->sportName($key);

        if (isset(self::KNOWN[$key])) {
            [$region, $name] = self::KNOWN[$key];

            return ['key' => $key, 'sport' => $sport, 'region' => $region, 'name' => $name];
        }

        // Unknown key: strip the sport prefix, then peel a known region off the front.
        $rest = str_contains($key, '_') ? Str::after($key, '_') : '';
        $region = 'International';
        foreach (self::REGIONS as $slug => $label) {
            if ($rest === $slug || str_starts_with($rest, $slug.'_')) {
                $region = $label;
                $rest = ltrim(substr($rest, strlen($slug)), '_');
                break;
            }
        }

        $name = $rest === '' ? $sport : Str::title(str_replace('_', ' ', $rest));

        return ['key' => $key, 'sport' => $sport, 'region' => $region, 'name' => $name];
    }

    private function sportName(string $key): string
    {
        $prefix = Str::before($key, '_');

        return match ($prefix) {
            'soccer' => 'Football',
            'basketball' => 'Basketball',
            'tennis' => 'Tennis',
            'icehockey' => 'Ice Hockey',
            'americanfootball' => 'American Football',
            'baseball' => 'Baseball',
            default => Str::title($prefix),
        };
    }
}
