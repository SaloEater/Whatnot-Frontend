'use client'

// The `obsToggle` registry component (obs-visibility-toggle-plan.md) — invisible on purpose: this
// element only exists to carry `sources` for the controls-side stage hook (mount.ts). Boxless
// (registry.ts `hasBox: false`) so the controls block hides its x/y/w/h — placement only decides
// which stages the element (and therefore its OBS toggling) is present on.
import type { ElementProps } from '../../registry'

export function ObsToggleElement(_: ElementProps) {
    return null
}

export default ObsToggleElement
