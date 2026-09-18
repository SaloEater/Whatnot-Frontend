'use client'

// Dispatches to the per-kind widget-settings component for a registry entry. These settings are
// not part of LayoutConfig — they save immediately to their own endpoints, same as
// src/app/channel/[id]/widgets/page.tsx did before this builder replaced it.
//
// Table-driven (obs-layout-adding-elements-plan.md §B) rather than a `switch`: the old switch's
// `default: "No settings."` meant a registry id missing a case looked intentional instead of
// forgotten (see the plan's "soft spot" table). `SETTINGS_PANELS satisfies Record<RegistryId, …>`
// makes a missing id a compile error instead — every id must appear, `null` where there is
// deliberately no panel.

import type {ReactElement} from 'react'
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
import PriceRangesSettings from './PriceRangesSettings'

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

type SettingsRenderer = (p: Props) => ReactElement

// All three wrap builds share one config shape (target/pad/laneFontSize/speed/holdMs), so they
// share one settings panel — see registry.ts's notes on the parallel builds. A shared constant
// rather than three copies of the same arrow.
const wrapSettings: SettingsRenderer = ({elementKey, element, config, currentPhase, onPatchElement}) => (
    <StashOrPassWrapSettings
        elementKey={elementKey}
        element={element}
        config={config}
        currentPhase={currentPhase}
        onPatchElement={onPatchElement}
    />
)

// Every registry id must appear — `null` is an explicit "no settings" decision, not a fall-through
// (obs-layout-adding-elements-plan.md §B). The `satisfies Record<RegistryId, …>` below is what
// fails to compile when a new registry id is added without deciding this either way.
const SETTINGS_PANELS = {
    'board:flat': null,
    'board:classic': null,
    // Shares one settings panel with `board:cobra_flat` (cobra-flat-board-plan.md §6): the tier
    // thresholds are channel-wide, and are the only setting either board reads. The "Side Cards
    // Price" card the panel also carries is irrelevant to cobra_flat but harmless.
    'board:cobra': ({channelId, seriesId, onFireCue}) => <CobraBoardSettings channelId={channelId} seriesId={seriesId} onFireCue={onFireCue}/>,
    'board:cobra_flat': ({channelId, seriesId, onFireCue}) => <CobraBoardSettings channelId={channelId} seriesId={seriesId} onFireCue={onFireCue}/>,
    'widget:pick2': ({channelId, onFireCue}) => <Pick2Settings channelId={channelId} onFireCue={onFireCue}/>,
    'widget:stashorpass': ({channelId, onFireCue}) => <StashOrPassSettings channelId={channelId} onFireCue={onFireCue}/>,
    'widget:name': ({seriesId, onFireCue}) => <NameSettings seriesId={seriesId} onFireCue={onFireCue}/>,
    'widget:boxesPerBreak': ({seriesId, onFireCue}) => <BoxesPerBreakSettings seriesId={seriesId} onFireCue={onFireCue}/>,
    // boxesLeft has no settings of its own — falls to "No settings.".
    'widget:boxesLeft': null,
    // The "show percentage" setting is channel-wide and only affects the chasersLeft display
    // (obs-layout-plan.md §2.7).
    'widget:chasersLeft': ({channelId, elementKey, seriesId, onFireCue}) => (
        <CountSettings channelId={channelId} elementKey={elementKey} seriesId={seriesId} onFireCue={onFireCue}/>
    ),
    results: ({elementKey, element, onPatchElement}) => <ResultsSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>,
    resultsThin: ({elementKey, element, onPatchElement}) => <ThinResultsSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>,
    cards: ({channelId, elementKey, onFireCue, onEmitCue}) => (
        <CardsSettings channelId={channelId} elementKey={elementKey} onFireCue={onFireCue} onEmitCue={onEmitCue}/>
    ),
    ripbar: null,
    reserved: null,
    'frame:static': ({elementKey, element, currentPhase, onPatchElement}) => (
        <FrameSettings elementKey={elementKey} element={element} currentPhase={currentPhase} onPatchElement={onPatchElement}/>
    ),
    'animation:stashOrPassWrap': wrapSettings,
    'animation:stashOrPassWrapTl': wrapSettings,
    'animation:stashOrPassWrapRing': wrapSettings,
    text: ({elementKey, element, onPatchElement}) => <TextSettings elementKey={elementKey} element={element} onPatchElement={onPatchElement}/>,
    'image-box': ({elementKey, element, channelId, currentPhase, onPatchElement}) => (
        <ImageBoxSettings
            elementKey={elementKey}
            element={element}
            channelId={channelId}
            currentPhase={currentPhase}
            onPatchElement={onPatchElement}
        />
    ),
    priceRanges: ({elementKey, element, onPatchElement, seriesId, onFireCue}) => (
        <PriceRangesSettings
            elementKey={elementKey}
            element={element}
            onPatchElement={onPatchElement}
            seriesId={seriesId}
            onFireCue={onFireCue}
        />
    ),
} satisfies Record<RegistryId, SettingsRenderer | null>

export default function ElementSettings(props: Props) {
    const render = SETTINGS_PANELS[props.registryId]
    return render ? render(props) : <div className="text-secondary small">No settings.</div>
}
