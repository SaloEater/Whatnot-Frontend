'use client'

// Dispatches to the per-kind widget-settings component for a registry entry. These settings are
// not part of LayoutConfig — they save immediately to their own endpoints, same as
// src/app/channel/[id]/widgets/page.tsx did before this builder replaced it.

import type {RegistryId} from '@/app/obs/layout/registry'
import type {Element, LayoutConfig, Phase} from '@/app/obs/layout/schema'
import type {PatchElement} from './ElementBlock'
import Pick2Settings from './Pick2Settings'
import StashOrPassSettings from './StashOrPassSettings'
import BoxesPerBreakSettings from './BoxesPerBreakSettings'
import CountSettings from './CountSettings'
import CardsSettings from './CardsSettings'
import CobraBoardSettings from './CobraBoardSettings'
import FrameSettings from './FrameSettings'
import StashOrPassWrapSettings from './StashOrPassWrapSettings'
import ResultsSettings from './ResultsSettings'
import ThinResultsSettings from './ThinResultsSettings'

type Props = {
    registryId: RegistryId
    channelId: number
    seriesId?: number | null
    elementKey: string
    element: Element
    currentPhase: Phase
    config: LayoutConfig
    onPatchElement: PatchElement
}

export default function ElementSettings({registryId, channelId, seriesId, elementKey, element, currentPhase, config, onPatchElement}: Props) {
    switch (registryId) {
        case 'widget:pick2':
            return <Pick2Settings channelId={channelId}/>
        case 'widget:stashorpass':
            return <StashOrPassSettings channelId={channelId}/>
        case 'widget:boxesPerBreak':
            return <BoxesPerBreakSettings seriesId={seriesId}/>
        case 'widget:count':
            return <CountSettings channelId={channelId} elementKey={elementKey}/>
        case 'cards':
            return <CardsSettings channelId={channelId} elementKey={elementKey}/>
        case 'board:cobra':
            return <CobraBoardSettings channelId={channelId}/>
        case 'frame:static':
            return <FrameSettings elementKey={elementKey} element={element} currentPhase={currentPhase} onPatchElement={onPatchElement}/>
        case 'results':
            return <ResultsSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>
        case 'resultsThin':
            return <ThinResultsSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>
        case 'animation:stashOrPassWrap':
            return (
                <StashOrPassWrapSettings
                    elementKey={elementKey}
                    element={element}
                    config={config}
                    onPatchElement={onPatchElement}
                />
            )
        default:
            return <div className="text-secondary small">No settings.</div>
    }
}
