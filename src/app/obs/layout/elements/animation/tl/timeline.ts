// The local timeline engine for `animation:stashOrPassWrapTl` (stash-or-pass-timeline-plan.md §2).
// Pure — no React, no DOM. Deliberately NOT shared with other elements: this is local to this
// animation by decision, so it can stay exactly as expressive as this one choreography needs.
//
// WHY THIS EXISTS. The original StashOrPassWrap models the entrance as ONE exclusive `beat`
// state, so no action can span two stages. Warm-ups ("start part of stage N during the tail of
// stage N-1") are unrepresentable, and the code worked around it twice — a fabricated `fan` beat,
// and a stagger faked with four different transition DURATIONS because one class flip has to
// start all four at the same instant. Here, stages are LABELS ON A CLOCK and every action is
// positioned relative to a label with a signed offset, so overlap is the normal case and a
// stagger is what it actually is: a delay.

/** One stage of the choreography. Stages are contiguous and ordered; `dur` is in real ms. */
export type Stage = { id: string; dur: number }

/**
 * Where a track sits on the clock.
 *   'split'          -> the instant the `split` stage begins
 *   'hold:end'       -> the instant `hold` ends (identical to the start of the next stage, but
 *                       says what you mean when you are thinking about the earlier stage)
 *   ['split', -60]   -> 60ms BEFORE the split label — i.e. a warm-up reaching back into `hold`
 *   ['travel', 140]  -> 140ms after travel begins
 *
 * The offset stays glued to its label, so it survives every retiming of the stages before it.
 * Nothing in a choreography is ever written as an absolute time.
 */
export type Anchor = string | [string, number]

/** The animatable parts of this element. `copy` and `band` have four instances each. */
export type ElId = 'wash' | 'ring' | 'fill' | 'blowout' | 'word' | 'copy' | 'band'

export type Track = {
    el: ElId
    /** 0..3 for `copy`/`band`; omitted (0) for the singletons. */
    index?: number
    at: Anchor
    /**
     * A fixed length in ms, or `{ until }` — "run from my start to that anchor". The second form
     * is retiming-proof: change the stages in between and the track stretches instead of leaving
     * a gap.
     */
    dur: number | { until: Anchor }
    keys: Keyframe[]
    easing?: string
    /** Shown in the dev tuner's track list; also names the track in build-time warnings. */
    label?: string
}

export type ResolvedTrack = { track: Track; start: number; duration: number }

export type BuiltTimeline = {
    /** Stage id -> start ms, plus `<id>:end` for every stage and `end` for the whole timeline. */
    labels: Record<string, number>
    /** Stage boundaries in order, for the tuner's ruler. */
    ruler: Array<{ id: string; start: number; dur: number }>
    total: number
    /** Sorted by `start` ascending — see the note on composite order below. */
    resolved: ResolvedTrack[]
}

function anchorName(a: Anchor): string {
    return typeof a === 'string' ? a : a[0]
}

/**
 * Resolve stages into a label table. Every stage contributes two labels (`id` and `id:end`), and
 * the whole timeline contributes `end`. Because stages are contiguous, `x:end` and the next
 * stage's start are the same number — both spellings exist so a track can be written from
 * whichever side you are thinking about.
 */
export function buildLabels(stages: Stage[]): { labels: Record<string, number>; total: number; ruler: BuiltTimeline['ruler'] } {
    const labels: Record<string, number> = {}
    const ruler: BuiltTimeline['ruler'] = []
    let t = 0
    for (const s of stages) {
        if (!(s.dur >= 0)) throw new Error(`timeline: stage "${s.id}" has a non-positive duration (${s.dur})`)
        labels[s.id] = t
        labels[`${s.id}:end`] = t + s.dur
        ruler.push({ id: s.id, start: t, dur: s.dur })
        t += s.dur
    }
    labels.end = t
    return { labels, total: t, ruler }
}

/**
 * Stages + tracks -> absolute times. Throws on an unknown label rather than silently placing a
 * track at 0: a typo'd anchor must fail at module/build time, not produce an animation that
 * looks subtly wrong at cue time.
 */
export function buildTimeline(stages: Stage[], tracks: Track[]): BuiltTimeline {
    const { labels, total, ruler } = buildLabels(stages)

    function resolve(a: Anchor, who: string): number {
        const name = anchorName(a)
        const base = labels[name]
        if (base === undefined) {
            throw new Error(
                `timeline: ${who} anchors to unknown label "${name}". Known: ${Object.keys(labels).join(', ')}`
            )
        }
        return typeof a === 'string' ? base : base + a[1]
    }

    const resolved: ResolvedTrack[] = tracks.map((track, i) => {
        const who = track.label ? `track "${track.label}"` : `track #${i} (${track.el})`
        let start = resolve(track.at, who)
        if (start < 0) {
            // A warm-up that reaches back further than the timeline itself. Clamping keeps the
            // play watchable while you tune rather than throwing mid-session.
            console.warn(`timeline: ${who} starts at ${start}ms; clamped to 0`)
            start = 0
        }
        const duration =
            typeof track.dur === 'number' ? track.dur : resolve(track.dur.until, who) - start
        if (!(duration > 0)) {
            throw new Error(`timeline: ${who} resolves to a duration of ${duration}ms`)
        }
        return { track, start, duration }
    })

    // Sorted by start, and useTimeline() attaches them to the DOM in this order, which makes
    // composite order chronological. That is what lets several tracks drive the SAME property on
    // the same element as a chain of segments: with `fill: 'forwards'`, a track does not apply
    // before its own start, and once it has run it wins over every earlier one. Authoring order
    // in the choreography therefore does not matter — clock order does.
    resolved.sort((a, b) => a.start - b.start)

    return { labels, ruler, total, resolved }
}
