'use client'

/**
 * "STASH OR PASS" — animated banner. See stash-or-pass-spec.md.
 *
 * OBS BROWSER SOURCE SETTINGS:
 *   - Size: 1080 x 360
 *   - URL:  .../obs/animation/stashorpass_simple
 *   - [x] Shutdown source when not visible
 *   - [x] Refresh browser when scene becomes active
 * With both checkboxes on, showing this source (or toggling its scene
 * visibility) reloads the page and replays it from 0ms. Replay IS page reload —
 * there is no in-page re-trigger, no WebSocket, and no backend wiring. The page
 * takes no parameters and fetches nothing.
 *
 * The root layout's breadcrumbs component already hides itself on /obs paths
 * that are not /obs/manage, so nothing has to be worked around here.
 */

import { useEffect, useRef, useState } from 'react'
import './page.css'
import { CANVAS, OPEN, PANEL, RAIL, SLOT_COUNT } from './tokens'
import { useBannerScale } from './useBannerScale'
import { Card } from './Card'
import { Headline, PullAgain } from './Headline'
import {
  buildLoopA,
  buildLoopB,
  resetStage,
  type CardRefs,
  type RailRefs,
  type Stage,
  type WordRefs,
} from './timeline'

export default function Page() {
  const scale = useBannerScale()
  const stageRef = useRef<HTMLDivElement>(null)
  const [fontsReady, setFontsReady] = useState(false)

  /*
   * Nothing starts until the font has arrived. Every position in tokens.ts is
   * derived from Grechka's cap height, so painting the opening in a fallback
   * would put the headline in the wrong place for a frame and then jump it.
   * `.then(done, done)` — a rejected font load still has to release the page,
   * otherwise a font 404 leaves a permanently blank browser source on stream.
   */
  useEffect(() => {
    let cancelled = false
    const done = () => {
      if (!cancelled) setFontsReady(true)
    }
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(done, done)
    } else {
      done()
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!fontsReady) return
    const root = stageRef.current
    if (!root) return

    // Collected by query rather than 30 individual refs — the DOM is static
    // after mount, so one pass at start-up is enough.
    const cards: CardRefs[] = Array.from(root.querySelectorAll<HTMLElement>('.sp-card')).map((el) => ({
      root: el,
      flip: el.querySelector<HTMLElement>('.sp-card-3d')!,
      glow: el.querySelector<HTMLElement>('.sp-card-glow')!,
      stashed: el.querySelector<HTMLElement>('.sp-face-stashed')!,
      dead: el.querySelector<HTMLElement>('.sp-face-dead')!,
    }))

    // Each word's animated pair plus the <g> that carries the scale pop. The
    // neutral and ember layers are deliberately NOT collected — nothing in the
    // timeline may touch them (see resetStage).
    const word = (id: 'stash' | 'pass'): WordRefs | null => {
      const group = root.querySelector<SVGGElement>(`.sp-word-${id}`)
      const ignite = root.querySelector<SVGTextElement>(`.sp-word-${id} .sp-ignite`)
      const bloom = root.querySelector<SVGTextElement>(`.sp-word-${id} .sp-bloom`)
      return group && ignite && bloom ? { group, ignite, bloom } : null
    }
    // querySelectorAll returns document order, which Rail emits in fill order.
    const rail = (side: 'left' | 'right'): RailRefs => ({
      lit: Array.from(root.querySelectorAll<SVGRectElement>(`.sp-rail-${side} .sp-dash-lit`)),
    })

    const stash = word('stash')
    const pass = word('pass')
    // The CHARGE layer, not the group — the base layer underneath is never
    // animated, the same way each word's neutral layer never is.
    const or = root.querySelector<SVGTextElement>('.sp-or-charge')
    const pullAgain = root.querySelector<SVGGElement>('.sp-pull-again')
    const left = rail('left')
    const right = rail('right')

    if (
      cards.length !== SLOT_COUNT ||
      !stash ||
      !pass ||
      !or ||
      !pullAgain ||
      left.lit.length !== RAIL.left.length ||
      right.lit.length !== RAIL.right.length
    ) {
      return
    }

    const stage: Stage = {
      cards,
      words: { stash, pass },
      or,
      rails: { left, right },
      pullAgain,
    }

    let stopped = false
    let live: Animation[] = []
    let timer: number | undefined
    let variant: 'A' | 'B' = 'A'

    const run = () => {
      if (stopped) return

      /*
       * CANCEL FIRST, THEN RESET. Every step runs with fill: 'forwards', and a
       * filled animation keeps overriding inline styles after it finishes — so
       * resetStage's writes would silently do nothing if the previous loop's
       * animations were still alive. Getting this backwards does not fail
       * loudly; it shows up as the fan degrading over the following minutes.
       *
       * Cancelling every cycle is also what stops the ~30 Animation objects a
       * loop creates from accumulating across a stream-length run.
       */
      live.forEach((a) => a.cancel())
      live = []
      resetStage(stage)

      const slotA = Math.floor(Math.random() * SLOT_COUNT)
      let loop
      if (variant === 'A') {
        loop = buildLoopA(stage, slotA)
      } else {
        // Draw from the five OTHER slots, so card 2 can never share card 1's
        // slot (invariant 3) — same slot reads as the same card coming back.
        let slotB = Math.floor(Math.random() * (SLOT_COUNT - 1))
        if (slotB >= slotA) slotB += 1
        stage.cards[slotB].root.dataset.numeral = '2'
        loop = buildLoopB(stage, slotA, slotB)
      }

      loop.steps.forEach((s) => live.push(s.el.animate(s.keyframes, s.options)))

      // A alternates with B forever. A runs first: it establishes the baseline
      // so that B reads as the twist rather than as the default.
      variant = variant === 'A' ? 'B' : 'A'
      timer = window.setTimeout(run, loop.duration)
    }

    timer = window.setTimeout(run, OPEN.total)

    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
      live.forEach((a) => a.cancel())
    }
  }, [fontsReady])

  return (
    <div ref={stageRef} className={`sp-banner-stage-outer${fontsReady ? ' sp-is-open' : ''}`}>
      <div
        className="sp-banner-canvas"
        style={
          {
            width: CANVAS.width,
            height: CANVAS.height,
            '--stage-scale': scale,
          } as React.CSSProperties & { '--stage-scale': number }
        }
      >
        <div className="sp-banner-open">
          <div className="sp-wash" />
          {/*
           * The 90% panel: behind the headline, both zones, the hover point and
           * the fan, as one continuous ground down to the bottom edge. Below the
           * cards by necessity — see PANEL in tokens.ts.
           */}
          <div
            className="sp-panel"
            style={{
              left: PANEL.x,
              top: PANEL.y,
              width: PANEL.width,
              height: PANEL.height,
            }}
          />
          {/* Beneath the cards on purpose — card 2 passes in front of it. */}
          <PullAgain />
          <div className="sp-card-layer">
            {Array.from({ length: SLOT_COUNT }, (_, i) => (
              <Card key={i} slot={i} />
            ))}
          </div>
          <Headline />
        </div>
      </div>
    </div>
  )
}
