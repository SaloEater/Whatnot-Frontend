'use client'

// Dispatches to the per-kind widget-settings component for a registry entry. These settings are
// not part of LayoutConfig — they save immediately to their own endpoints, same as
// src/app/channel/[id]/widgets/page.tsx did before this builder replaced it.

import type {RegistryId} from '@/app/obs/layout/registry'
import type {DurableCue, Element, LayoutConfig, Phase, TransientCue} from '@/app/obs/layout/schema'
import type {PatchElement} from './ElementBlock'
import Pick2Settings from './Pick2Settings'
import StashOrPassSettings from './StashOrPassSettings'
import BoxesPerBreakSettings from './BoxesPerBreakSettings'
import NameSettings from './NameSettings'
import CountSettings from './CountSettings'
import CardsSettings from './CardsSettings'
import CobraBoardSettings from './CobraBoardSettings'
import FrameSettings from './FrameSettings'
import StashOrPassWrapSettings from './StashOrPassWrapSettings'
import ResultsSettings from './ResultsSettings'
import ThinResultsSettings from './ThinResultsSettings'
import TextSettings from './TextSettings'
import ImageBoxSettings from './ImageBoxSettings'

type Props = {
    registryId: RegistryId
    channelId: number
    seriesId?: number | null
    elementKey: string
    element: Element
    currentPhase: Phase
    config: LayoutConfig
    onPatchElement: PatchElement
    // Lets a settings panel push a cue through the same state-update path the Actions strip uses
    // (obs-layout-plan.md §2.8). Every panel that writes to the backend gets this so it can push
    // an immediate spine refetch as part of saving (see useSettingWrite.ts) rather than leaving
    // OBS to catch up on the spine's own poll.
    onFireCue?: (cue: DurableCue) => void
    onEmitCue?: (cue: TransientCue) => void
}

export default function ElementSettings({registryId, channelId, seriesId, elementKey, element, currentPhase, config, onPatchElement, onFireCue, onEmitCue}: Props) {
    switch (registryId) {
        case 'widget:pick2':
            return <Pick2Settings channelId={channelId} onFireCue={onFireCue}/>
        case 'widget:stashorpass':
            return <StashOrPassSettings channelId={channelId} onFireCue={onFireCue}/>
        case 'widget:boxesPerBreak':
            return <BoxesPerBreakSettings seriesId={seriesId} onFireCue={onFireCue}/>
        case 'widget:name':
            return <NameSettings seriesId={seriesId} onFireCue={onFireCue}/>
        // The "show percentage" setting is channel-wide and only affects the chasersLeft
        // display (obs-layout-plan.md §2.7) — boxesLeft has no settings of its own, so it falls
        // through to the "No settings." default below.
        case 'widget:chasersLeft':
            return <CountSettings channelId={channelId} elementKey={elementKey} seriesId={seriesId} onFireCue={onFireCue}/>
        case 'cards':
            return <CardsSettings channelId={channelId} elementKey={elementKey} onFireCue={onFireCue} onEmitCue={onEmitCue}/>
        case 'board:cobra':
            return <CobraBoardSettings channelId={channelId} seriesId={seriesId} onFireCue={onFireCue}/>
        case 'frame:static':
            return <FrameSettings elementKey={elementKey} element={element} currentPhase={currentPhase} onPatchElement={onPatchElement}/>
        case 'results':
            return <ResultsSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>
        case 'resultsThin':
            return <ThinResultsSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>
        case 'text':
            return <TextSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>
        case 'image-box':
            return (
                <ImageBoxSettings
                    elementKey={elementKey}
                    element={element}
                    channelId={channelId}
                    currentPhase={currentPhase}
                    onPatchElement={onPatchElement}
                />
            )
        // All three wrap builds share one config shape (target/pad/laneFontSize/speed/holdMs), so
        // they share one settings panel — see registry.ts's notes on the parallel builds.
        case 'animation:stashOrPassWrap':
        case 'animation:stashOrPassWrapTl':
        case 'animation:stashOrPassWrapRing':
            return (
                <StashOrPassWrapSettings
                    elementKey={elementKey}
                    element={element}
                    config={config}
                    currentPhase={currentPhase}
                    onPatchElement={onPatchElement}
                />
            )
        default:
            return <div className="text-secondary small">No settings.</div>
    }
}
