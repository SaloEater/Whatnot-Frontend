'use client'

// `lightning` effect (obs-scene-element-plan.md §1.2/§5) — a full-box white fill layer (z 60, just
// under the vignette) that flashes on cue. Two independent triggers both funnel through the same
// `flash()`:
//   - the `thunder` scene event, relayed here as a `strike` SceneCue by SceneElement.tsx (§2.4 —
//     kept off the registry-uniform `EffectProps` shape as an imperative ref, per the plan's own
//     note, in favour of this cue channel);
//   - an ambient timer, armed only when `ambientIntervalSec` is a number (`null` = "cue only", no
//     autoplay), re-jittered to `[0.5x, 1.5x]` of it after every flash.
// `flash()` re-triggers the CSS keyframe by remounting the flashing div under a bumped React key
// (§5: "class toggled to re-trigger (remove/reflow/add or key bump)") and publishes a `flash`
// SceneCue at the same moment so MountainEffect.tsx can pulse its lit variant in sync — the effects
// never read each other's state directly (§1.3), only this cue.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EffectProps } from '../../effectRegistry'
import type { SceneEffect } from '../../../../schema'
import './LightningEffect.css'

type LightningEffectProps = EffectProps<Extract<SceneEffect, { id: 'lightning' }>>

// obs-scene-element-plan.md §5's flash always fires at full strength; `strength` is carried on the
// cue (not hard-coded at the subscriber) so a future tuning knob only ever needs to change this one
// constant, not the cue's shape or MountainEffect.tsx's consumer.
const FLASH_STRENGTH = 1

export function LightningEffect({ effect, cue }: LightningEffectProps) {
    // 0 = "never flashed yet" (renders the static, un-animated base — see the JSX below); every
    // flash bumps this, and using it as the flashing div's `key` forces a fresh DOM node each time,
    // which is what makes the CSS keyframe replay instead of doing nothing on an already-finished
    // animation.
    const [flashSeq, setFlashSeq] = useState(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const flash = useCallback(() => {
        setFlashSeq((seq) => seq + 1)
        cue.emit({ kind: 'flash', strength: FLASH_STRENGTH })
    }, [cue])

    // Subscribes to `strike` (the `thunder` scene event, relayed by SceneElement.tsx).
    useEffect(() => {
        return cue.subscribe((c) => {
            if (c.kind === 'strike') flash()
        })
    }, [cue, flash])

    // Ambient timer — a chain of jittered `setTimeout`s (not `setInterval`) so a flash triggered by
    // `thunder` in between two ambient flashes doesn't leave the NEXT ambient one arriving early or
    // late relative to a fixed grid; each flash (of either origin) re-arms its own next delay.
    useEffect(() => {
        const intervalSec = effect.ambientIntervalSec
        if (intervalSec === null) return undefined

        let cancelled = false

        function scheduleNext() {
            const jitter = 0.5 + Math.random() // [0.5, 1.5)
            const delayMs = intervalSec! * 1000 * jitter
            timerRef.current = setTimeout(() => {
                if (cancelled) return
                flash()
                scheduleNext()
            }, delayMs)
        }

        scheduleNext()

        return () => {
            cancelled = true
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
        }
    }, [effect.ambientIntervalSec, flash])

    return <div key={flashSeq} className={`scene-lightning${flashSeq > 0 ? ' scene-lightning--flash' : ''}`} />
}

export default LightningEffect
