'use client'

// Wireframe box editor popup (obs-layout-box-editor-plan.md E.2) — the visual companion to the
// Box section's X/Y/W/H inputs. Two callbacks, both built by ElementBlock from the same
// persistent/override rule (which lives there, not here):
//   - `onDraft(box)`  — mid-gesture: config + OBS follow immediately, NOTHING is written. Sent as
//     a fractional-seq payload on the durable channel (useControls.emitDraft), throttled below.
//   - `onCommit(box)` — gesture end, undo, redo: the one real write (`pushConfig`) per action.
// So a drag is live on the browser source the whole way and costs the backend a single push on
// release, instead of one per move.
//
// Same popup shell as LayoutImageGallery: fixed backdrop + panel, not the Bootstrap JS modal,
// closed by ×, Escape, or a backdrop click (clicks inside the panel stopped from bubbling).

import {useEffect, useMemo, useRef, useState} from 'react'
import type {Box, LayoutConfig, Phase} from '@/app/obs/layout/schema'
import {CANVAS} from '@/app/obs/layout/schema'
import {elementsForPhase} from '@/app/obs/layout/config'
import {REGISTRY, registryIdOf} from '@/app/obs/layout/registry'

const THROTTLE_MS = 300
const MIN_SIZE = 20
const SNAP_PX = 8

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

// ---- snapping (obs-layout-box-editor-plan.md E.5) ----------------------------------------------
// Pure geometry, unit-tested outside React (see the node check referenced in the PR/report) —
// snapBox knows nothing about drafts, commits, history or the gesture refs above. computeNext()
// below is the only caller: it builds the raw box exactly as before, then (unless bypassed) runs
// it through here before handing the result to move()/endGesture().

type Axis = 'x' | 'y'
type Anchor = 'left' | 'centreX' | 'right' | 'top' | 'centreY' | 'bottom'
// `kind` is only for the "Show snap lines" overlay (edge = dotted, centre = dashed) — snapBox
// itself never looks at it, so tagging it here costs the algorithm nothing but lets the overlay
// read the exact same SnapLine[] the algorithm does (one source of truth, per the plan).
export type SnapLine = {pos: number; source: 'page' | string /* element key */; kind: 'edge' | 'centre'}
export type SnapTargets = {x: SnapLine[]; y: SnapLine[]}
export type SnapGuide = {axis: Axis; pos: number}
export type SnapResult = {box: Box; guides: SnapGuide[]}

// Move offers all three anchors per axis (the whole box shifts, so any of the three landing on a
// target moves the same amount). Resize offers only the edge(s) the handle actually drags — never
// a centre anchor, since snapping a centre while the opposite edge is pinned would require that
// *other* edge to move, which is not what a resize handle means (plan's "What snaps to what").
const MOVE_ANCHORS: {x: Anchor[]; y: Anchor[]} = {x: ['left', 'centreX', 'right'], y: ['top', 'centreY', 'bottom']}

function anchorsForHandle(handle: HandleId): {x: Anchor[]; y: Anchor[]} {
    const x: Anchor[] = handle.includes('w') ? ['left'] : handle.includes('e') ? ['right'] : []
    const y: Anchor[] = handle.includes('n') ? ['top'] : handle.includes('s') ? ['bottom'] : []
    return {x, y}
}

function anchorPos(box: Box, anchor: Anchor): number {
    switch (anchor) {
        case 'left': return box.x
        case 'right': return box.x + box.w
        case 'centreX': return box.x + box.w / 2
        case 'top': return box.y
        case 'bottom': return box.y + box.h
        case 'centreY': return box.y + box.h / 2
    }
}

type Candidate = {delta: number; anchor: Anchor; line: SnapLine; order: number}

/** Tie rules from the plan: smallest |delta| wins; equal distance prefers a page line over an
 *  element line (structural); equal-and-equal prefers whichever target comes first in `lines`
 *  (callers build that array in `others` order, so this doubles as "first element in others
 *  order"). `cur` is the incumbent, `cand` the challenger — true means cand replaces cur. */
function isBetter(cand: Candidate, cur: Candidate | null): boolean {
    if (!cur) return true
    const cd = Math.abs(cand.delta)
    const ud = Math.abs(cur.delta)
    if (cd !== ud) return cd < ud
    const candPage = cand.line.source === 'page'
    const curPage = cur.line.source === 'page'
    if (candPage !== curPage) return candPage
    return cand.order < cur.order
}

/** Best (anchor, target) pair within `threshold` for one axis, or null if nothing is close enough. */
function bestSnap(raw: Box, anchors: Anchor[], lines: SnapLine[], threshold: number): Candidate | null {
    let best: Candidate | null = null
    for (const anchor of anchors) {
        const aPos = anchorPos(raw, anchor)
        lines.forEach((line, order) => {
            const delta = line.pos - aPos
            if (Math.abs(delta) > threshold) return
            const cand: Candidate = {delta, anchor, line, order}
            if (isBetter(cand, best)) best = cand
        })
    }
    return best
}

/** Per axis, independently: find the best snap and apply it. Move anchors (contain a centre
 *  anchor) shift the whole box by `delta`. Resize anchors (a single edge, no centre) move only
 *  that edge and keep the opposite one pinned, which is what changes the size — and a result that
 *  would take that axis under MIN_SIZE is discarded entirely (clamp wins over snap), same as a
 *  resize that never got near a target. Rounded to whole canvas px at the end. */
export function snapBox(raw: Box, anchors: {x: Anchor[]; y: Anchor[]}, targets: SnapTargets, threshold: number): SnapResult {
    let box = {...raw}
    const guides: SnapGuide[] = []

    const xHit = bestSnap(raw, anchors.x, targets.x, threshold)
    if (xHit) {
        if (anchors.x.includes('centreX')) {
            box = {...box, x: raw.x + xHit.delta}
            guides.push({axis: 'x', pos: xHit.line.pos})
        } else if (xHit.anchor === 'left') {
            const w = raw.w - xHit.delta
            if (w >= MIN_SIZE) {
                box = {...box, x: raw.x + xHit.delta, w}
                guides.push({axis: 'x', pos: xHit.line.pos})
            }
        } else if (xHit.anchor === 'right') {
            const w = raw.w + xHit.delta
            if (w >= MIN_SIZE) {
                box = {...box, w}
                guides.push({axis: 'x', pos: xHit.line.pos})
            }
        }
    }

    const yHit = bestSnap(raw, anchors.y, targets.y, threshold)
    if (yHit) {
        if (anchors.y.includes('centreY')) {
            box = {...box, y: raw.y + yHit.delta}
            guides.push({axis: 'y', pos: yHit.line.pos})
        } else if (yHit.anchor === 'top') {
            const h = raw.h - yHit.delta
            if (h >= MIN_SIZE) {
                box = {...box, y: raw.y + yHit.delta, h}
                guides.push({axis: 'y', pos: yHit.line.pos})
            }
        } else if (yHit.anchor === 'bottom') {
            const h = raw.h + yHit.delta
            if (h >= MIN_SIZE) {
                box = {...box, h}
                guides.push({axis: 'y', pos: yHit.line.pos})
            }
        }
    }

    return {
        box: {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)},
        guides,
    }
}

/** Dedupe-by-position for the "Show snap lines" overlay — full boards, the frame and the page
 *  often share x=0/x=1080, and stacking several 1px lines at low opacity would both look like one
 *  darker line and misreport how many things are there. Keeps the first occurrence's kind. */
function dedupeLines(lines: SnapLine[]): SnapLine[] {
    const seen = new Map<number, SnapLine>()
    for (const line of lines) {
        if (!seen.has(line.pos)) seen.set(line.pos, line)
    }
    return Array.from(seen.values())
}

const HANDLES: {id: HandleId; top: number; left: number; cursor: string}[] = [
    {id: 'nw', top: 0, left: 0, cursor: 'nwse-resize'},
    {id: 'n', top: 0, left: 50, cursor: 'ns-resize'},
    {id: 'ne', top: 0, left: 100, cursor: 'nesw-resize'},
    {id: 'e', top: 50, left: 100, cursor: 'ew-resize'},
    {id: 'se', top: 100, left: 100, cursor: 'nwse-resize'},
    {id: 's', top: 100, left: 50, cursor: 'ns-resize'},
    {id: 'sw', top: 100, left: 0, cursor: 'nesw-resize'},
    {id: 'w', top: 50, left: 0, cursor: 'ew-resize'},
]

type DragState =
    | {mode: 'move'}
    | {mode: 'resize'; handle: HandleId}

type Props = {
    elementKey: string
    label: string
    config: LayoutConfig
    currentPhase: Phase
    box: Box
    channelId: number
    onCommit: (box: Box) => void
    onDraft: (box: Box) => void
    onClose: () => void
}

/** Corner/edge resize with a 20x20 canvas-px floor: a drag that would cross it pins the OPPOSITE
 *  edge instead of shrinking further, so the box never inverts or vanishes. */
function resizeBox(handle: HandleId, start: Box, dx: number, dy: number): Box {
    let {x, y, w, h} = start
    if (handle.includes('n')) {
        let newY = start.y + dy
        let newH = start.h - dy
        if (newH < MIN_SIZE) {
            newH = MIN_SIZE
            newY = start.y + start.h - MIN_SIZE
        }
        y = newY
        h = newH
    }
    if (handle.includes('s')) {
        h = Math.max(MIN_SIZE, start.h + dy)
    }
    if (handle.includes('w')) {
        let newX = start.x + dx
        let newW = start.w - dx
        if (newW < MIN_SIZE) {
            newW = MIN_SIZE
            newX = start.x + start.w - MIN_SIZE
        }
        x = newX
        w = newW
    }
    if (handle.includes('e')) {
        w = Math.max(MIN_SIZE, start.w + dx)
    }
    return {x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h)}
}

export default function BoxEditorModal({elementKey, label, config, currentPhase, box, channelId, onCommit, onDraft, onClose}: Props) {
    const panelRef = useRef<HTMLDivElement>(null)
    const bodyRef = useRef<HTMLDivElement>(null)

    const [scale, setScale] = useState(0.3)
    const [displayBox, setDisplayBox] = useState<Box>(box)
    // Active snap guide(s) for the current gesture — at most one per axis, cleared on
    // endGesture/Alt-bypass so a released drag or a bypassed one never leaves a stale line.
    const [guides, setGuides] = useState<SnapGuide[]>([])
    // "Show snap lines" is a view preference (not layout), remembered per channel the same way the
    // Columns slider is in ElementsPanel: default off, restored after mount because localStorage
    // doesn't exist during SSR and reading it in the initialiser would desync server/client markup.
    const snapLinesKey = `obs-controls-${channelId}-snap-lines`
    const [snapLinesOn, setSnapLinesOn] = useState(false)
    useEffect(() => {
        try {
            setSnapLinesOn(localStorage.getItem(snapLinesKey) === '1')
        } catch {
            // Storage unavailable — overlay stays off for this session.
        }
    }, [snapLinesKey])

    function toggleSnapLines() {
        setSnapLinesOn((prev) => {
            const next = !prev
            try {
                localStorage.setItem(snapLinesKey, next ? '1' : '0')
            } catch {
                // View preference only — never worth breaking the popup over.
            }
            return next
        })
    }
    // History lives in refs, mirrored to state only so the Undo/Redo buttons know when to disable.
    // Refs, not state updaters, because undo/redo must also commit (push to OBS) and swap the other
    // stack — side effects that must run exactly once, and React invokes state updaters twice in
    // dev (StrictMode, on by default in Next) to flush out exactly that kind of impurity. Keeping
    // the truth in refs also means the window keydown handler below (mounted once, `[]` deps) can
    // never see a stale stack.
    const undoRef = useRef<Box[]>([])
    const redoRef = useRef<Box[]>([])
    const [historyLen, setHistoryLen] = useState({undo: 0, redo: 0})

    // Refs mirror the state above but are updated SYNCHRONOUSLY (not on next render), because a
    // held arrow key or a fast pointer drag can fire several moves before React re-renders — each
    // of those needs the box the previous move just produced, not a stale render value.
    const liveBoxRef = useRef<Box>(box)
    const gestureActiveRef = useRef(false)
    const dragRef = useRef<{state: DragState; startBox: Box; startX: number; startY: number} | null>(null)
    const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Trailing-throttle bookkeeping for the ~300ms push cadence (obs-layout-box-editor-plan.md's
    // "throttle, not the inputs' debounce"): `lastRun` gates the leading edge, `timer`/`pending`
    // guarantee the last move during any 300ms window still lands.
    const throttleRef = useRef<{timer: ReturnType<typeof setTimeout> | null; lastRun: number; pending: Box | null}>({
        timer: null,
        lastRun: 0,
        pending: null,
    })

    // Fit-to-body scale, computed in JS (CSS alone can't give us the number pointer math needs) —
    // same reasoning as layout/[id]/Stage.tsx, just observing the modal body instead of the window.
    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const compute = () => {
            const w = el.clientWidth
            const h = el.clientHeight
            if (w > 0 && h > 0) setScale(Math.min(w / CANVAS.w, h / CANVAS.h))
        }
        compute()
        const ro = new ResizeObserver(compute)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Focus the panel on open so arrow/undo keys work immediately; ElementBlock restores focus to
    // the Edit button on close (its onClose callback).
    useEffect(() => {
        panelRef.current?.focus()
    }, [])

    // Keep the live box in sync with the prop when nothing is in flight — covers the initial box
    // and the (rare) case something outside the popup changes it while idle. Never overwrites
    // mid-gesture: that would fight the pointer/keyboard math with a stale prop.
    useEffect(() => {
        if (!gestureActiveRef.current) {
            liveBoxRef.current = box
            setDisplayBox(box)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [box])

    function setLiveBox(next: Box) {
        liveBoxRef.current = next
        setDisplayBox(next)
    }

    /** Flushes any pending throttled push and commits `next` immediately — used for a gesture's
     *  final position and for undo/redo (both are "land this value now", never rate-limited). */
    function commitNow(next: Box) {
        const t = throttleRef.current
        if (t.timer) {
            clearTimeout(t.timer)
            t.timer = null
        }
        t.pending = null
        t.lastRun = Date.now()
        onCommit(next)
    }

    /** One step of an in-progress gesture: renders `next` immediately (so the rectangle/footer
     *  track the pointer/keys at full rate) and DRAFTS it through `onDraft` at most every
     *  THROTTLE_MS — first call leading-edge immediate, later ones trailing, last one guaranteed.
     *  Drafts are bus-only; the throttle bounds bus traffic (each draft carries the whole config),
     *  not backend writes — there are none until `endGesture`. */
    function move(next: Box) {
        setLiveBox(next)
        const t = throttleRef.current
        const now = Date.now()
        if (t.timer === null && now - t.lastRun >= THROTTLE_MS) {
            t.lastRun = now
            onDraft(next)
            return
        }
        t.pending = next
        if (t.timer === null) {
            const wait = THROTTLE_MS - (now - t.lastRun)
            t.timer = setTimeout(() => {
                t.timer = null
                t.lastRun = Date.now()
                if (t.pending) {
                    const p = t.pending
                    t.pending = null
                    onDraft(p)
                }
            }, Math.max(0, wait))
        }
    }

    /** Ends the current gesture: flush+commit the final box, mark no gesture in flight. */
    function endGesture(final: Box) {
        setLiveBox(final)
        commitNow(final)
        gestureActiveRef.current = false
        setGuides([])
    }

    // ---- local undo/redo (popup-only, discarded on unmount — no state to persist) --------------

    function syncHistoryLen() {
        setHistoryLen({undo: undoRef.current.length, redo: redoRef.current.length})
    }

    function beginGesture() {
        undoRef.current.push(liveBoxRef.current)
        redoRef.current = []
        syncHistoryLen()
        gestureActiveRef.current = true
    }

    function undo() {
        const last = undoRef.current.pop()
        if (!last) return
        redoRef.current.push(liveBoxRef.current)
        syncHistoryLen()
        setLiveBox(last)
        commitNow(last)
    }

    function redo() {
        const last = redoRef.current.pop()
        if (!last) return
        undoRef.current.push(liveBoxRef.current)
        syncHistoryLen()
        setLiveBox(last)
        commitNow(last)
    }

    // ---- pointer drag / resize -------------------------------------------------------------------

    // Bypass is per-event (Alt/Option held), not per-gesture — read on every pointer event so it
    // can be pressed or released mid-drag (plan's "What does NOT snap"). Bypassed moves skip
    // snapBox entirely and clear the guides, same as if nothing were near a target.
    function computeNext(clientX: number, clientY: number, altKey: boolean): SnapResult {
        const d = dragRef.current
        if (!d) return {box: liveBoxRef.current, guides: []}
        const dx = (clientX - d.startX) / scale
        const dy = (clientY - d.startY) / scale
        let raw: Box
        let anchors: {x: Anchor[]; y: Anchor[]}
        if (d.state.mode === 'move') {
            raw = {...d.startBox, x: Math.round(d.startBox.x + dx), y: Math.round(d.startBox.y + dy)}
            anchors = MOVE_ANCHORS
        } else {
            raw = resizeBox(d.state.handle, d.startBox, dx, dy)
            anchors = anchorsForHandle(d.state.handle)
        }
        if (altKey) return {box: raw, guides: []}
        return snapBox(raw, anchors, targets, SNAP_PX / scale)
    }

    function startDrag(e: React.PointerEvent, state: DragState) {
        e.stopPropagation()
        beginGesture()
        dragRef.current = {state, startBox: liveBoxRef.current, startX: e.clientX, startY: e.clientY};
        (e.currentTarget as Element).setPointerCapture(e.pointerId)
    }

    // The 8 handles are children of the current rectangle and both carry these handlers, so a
    // handle's events would also reach the rectangle's copy on the way up — stopped here so each
    // pointer event is handled exactly once, whichever element captured it.
    function onDragMove(e: React.PointerEvent) {
        e.stopPropagation()
        if (!dragRef.current) return
        const {box: next, guides: nextGuides} = computeNext(e.clientX, e.clientY, e.altKey)
        setGuides(nextGuides)
        move(next)
    }

    function onDragEnd(e: React.PointerEvent) {
        e.stopPropagation()
        if (!dragRef.current) return
        endGesture(computeNext(e.clientX, e.clientY, e.altKey).box)
        dragRef.current = null
    }

    // ---- keyboard: nudge, undo/redo, Escape ------------------------------------------------------

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            // Only a text/number input keeps its native keys (arrows step the number, Cmd/Ctrl+Z is
            // text undo). Anything else in the footer — a just-clicked Undo/Redo button keeps focus
            // after the click — must not swallow the popup's own shortcuts.
            const inInput = e.target instanceof HTMLInputElement

            if (e.key === 'Escape') {
                if (gestureActiveRef.current) {
                    // Mid-gesture: end it where it is — every move already committed, nothing to
                    // revert. At rest: close the popup.
                    if (nudgeTimerRef.current) {
                        clearTimeout(nudgeTimerRef.current)
                        nudgeTimerRef.current = null
                    }
                    endGesture(liveBoxRef.current)
                } else {
                    onClose()
                }
                return
            }

            if (inInput) return

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault()
                if (e.shiftKey) redo()
                else undo()
                return
            }

            const dirs: Record<string, [number, number]> = {
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
            }
            const dir = dirs[e.key]
            if (!dir) return
            e.preventDefault()
            const step = e.shiftKey ? 10 : 1
            if (!gestureActiveRef.current) beginGesture()
            const cur = liveBoxRef.current
            move({...cur, x: cur.x + dir[0] * step, y: cur.y + dir[1] * step})
            // A held key (auto-repeat) is ONE gesture: it begins on the first press and ends
            // 300ms after the last — same cadence the throttle uses for the OBS pushes.
            if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
            nudgeTimerRef.current = setTimeout(() => {
                nudgeTimerRef.current = null
                endGesture(liveBoxRef.current)
            }, THROTTLE_MS)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ---- footer fields ----------------------------------------------------------------------------

    function fieldFocus() {
        beginGesture()
    }

    function fieldChange(field: keyof Box, raw: string) {
        // Non-numeric input is ignored rather than coerced to 0 — a bare "-" or empty string while
        // typing a negative number just doesn't move the box yet, instead of snapping to 0.
        if (raw.trim() === '') return
        const value = Number(raw)
        if (!Number.isFinite(value)) return
        move({...liveBoxRef.current, [field]: value})
    }

    function fieldEnd() {
        endGesture(liveBoxRef.current)
    }

    function fieldKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur()
        }
    }

    // ---- close --------------------------------------------------------------------------------

    function closeNow() {
        if (gestureActiveRef.current) {
            if (nudgeTimerRef.current) {
                clearTimeout(nudgeTimerRef.current)
                nudgeTimerRef.current = null
            }
            endGesture(liveBoxRef.current)
        }
        onClose()
    }

    // ---- wireframe contents ---------------------------------------------------------------------

    const others = elementsForPhase(config, currentPhase).filter(
        ({key, element}) => key !== elementKey && REGISTRY[registryIdOf(element)].hasBox
    )

    // Everything the current element could snap to on each axis — built once here and read by
    // both snapBox (via computeNext, above) and the "Show snap lines" overlay (below), so the two
    // can never disagree about what a line's position is. Boxless elements are excluded because
    // `others` already is (same reason they aren't drawn in the wireframe).
    const targets = useMemo<SnapTargets>(() => {
        const x: SnapLine[] = []
        const y: SnapLine[] = []
        for (const {key, box: otherBox} of others) {
            x.push(
                {pos: otherBox.x, source: key, kind: 'edge'},
                {pos: otherBox.x + otherBox.w / 2, source: key, kind: 'centre'},
                {pos: otherBox.x + otherBox.w, source: key, kind: 'edge'}
            )
            y.push(
                {pos: otherBox.y, source: key, kind: 'edge'},
                {pos: otherBox.y + otherBox.h / 2, source: key, kind: 'centre'},
                {pos: otherBox.y + otherBox.h, source: key, kind: 'edge'}
            )
        }
        x.push({pos: 0, source: 'page', kind: 'edge'}, {pos: CANVAS.w / 2, source: 'page', kind: 'centre'}, {pos: CANVAS.w, source: 'page', kind: 'edge'})
        y.push({pos: 0, source: 'page', kind: 'edge'}, {pos: CANVAS.h / 2, source: 'page', kind: 'centre'}, {pos: CANVAS.h, source: 'page', kind: 'edge'})
        return {x, y}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [others, elementKey])

    // Overlay lines for the toggle: every target, deduped by position (page edges coincide with
    // the canvas border and add nothing visible, so they're left in rather than special-cased —
    // dedup collapses them against any element sharing the same edge anyway).
    const overlayLines = useMemo(() => ({x: dedupeLines(targets.x), y: dedupeLines(targets.y)}), [targets])

    const canvasW = CANVAS.w * scale
    const canvasH = CANVAS.h * scale

    return (
        <div className="ctl-gallery-backdrop" onClick={closeNow}>
            <div
                ref={panelRef}
                className="ctl-gallery-panel ctl-boxed-panel"
                role="dialog"
                aria-modal="true"
                aria-label={`Edit box — ${label}`}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ctl-gallery-header">
                    <h5 className="mb-0">
                        Edit box — {label} <span className="text-secondary">({elementKey})</span>
                    </h5>
                    <button type="button" className="ctl-gallery-close" aria-label="Close" onClick={closeNow}>
                        ×
                    </button>
                </div>
                <div className="ctl-gallery-body ctl-boxed-body" ref={bodyRef}>
                    <div className="ctl-boxed-canvas" style={{width: canvasW, height: canvasH}}>
                        {others.map(({key, element, box: otherBox}) => {
                            const entry = REGISTRY[registryIdOf(element)]
                            const w = otherBox.w * scale
                            const h = otherBox.h * scale
                            const small = w < 50 || h < 20
                            return (
                                <div
                                    key={key}
                                    className="ctl-boxed-el"
                                    style={{
                                        left: otherBox.x * scale,
                                        top: otherBox.y * scale,
                                        width: w,
                                        height: h,
                                    }}
                                >
                                    <span className="ctl-boxed-el-label">
                                        {!small && <span>{entry.label}</span>}
                                        <span className="ctl-boxed-el-key">{key}</span>
                                    </span>
                                </div>
                            )
                        })}

                        {/* "Show snap lines" — every line the drag would consider, faint, below the
                            current element (spec's layering: rects < overlay < current/handles/guide). */}
                        {snapLinesOn && overlayLines.x.map((l) => (
                            <div
                                key={`sx-${l.pos}`}
                                className={`ctl-boxed-snapline ctl-boxed-snapline--v ctl-boxed-snapline--${l.kind}`}
                                style={{left: l.pos * scale}}
                            />
                        ))}
                        {snapLinesOn && overlayLines.y.map((l) => (
                            <div
                                key={`sy-${l.pos}`}
                                className={`ctl-boxed-snapline ctl-boxed-snapline--h ctl-boxed-snapline--${l.kind}`}
                                style={{top: l.pos * scale}}
                            />
                        ))}

                        {/* Active guide(s) for the current gesture — solid/accented, above the overlay
                            and below the current element+handles, cleared on release/Escape/Alt. */}
                        {guides.map((g, i) => (
                            <div
                                key={`g-${g.axis}-${i}`}
                                className={g.axis === 'x' ? 'ctl-boxed-guide ctl-boxed-guide--v' : 'ctl-boxed-guide ctl-boxed-guide--h'}
                                style={g.axis === 'x' ? {left: g.pos * scale} : {top: g.pos * scale}}
                            />
                        ))}

                        <div
                            className="ctl-boxed-el ctl-boxed-el--current"
                            style={{
                                left: displayBox.x * scale,
                                top: displayBox.y * scale,
                                width: displayBox.w * scale,
                                height: displayBox.h * scale,
                            }}
                            onPointerDown={(e) => startDrag(e, {mode: 'move'})}
                            onPointerMove={onDragMove}
                            onPointerUp={onDragEnd}
                        >
                            <span className="ctl-boxed-el-label">
                                <span>{label}</span>
                                <span className="ctl-boxed-el-key">{elementKey}</span>
                            </span>
                            {HANDLES.map((h) => (
                                <div
                                    key={h.id}
                                    className="ctl-boxed-handle"
                                    style={{top: `${h.top}%`, left: `${h.left}%`, cursor: h.cursor}}
                                    onPointerDown={(e) => startDrag(e, {mode: 'resize', handle: h.id})}
                                    onPointerMove={onDragMove}
                                    onPointerUp={onDragEnd}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="ctl-boxed-footer">
                    <div className="d-flex gap-2">
                        {([
                            {field: 'x', label: 'X'},
                            {field: 'y', label: 'Y'},
                            {field: 'w', label: 'W'},
                            {field: 'h', label: 'H'},
                        ] as const).map(({field, label: fieldLabel}) => (
                            <div className="ctl-boxed-field" key={field}>
                                <label className="ctl-box-label" htmlFor={`ctl-boxed-${elementKey}-${field}`}>
                                    {fieldLabel}
                                </label>
                                <input
                                    id={`ctl-boxed-${elementKey}-${field}`}
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={displayBox[field]}
                                    onFocus={fieldFocus}
                                    onChange={(e) => fieldChange(field, e.target.value)}
                                    onBlur={fieldEnd}
                                    onKeyDown={fieldKeyDown}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={undo} disabled={historyLen.undo === 0}>
                            Undo
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={redo} disabled={historyLen.redo === 0}>
                            Redo
                        </button>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            aria-pressed={snapLinesOn}
                            onClick={toggleSnapLines}
                        >
                            Snap lines
                        </button>
                    </div>
                    <div className="ctl-boxed-legend small text-secondary">
                        Arrows 1px · Shift+Arrows 10px · ⌘/Ctrl+Z undo · ⇧⌘/Ctrl+Z redo · Esc close
                    </div>
                </div>
            </div>
        </div>
    )
}
