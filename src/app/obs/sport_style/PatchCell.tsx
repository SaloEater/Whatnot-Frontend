'use client'

// A single team "patch" cell: fabric background, rhombus weave, stitched border, team logo, edge
// wear, and a `sold` mode that renders a flat-grey imprint instead (sport-style-sold-cell-plan.md).
// Shared module (sport-style-board-plan.md §1): moved out of setup/sport_style/team/ so the team
// playground and the board:sport_style layout element render from the SAME code — the playground
// imports this unchanged, nothing about its behaviour changes.

import { useId } from 'react'
import { RGB, rgbToCss, darken, lighten, mix, toGrey, shade, hexToRgb, StitchMode } from './patchColors'
import { EdgeTier, TIER_SKINS } from './tierSkins'

export interface PatchStyle {
    // The rendered size is no longer a style field (sport-style-board-plan.md R1 fix 3): whoever
    // places the patch derives it (patchSizeFor, scalePatchStyle.ts) and passes it to PatchCell as
    // the `size` PROP below, not through this object. `padding` is what the operator tunes instead
    // — the gap, in px at PATCH_REFERENCE_SIZE, left between the cell's footprint edge and the
    // patch edge.
    padding: number       // px at PATCH_REFERENCE_SIZE
    radius: number        // corner radius px
    rhombusSize: number   // rhombus diagonal px
    rhombusSpacing: number // edge-to-edge gap between neighbouring rhombi px
    rhombusOpacity: number
    rhombusColor: 'dark' | 'light'
    stitchInset: number   // px from the edge
    stitchWidth: number
    stitchStyle: 'dashed' | 'solid'
    stitchDash: number
    stitchGap: number
    stitchOpacity: number
    stitchShadow: boolean
    edgeWear: 'none' | 'fade' | 'grain' | 'both'
    edgeFadeLighten: number     // 0..1, lighten the band tint toward white
    edgeFadeDesaturate: number  // 0..1, move the band tint toward its grey equivalent
    edgeFadeOpacity: number     // 0..1
    edgeFadeFeather: number     // px blur on the band's inner boundary, 0 = hard edge
    edgeGrainFrequency: number  // feTurbulence baseFrequency
    edgeGrainOctaves: number
    edgeGrainOpacity: number    // 0..1
    edgeGrainScale: number      // 0.5..3, scales noise size via baseFrequency / scale
    edgeGrainGain: number       // negative feFuncA slope, higher = punchier speckle contrast
    edgeGrainBias: number       // feFuncA intercept, shifts how much noise clips to opaque black
    grainSeed?: number          // overrides the useId-derived feTurbulence seed
    innerShadow: boolean
    innerShadowGap: number     // px between stitch inner edge and shadow line
    innerShadowWidth: number
    innerShadowOpacity: number
    innerShadowBlur: number
    logoScale: number     // 0..1
    logoShadowX: number       // cast shadow offset px
    logoShadowY: number
    logoShadowBlur: number
    logoShadowOpacity: number
    logoContactShadow: number // tight 0-offset shadow opacity, hugs the outline
    logoLift: number          // px the logo is nudged up (opposite to the shadow)
    vignette: number      // 0..1
    edgeShadow: boolean
    soldRingShade: number       // -1..1, offset from cell grey toward black (-) or white (+)
    soldSilhouetteShade: number // -1..1, same convention
    soldKeepWeave: boolean      // keep the rhombus weave on a sold cell
    // The sold cell body's grey brightness is squeezed into [min, max] — the team's luminance 0..1
    // maps linearly onto that band, so a white-fabric team still lands at `max`, leaving headroom
    // for the lighter ring/silhouette offsets to have somewhere to go.
    soldGreyMin: number // 0..1
    soldGreyMax: number // 0..1
    soldKeepColor: boolean // keep the team background colour on the sold cell body; ring/silhouette stay grey
}

export const defaultPatchStyle: PatchStyle = {
    padding: 8,
    radius: 22,
    rhombusSize: 3.5,
    rhombusSpacing: 2,
    rhombusOpacity: 0.28,
    rhombusColor: 'dark',
    stitchInset: 9,
    stitchWidth: 2.2,
    stitchStyle: 'dashed',
    stitchDash: 7,
    stitchGap: 4,
    stitchOpacity: 0.95,
    stitchShadow: true,
    edgeWear: 'fade',
    edgeFadeLighten: 0.35,
    edgeFadeDesaturate: 0.5,
    edgeFadeOpacity: 0.55,
    edgeFadeFeather: 3,
    edgeGrainFrequency: 0.9,
    edgeGrainOctaves: 2,
    edgeGrainOpacity: 0.45,
    edgeGrainScale: 1,
    edgeGrainGain: 3,
    edgeGrainBias: 1.8,
    innerShadow: true,
    innerShadowGap: 1,
    innerShadowWidth: 2,
    innerShadowOpacity: 0.45,
    innerShadowBlur: 0.6,
    logoScale: 0.72,
    logoShadowX: 0,
    logoShadowY: 3,
    logoShadowBlur: 3,
    logoShadowOpacity: 0.6,
    logoContactShadow: 0.5,
    logoLift: 1,
    vignette: 0.35,
    edgeShadow: true,
    soldRingShade: 0.30,
    soldSilhouetteShade: 0.40,
    soldKeepWeave: true,
    soldGreyMin: 0,
    soldGreyMax: 0.5,
    soldKeepColor: false,
}

interface Props {
    background: RGB
    stitch: RGB
    logoSrc: string
    style: PatchStyle
    sold?: boolean
    // The rendered footprint, px (sport-style-board-plan.md R1 fix 3) — replaces the old
    // `style.size`. The caller derives this from its own layout (patchSizeFor) and typically
    // scales `style` by `size / PATCH_REFERENCE_SIZE` first (scalePatchStyle.ts) so proportions
    // hold at any size.
    size: number
    // Set for a spot whose name is not a real team (R1 fix 4) — rendered centred in the logo area
    // instead of `logoSrc`, in the stitch colour (live) or the silhouette grey (sold).
    label?: string
    // Tiered edge (sport-style-board-plan.md R3.2, reworked to cobra's neon language). Live branch
    // only — the sold branch ignores it, the imprint stays grey. When set, the edge-wear ring is a
    // FLAT fill of the tier's neon colour — no gradient, no grain, no edge-wear fade (`style.edgeWear`
    // is ignored, texture-free), the stitch (+ its shadow) uses the skin's stitch colour instead of
    // the palette stitch, and the cell's own box-shadow (normally `style.edgeShadow`'s drop shadow)
    // is REPLACED by the tier's neon glow, sized against `size` to match `board:cobra_flat`'s glow
    // proportions — except `regular`'s skin, whose `glow: 'none'` drops the box-shadow entirely
    // (matching `board:cobra_flat`'s `.cbf-cell--regular { box-shadow: none }`), so a tiered
    // `regular` cell gets the flat neon ring + vivid stitch but no glow and no drop shadow. Everything
    // else — inner shadow, logo, vignette, weave, background — is unchanged; the fabric is still the
    // team's, only the border/glow carries the tier's neon identity.
    edgeTier?: EdgeTier
}

// General style settings: exportable/importable, excludes per-session state
// (team, bgOverride, stitchOverride, showAll, wearSeed) and the non-style grainSeed knob.
// sport-style-board-plan.md §3: moved here (from setup/sport_style/team/page.tsx) so the team
// playground and the board:sport_style layout element name the same shape.
export interface GeneralSettings {
    style: Omit<PatchStyle, 'grainSeed'>
    mixEnabled: boolean
    mixRatio: number
    stitchMode: StitchMode
    stitchMinContrast: number
    stitchMinLuminance: number
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2))
    if (rr === 0) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`
    return [
        `M${x + rr} ${y}`,
        `H${x + w - rr}`,
        `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
        `V${y + h - rr}`,
        `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
        `H${x + rr}`,
        `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
        `V${y + rr}`,
        `A${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
        'Z',
    ].join(' ')
}

function rhombusTile(rhombus: number, spacing: number, color: string, opacity: number): string {
    // Neighbouring rhombi (centre + corners) are diagonal neighbours; their facing edges are
    // perpendicular to the diagonal, so edge gap g = sqrt2 * (h - r)  =>  tile = rhombus + sqrt2 * g.
    const r = rhombus / 2
    const size = rhombus + Math.SQRT2 * spacing
    const h = size / 2
    // A rhombus centred in the tile plus quarter-rhombi in the corners so the pattern
    // interlocks like a woven texture.
    const d = (cx: number, cy: number) => `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`
    const paths = [d(h, h), d(0, 0), d(size, 0), d(0, size), d(size, size)].join(' ')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="${paths}" fill="${color}" fill-opacity="${opacity}"/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export default function PatchCell({ background: paletteBackground, stitch, logoSrc, style: s, sold, size, label, edgeTier }: Props) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '_')
    // Tiered edge: the fabric itself takes the tier's colour too — the neon darkened by 30% — so
    // every patch of a tier reads as one piece with its edge. Sold cells keep the palette colour
    // (the sold branch ignores the tier).
    const background: RGB = !sold && edgeTier ? darken(hexToRgb(TIER_SKINS[edgeTier].neon), 0.3) : paletteBackground
    // TeamIconSrc (src/app/common/teams.ts) paths contain spaces (e.g. "Arizona Cardinals.webp");
    // an unquoted url() with a space is invalid CSS and silently drops the mask, so the sold cell
    // rendered as a plain grey square. Quote + encode once and reuse for both mask properties.
    const maskUrl = `url("${encodeURI(logoSrc)}")`

    if (sold) {
        const rawGrey = toGrey(background)
        // Remap the sold cell's base grey into an operator-tunable brightness band before the
        // ring/silhouette offsets are applied, so a near-white team background doesn't leave the
        // lighter offsets with nowhere to go (sport-style-sold-cell-plan.md brightness fix).
        const lum = rawGrey[0] / 255
        const lo = Math.min(s.soldGreyMin, s.soldGreyMax)
        const hi = Math.max(s.soldGreyMin, s.soldGreyMax)
        const level = Math.round(255 * (lo + lum * (hi - lo)))
        const cellGrey: RGB = [level, level, level]
        const ringGrey = shade(cellGrey, s.soldRingShade)
        const silhouetteGrey = shade(cellGrey, s.soldSilhouetteShade)
        const soldRhombusColor = s.rhombusColor === 'dark' ? '#000' : '#fff'
        const soldInnerRadius = Math.max(2, s.radius - s.stitchInset)
        const soldRingPath = `${roundedRectPath(0, 0, size, size, s.radius)} ${roundedRectPath(s.stitchInset, s.stitchInset, size - s.stitchInset * 2, size - s.stitchInset * 2, soldInnerRadius)}`

        return (
            <div
                style={{
                    position: 'relative',
                    width: size,
                    height: size,
                    borderRadius: s.radius,
                    backgroundColor: rgbToCss(s.soldKeepColor ? background : cellGrey),
                    backgroundImage: s.soldKeepWeave
                        ? rhombusTile(s.rhombusSize, s.rhombusSpacing, soldRhombusColor, s.rhombusOpacity)
                        : undefined,
                    overflow: 'hidden',
                    flex: '0 0 auto',
                }}
            >
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                    <path d={soldRingPath} fillRule="evenodd" fill={rgbToCss(ringGrey)} />
                </svg>
                {label ? (
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: `${s.logoScale * 100}%`,
                            height: `${s.logoScale * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: rgbToCss(silhouetteGrey),
                            fontWeight: 'bold',
                            fontSize: `${size * s.logoScale * 0.45}px`,
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {label}
                    </div>
                ) : (
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: `${s.logoScale * 100}%`,
                            height: `${s.logoScale * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: rgbToCss(silhouetteGrey),
                            maskImage: maskUrl,
                            WebkitMaskImage: maskUrl,
                            maskSize: 'contain',
                            WebkitMaskSize: 'contain',
                            maskRepeat: 'no-repeat',
                            WebkitMaskRepeat: 'no-repeat',
                            maskPosition: 'center',
                            WebkitMaskPosition: 'center',
                        }}
                    />
                )}
            </div>
        )
    }

    // R3.2 tiered edge (reworked to cobra's neon language): the tier skin (if any) swaps in for the
    // palette stitch/shadow and takes over the edge-wear ring entirely (style.edgeWear is ignored
    // for a tiered edge) with a flat, texture-free neon fill — no gradient, no grain, no edge-wear
    // fade.
    const tierSkin = edgeTier ? TIER_SKINS[edgeTier] : undefined
    const effectiveStitch = tierSkin ? tierSkin.stitch : stitch

    const bg = rgbToCss(background)
    const rhombusColor = s.rhombusColor === 'dark' ? '#000' : '#fff'
    const stitchCss = rgbToCss(effectiveStitch, s.stitchOpacity)
    const innerRadius = Math.max(2, s.radius - s.stitchInset)
    const shadowColor = rgbToCss(darken(tierSkin ? effectiveStitch : background, 0.55), 0.8)
    // Inner shadow line sits just inside the stitch: stitch inner edge + gap + half its own width.
    const innerShadowInset = s.stitchInset + s.stitchWidth / 2 + s.innerShadowGap + s.innerShadowWidth / 2
    const innerShadowRadius = Math.max(1, innerRadius - (innerShadowInset - s.stitchInset))

    // Edge wear: a ring between the cell's outer edge and the stitch, drawn under the stitch/logo.
    const fadeBlurFilterId = `edge-fade-blur-${uid}`
    const fadeClipId = `edge-fade-clip-${uid}`
    const grainFilterId = `edge-grain-${uid}`
    const grainSeed = Math.abs(Array.from(uid).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 1000 || 7
    const ringPath = `${roundedRectPath(0, 0, size, size, s.radius)} ${roundedRectPath(s.stitchInset, s.stitchInset, size - s.stitchInset * 2, size - s.stitchInset * 2, innerRadius)}`
    const [br, bg2, bb] = background
    const greyLevel = Math.round(0.299 * br + 0.587 * bg2 + 0.114 * bb)
    const grey: RGB = [greyLevel, greyLevel, greyLevel]
    const edgeFadeTint = rgbToCss(lighten(mix(background, grey, s.edgeFadeDesaturate), s.edgeFadeLighten))

    return (
        <div
            style={{
                position: 'relative',
                width: size,
                height: size,
                borderRadius: s.radius,
                backgroundColor: bg,
                backgroundImage: [
                    s.vignette > 0
                        ? `radial-gradient(ellipse at 50% 40%, ${rgbToCss(lighten(background, 0.10), s.vignette * 0.6)} 0%, transparent 55%, ${rgbToCss(darken(background, 0.45), s.vignette)} 100%)`
                        : null,
                    rhombusTile(s.rhombusSize, s.rhombusSpacing, rhombusColor, s.rhombusOpacity),
                ].filter(Boolean).join(', '),
                // A tiered edge REPLACES the plain edgeShadow drop shadow with the tier's neon glow
                // (CobraFlatBoard.css's `.cbf-cell`/`.cbf-cell--mid` box-shadow rules, re-proportioned
                // against this cell's own `size` instead of its `em` basis — see PatchCell's Props
                // doc for `edgeTier`). The outer div's `overflow: hidden` (below) does not clip its
                // own box-shadow, only its content, so the bloom still shows outside the cell.
                boxShadow: tierSkin
                    ? (tierSkin.glow === 'full'
                        ? `0 0 ${0.12 * size}px ${tierSkin.neonSoft}, 0 0 ${0.28 * size}px ${tierSkin.neonSoft}, inset 0 0 ${0.05 * size}px ${tierSkin.neon}, inset 0 0 ${0.12 * size}px ${tierSkin.neonSoft}`
                        : tierSkin.glow === 'inner'
                            ? `inset 0 0 ${0.05 * size}px ${tierSkin.neon}, inset 0 0 ${0.12 * size}px ${tierSkin.neonSoft}`
                            : undefined)
                    : (s.edgeShadow
                        ? `inset 0 0 0 1px ${rgbToCss(darken(background, 0.5), 0.9)}, 0 3px 6px rgba(0,0,0,0.55), 0 10px 18px rgba(0,0,0,0.35)`
                        : undefined),
                overflow: 'hidden',
                flex: '0 0 auto',
            }}
        >
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
                {tierSkin ? (
                    // Flat, texture-free neon fill — no gradient, no grain, no edge-wear fade.
                    <path d={ringPath} fillRule="evenodd" fill={tierSkin.neon} />
                ) : (
                    <>
                        {(s.edgeWear === 'fade' || s.edgeWear === 'both') && (
                            <>
                                {s.edgeFadeFeather > 0 && (
                                    <defs>
                                        <filter id={fadeBlurFilterId} x="-5%" y="-5%" width="110%" height="110%">
                                            <feGaussianBlur stdDeviation={s.edgeFadeFeather} />
                                        </filter>
                                        <clipPath id={fadeClipId}>
                                            <path d={roundedRectPath(0, 0, size, size, s.radius)} />
                                        </clipPath>
                                    </defs>
                                )}
                                <path
                                    d={ringPath}
                                    fillRule="evenodd"
                                    fill={edgeFadeTint}
                                    fillOpacity={s.edgeFadeOpacity}
                                    clipPath={s.edgeFadeFeather > 0 ? `url(#${fadeClipId})` : undefined}
                                    filter={s.edgeFadeFeather > 0 ? `url(#${fadeBlurFilterId})` : undefined}
                                />
                            </>
                        )}
                        {(s.edgeWear === 'grain' || s.edgeWear === 'both') && (
                            <>
                                <defs>
                                    <filter id={grainFilterId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                                        <feTurbulence
                                            type="fractalNoise"
                                            baseFrequency={s.edgeGrainFrequency / s.edgeGrainScale}
                                            numOctaves={s.edgeGrainOctaves}
                                            seed={s.grainSeed ?? grainSeed}
                                            result="noise"
                                        />
                                        <feColorMatrix in="noise" type="luminanceToAlpha" result="lum" />
                                        <feComponentTransfer in="lum" result="specks">
                                            <feFuncA type="linear" slope={-s.edgeGrainGain} intercept={s.edgeGrainBias} />
                                        </feComponentTransfer>
                                        <feComposite in="specks" in2="SourceAlpha" operator="in" />
                                    </filter>
                                </defs>
                                <path
                                    d={ringPath}
                                    fillRule="evenodd"
                                    fill="#000"
                                    opacity={s.edgeGrainOpacity}
                                    filter={`url(#${grainFilterId})`}
                                />
                            </>
                        )}
                    </>
                )}
                {s.innerShadow && s.innerShadowBlur > 0 && (
                    <defs>
                        <filter id="inner-shadow-blur" x="-10%" y="-10%" width="120%" height="120%">
                            <feGaussianBlur stdDeviation={s.innerShadowBlur} />
                        </filter>
                    </defs>
                )}
                {s.innerShadow && (
                    <rect
                        x={innerShadowInset}
                        y={innerShadowInset}
                        width={size - innerShadowInset * 2}
                        height={size - innerShadowInset * 2}
                        rx={innerShadowRadius}
                        fill="none"
                        stroke={`rgba(0,0,0,${s.innerShadowOpacity})`}
                        strokeWidth={s.innerShadowWidth}
                        filter={s.innerShadowBlur > 0 ? 'url(#inner-shadow-blur)' : undefined}
                    />
                )}
                {s.stitchShadow && (
                    <rect
                        x={s.stitchInset}
                        y={s.stitchInset + 0.8}
                        width={size - s.stitchInset * 2}
                        height={size - s.stitchInset * 2}
                        rx={innerRadius}
                        fill="none"
                        stroke={shadowColor}
                        strokeWidth={s.stitchWidth + 1}
                        strokeDasharray={s.stitchStyle === 'solid' ? undefined : `${s.stitchDash} ${s.stitchGap}`}
                        strokeLinecap="round"
                    />
                )}
                <rect
                    x={s.stitchInset}
                    y={s.stitchInset}
                    width={size - s.stitchInset * 2}
                    height={size - s.stitchInset * 2}
                    rx={innerRadius}
                    fill="none"
                    stroke={stitchCss}
                    strokeWidth={s.stitchWidth}
                    strokeDasharray={s.stitchStyle === 'solid' ? undefined : `${s.stitchDash} ${s.stitchGap}`}
                    strokeLinecap="round"
                />
            </svg>
            {label ? (
                <div
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: `${s.logoScale * 100}%`,
                        height: `${s.logoScale * 100}%`,
                        transform: `translate(-50%, calc(-50% - ${s.logoLift}px))`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Tiered: the vivid stitch tone sits on a fabric of the same hue, so the
                        // initials use a near-black tint of the tier colour instead.
                        color: tierSkin ? rgbToCss(darken(hexToRgb(tierSkin.neon), 0.8)) : stitchCss,
                        fontWeight: 'bold',
                        fontSize: `${size * s.logoScale * 0.45}px`,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {label}
                </div>
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logoSrc}
                    alt=""
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: `${s.logoScale * 100}%`,
                        height: `${s.logoScale * 100}%`,
                        transform: `translate(-50%, calc(-50% - ${s.logoLift}px))`,
                        objectFit: 'contain',
                        filter: [
                            s.logoContactShadow > 0 ? `drop-shadow(0 0 0.6px rgba(0,0,0,${s.logoContactShadow}))` : null,
                            s.logoShadowOpacity > 0 ? `drop-shadow(${s.logoShadowX}px ${s.logoShadowY}px ${s.logoShadowBlur}px rgba(0,0,0,${s.logoShadowOpacity}))` : null,
                        ].filter(Boolean).join(' ') || undefined,
                    }}
                />
            )}
        </div>
    )
}
