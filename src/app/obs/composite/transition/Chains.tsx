import { COLOR } from '@/app/obs/composite/tokens'

/**
 * The two chains the slab hangs from (overlay-transition-spec.md §4).
 *
 * Rendered as a sibling of `.slab` inside `.slab-rig`, positioned
 * `top: -CHAIN_HEIGHT` so it occupies the strip immediately ABOVE the rig's
 * own 1080x1920 box (page.tsx) without adding to the rig's height — the
 * rig's height must stay exactly 1080x1920 or the animation's translateY
 * percentages (keyed to the rig's own height) stop matching the spec's
 * timeline.
 *
 * NO VISIBILITY LOGIC: the chain sits at rig-local y in [-CHAIN_HEIGHT, 0],
 * with the shackle (the attachment point) at y=0 — the slab's top edge.
 * During the fall/hold/exit the slab covers this region or sits fully
 * off-screen above it, so the chain is naturally hidden; only during the
 * stretch phase (~455-885ms, translateY +25%..+28%) does the slab drop far
 * enough that this strip enters the visible frame. Position alone handles
 * this — see plan §6.
 */

// ---------------------------------------------------------------------------
// Named constants (spec open question 1: 2 chains at a light gauge may read
// as wire rather than as something holding a slab — judge in OBS and adjust
// these, not the layout logic below).
// ---------------------------------------------------------------------------

/** Two chains, at the quarter points of the 1080-wide slab. */
const CHAIN_X_POSITIONS: readonly number[] = [270, 810]

/**
 * Reach above the rig's top edge. Must clear the top of frame at MAXIMUM
 * extension (+28% of 1920 ≈ 538px) or the chain's free end would be visibly
 * cut off mid-stretch — 700px leaves headroom past that.
 */
const CHAIN_HEIGHT = 700

/** Vertical space each link (wide or edge-on) occupies along the chain. */
const LINK_PITCH = 34

/** Wide link: seen face-on, a rounded-rect OUTLINE. Taller than one pitch on
 *  purpose — real chain links overlap their neighbours, they don't butt-join. */
const LINK_WIDE_WIDTH = 26
const LINK_WIDE_HEIGHT = 42
const LINK_WIDE_RADIUS = 12

/** Edge-on link: the SAME physical link rotated 90deg, seen from the side —
 *  reads as a thin bar. Alternating wide/edge is what makes the chain read
 *  as a chain instead of a beaded rod (spec §4). */
const LINK_EDGE_WIDTH = 9
const LINK_EDGE_HEIGHT = 20

const LINK_STROKE_WIDTH = 5

/** Bronze shackle bolting the chain to the slab's top edge. */
const SHACKLE_WIDTH = 46
const SHACKLE_HEIGHT = 28
const SHACKLE_STROKE_WIDTH = 6

const CHAIN_COLOR = COLOR.bronze

/** Half-width of the drawing area each chain's own SVG gets — wide enough
 *  for the widest element (the shackle) without clipping it. */
const SVG_HALF_WIDTH = 40

type Link = { type: 'wide' | 'edge'; cy: number }

/**
 * Lay out links bottom-up: the first link sits right above the shackle
 * (large `cy`, close to CHAIN_HEIGHT — near the slab's top edge) and
 * successive links climb toward the chain's free end (`cy` toward 0, the
 * far/upper end of the 700px strip). Alternates wide/edge every step.
 */
function buildLinks(): Link[] {
  const links: Link[] = []
  let cy = CHAIN_HEIGHT - SHACKLE_HEIGHT
  let i = 0
  while (cy > 0) {
    links.push({ type: i % 2 === 0 ? 'wide' : 'edge', cy })
    cy -= LINK_PITCH
    i += 1
  }
  return links
}

const LINKS = buildLinks()

function OneChain({ x }: { x: number }) {
  return (
    <svg
      width={SVG_HALF_WIDTH * 2}
      height={CHAIN_HEIGHT}
      viewBox={`0 0 ${SVG_HALF_WIDTH * 2} ${CHAIN_HEIGHT}`}
      style={{ position: 'absolute', left: x - SVG_HALF_WIDTH, top: 0 }}
      aria-hidden
    >
      {LINKS.map((link, i) =>
        link.type === 'wide' ? (
          <rect
            key={i}
            x={SVG_HALF_WIDTH - LINK_WIDE_WIDTH / 2}
            y={link.cy - LINK_WIDE_HEIGHT / 2}
            width={LINK_WIDE_WIDTH}
            height={LINK_WIDE_HEIGHT}
            rx={LINK_WIDE_RADIUS}
            fill="none"
            stroke={CHAIN_COLOR}
            strokeWidth={LINK_STROKE_WIDTH}
          />
        ) : (
          <rect
            key={i}
            x={SVG_HALF_WIDTH - LINK_EDGE_WIDTH / 2}
            y={link.cy - LINK_EDGE_HEIGHT / 2}
            width={LINK_EDGE_WIDTH}
            height={LINK_EDGE_HEIGHT}
            fill={CHAIN_COLOR}
          />
        ),
      )}
      {/* Shackle: bolted to the slab's top edge, i.e. the BOTTOM of this
          strip (y = CHAIN_HEIGHT is rig-local y = 0). */}
      <rect
        x={SVG_HALF_WIDTH - SHACKLE_WIDTH / 2}
        y={CHAIN_HEIGHT - SHACKLE_HEIGHT}
        width={SHACKLE_WIDTH}
        height={SHACKLE_HEIGHT}
        rx={SHACKLE_HEIGHT / 2}
        fill="none"
        stroke={CHAIN_COLOR}
        strokeWidth={SHACKLE_STROKE_WIDTH}
      />
    </svg>
  )
}

export function Chains() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: -CHAIN_HEIGHT,
        width: '100%',
        height: CHAIN_HEIGHT,
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden
    >
      {CHAIN_X_POSITIONS.map((x) => (
        <OneChain key={x} x={x} />
      ))}
    </div>
  )
}
