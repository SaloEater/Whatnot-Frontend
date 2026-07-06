// Loads the engineering-owned manifest from /public at runtime and validates its
// shape so a malformed file fails loudly (console) instead of rendering garbage.

import {useEffect, useState} from "react"
import {Manifest} from "./manifest"

const MANIFEST_URL = "/images/flat-board-tiles/manifest.json"

function isManifest(x: unknown): x is Manifest {
    const m = x as Manifest
    return !!m
        && typeof m.tilePx === 'number'
        && Array.isArray(m.styles) && m.styles.length > 0
        && m.styles.every(s => typeof s?.id === 'string' && typeof s?.path === 'string' && !!s?.variants)
        && Array.isArray(m.accents)
        && m.accents.every(a =>
            typeof a?.file === 'string'
            && Array.isArray(a?.footprint) && a.footprint.length === 2
            && Array.isArray(a?.tiers)
            && Array.isArray(a?.styles))
}

/** Returns the validated manifest, or null while loading / on failure. */
export function useManifest(): Manifest | null {
    const [manifest, setManifest] = useState<Manifest | null>(null)

    useEffect(() => {
        let cancelled = false
        fetch(MANIFEST_URL)
            .then(r => r.json())
            .then(data => {
                if (cancelled) return
                if (isManifest(data)) setManifest(data)
                else console.error('[flat-board-tiles] invalid manifest.json', data)
            })
            .catch(e => console.error('[flat-board-tiles] failed to load manifest.json', e))
        return () => { cancelled = true }
    }, [])

    return manifest
}
