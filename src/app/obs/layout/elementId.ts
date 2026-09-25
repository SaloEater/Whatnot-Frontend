// `registryIdOf(element)`: pure derivation of an element's RegistryId from its kind plus
// variant/widget/animation. Moved out of registry.ts (obs-layout-adding-elements-plan.md §A.1) so
// useLayoutData.tsx and needs.ts can call it at runtime WITHOUT importing registry.ts: registry.ts
// imports every element component, and those import useLayoutData.tsx, so useLayoutData.tsx
// importing registry.ts back would be a cycle. This module has no runtime imports of its own — only
// `RegistryId`, imported as a type (erased at compile, not a runtime dependency) — so anything can
// import it safely. `registry.ts` re-exports this function so every existing
// `import {registryIdOf} from '.../registry'` keeps resolving unchanged.
import type { Element } from './schema'
import type { RegistryId } from './registry'

export function registryIdOf(element: Element): RegistryId {
    switch (element.kind) {
        case 'board':
            return `board:${element.variant}` as RegistryId
        case 'widget':
            return `widget:${element.widget}` as RegistryId
        case 'results':
            return 'results'
        case 'resultsThin':
            return 'resultsThin'
        case 'cards':
            return 'cards'
        case 'ripbar':
            return 'ripbar'
        case 'reserved':
            return 'reserved'
        case 'frame':
            return `frame:${element.variant}` as RegistryId
        case 'animation':
            return `animation:${element.animation}` as RegistryId
        case 'text':
            return 'text'
        case 'imageBox':
            return 'image-box'
        case 'priceRanges':
            return 'priceRanges'
        case 'priceSign':
            return 'priceSign'
        case 'scene':
            return 'scene'
        case 'ticker':
            return 'ticker'
        case 'cameraShelf':
            return 'cameraShelf'
        case 'obsToggle':
            return 'obsToggle'
        default: {
            const _exhaustive: never = element
            throw new Error(`registryIdOf: unhandled element ${JSON.stringify(_exhaustive)}`)
        }
    }
}
