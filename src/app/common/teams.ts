export const Teams = [
    "Arizona Cardinals",
    "Atlanta Falcons",
    "Baltimore Ravens",
    "Buffalo Bills",
    "Carolina Panthers",
    "Chicago Bears",
    "Cincinnati Bengals",
    "Cleveland Browns",
    "Dallas Cowboys",
    "Denver Broncos",
    "Detroit Lions",
    "Green Bay Packers",
    "Houston Texans",
    "Indianapolis Colts",
    "Jacksonville Jaguars",
    "Kansas City Chiefs",
    "Las Vegas Raiders",
    "Los Angeles Chargers",
    "Los Angeles Rams",
    "Miami Dolphins",
    "Minnesota Vikings",
    "New England Patriots",
    "New Orleans Saints",
    "New York Giants",
    "New York Jets",
    "Philadelphia Eagles",
    "Pittsburgh Steelers",
    "San Francisco 49ers",
    "Seattle Seahawks",
    "Tampa Bay Buccaneers",
    "Tennessee Titans",
    "Washington Commanders"
]

export const HighBidOptions = [
    "None",
    "_Box Aphrodite",
    ...Teams
]

export function IsNone(team: string): string {
    return team == "" ? "None" : team
}

export function IsTeam(team: string): boolean {
    return Teams.indexOf(team) != -1
}
/**
 * Team logo art, matching /obs/composite's BoardTile: the Miscellaneous mark
 * stands in for the catch-all bucket, every real team has its own file.
 */
export function TeamIconSrc(team: string): string {
    return team === "Miscellaneous" ? "/images/Miscellaneous.webp" : `/images/teams/${team}.webp`
}
