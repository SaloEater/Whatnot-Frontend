// Label for custom (non-team) spots: first letter of the name plus the
// trailing number, e.g. "Chaser 1" -> "C1", "Mystery Box 3" -> "M3".
export function getSpotAbbreviation(name: string): string {
    const trimmed = name.trim()
    if (trimmed === '') {
        return ''
    }
    const letter = trimmed[0].toUpperCase()
    const numberMatch = trimmed.match(/(\d+)\s*$/)
    return letter + (numberMatch ? numberMatch[1] : '')
}
