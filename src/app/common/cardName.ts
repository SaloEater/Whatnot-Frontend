/**
 * Card-name rendering shared by the photo board controls and the series grid,
 * so both size names by the same rule.
 */

/** Split the name into 2 lines at the word boundary that keeps them most balanced. */
export function splitName(name: string): string[] {
    const words = name.split(' ').filter(Boolean)
    if (words.length < 2) return [name]
    let best = 1
    let bestLen = Infinity
    for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ').length
        const b = words.slice(i).join(' ').length
        const longest = Math.max(a, b)
        if (longest < bestLen) { bestLen = longest; best = i }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

/**
 * Largest font where the longest line still fits inside `innerWidth`, capped at
 * `maxSize`. 0.55 approximates average glyph width. Unit-agnostic — callers pass
 * px (fixed-size cards) or container-percent (fluid cards) and read the result
 * back in the same unit.
 */
export function nameFontSize(lines: string[], innerWidth: number, maxSize: number): number {
    const longest = Math.max(...lines.map((l) => l.length))
    return Math.min(maxSize, innerWidth / (0.55 * longest))
}
