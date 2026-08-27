'use client'

// The ONLY backend poller in the layout system. Every registry component reads its data through
// `useLayoutData()` instead of fetching for itself. See obs-layout-plan.md §1.3.
//
// Always-on chain (mirrors obs/[id]/page.tsx + hooks/useActiveStream.ts, written fresh — those
// hooks leak intervals / don't re-arm cleanly for this use):
//   channel_get 30s -> stream_get 20s -> break_get 30s -> break_events 5s
// On-demand sources are enabled only when `config.elements` contains something that needs them,
// so mounting more registry components never adds more network traffic than the config declares.

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import {
    CardsBoardSettings,
    CircleWidgetValue,
    CountSettings,
    Event,
    GetEventsByBreakResponse,
    Photo,
    PriceRange,
    Series,
    SeriesTeamTotal,
    SeriesWithCount,
    WNBreak,
    WNChannel,
    WNStream,
} from '@/app/entity/entities'
import {get, getEndpoints, post, seriesPricesEndpoint} from '@/app/lib/backend'
import type {LayoutConfig} from './schema'
import {useCueBus} from './cueBus'

// ---- shape derivation from config -----------------------------------------------------------

type Needs = {
    needsCobra: boolean
    needsSeries: boolean
    needsCount: boolean
    needsPick2: boolean
    needsStashOrPass: boolean
    needsBoxesPerBreak: boolean
    needsCards: boolean
}

function deriveNeeds(config: LayoutConfig): Needs {
    let needsCobra = false
    let needsName = false
    let needsCount = false
    let needsPick2 = false
    let needsStashOrPass = false
    let needsBoxesPerBreak = false
    let needsCards = false

    for (const element of Object.values(config.elements)) {
        if (element.kind === 'board' && element.variant === 'cobra') needsCobra = true
        if (element.kind === 'cards') needsCards = true
        if (element.kind === 'widget') {
            if (element.widget === 'name') needsName = true
            if (element.widget === 'count') needsCount = true
            if (element.widget === 'pick2') needsPick2 = true
            if (element.widget === 'stashorpass') needsStashOrPass = true
            if (element.widget === 'boxesPerBreak') needsBoxesPerBreak = true
        }
    }

    return {
        needsCobra,
        needsSeries: needsCobra || needsName,
        needsCount,
        needsPick2,
        needsStashOrPass,
        needsBoxesPerBreak,
        needsCards,
    }
}

// `post()`/`get()` never throw for HTTP/network failures — they resolve `{error}` instead
// (lib/backend.ts `handleResponse`/catch block). Every setter below must refuse that shape so a
// backend hiccup can't clobber good state with `{error: ...}`.
function isErrorResponse(v: unknown): boolean {
    return typeof v === 'object' && v !== null && 'error' in (v as Record<string, unknown>)
}

// ---- context shape ----------------------------------------------------------------------------

export type LayoutData = {
    // Exposed mainly so sceneEventBus.tsx's `useSceneEvent()` can look up an element's current
    // `reactions` — components normally read data through the fields below, not this.
    config: LayoutConfig
    channel: WNChannel | null
    stream: WNStream | null
    breakObject: WNBreak | null
    events: Event[]
    series: Series | null
    priceRanges: PriceRange[]
    teamPrices: SeriesTeamTotal[]
    seriesCount: SeriesWithCount | null
    pick2: CircleWidgetValue | null
    stashorpass: CircleWidgetValue | null
    boxesPerBreak: CircleWidgetValue | null
    countSettings: CountSettings | null
    photos: Photo[]
    cardsBoardSettings: CardsBoardSettings | null
    lastFetched: Record<string, number>
    refetch: (key: string) => void
}

const LayoutDataContext = createContext<LayoutData | null>(null)

export function useLayoutData(): LayoutData {
    const ctx = useContext(LayoutDataContext)
    if (!ctx) {
        throw new Error('useLayoutData() must be used within a <LayoutDataProvider>')
    }
    return ctx
}

// ---- provider -----------------------------------------------------------------------------

export function LayoutDataProvider({
    channelId,
    config,
    children,
}: {
    channelId: number
    config: LayoutConfig
    children: ReactNode
}) {
    const [channel, setChannel] = useState<WNChannel | null>(null)
    const [stream, setStream] = useState<WNStream | null>(null)
    const [breakObject, setBreakObject] = useState<WNBreak | null>(null)
    const [events, setEvents] = useState<Event[]>([])
    const [series, setSeries] = useState<Series | null>(null)
    const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
    const [teamPrices, setTeamPrices] = useState<SeriesTeamTotal[]>([])
    const [seriesCount, setSeriesCount] = useState<SeriesWithCount | null>(null)
    const [pick2, setPick2] = useState<CircleWidgetValue | null>(null)
    const [stashorpass, setStashOrPass] = useState<CircleWidgetValue | null>(null)
    const [boxesPerBreak, setBoxesPerBreak] = useState<CircleWidgetValue | null>(null)
    const [countSettings, setCountSettings] = useState<CountSettings | null>(null)
    const [photos, setPhotos] = useState<Photo[]>([])
    const [cardsBoardSettings, setCardsBoardSettings] = useState<CardsBoardSettings | null>(null)
    const [lastFetched, setLastFetched] = useState<Record<string, number>>({})

    const touch = useCallback((key: string) => {
        setLastFetched((prev) => ({...prev, [key]: Date.now()}))
    }, [])

    // Populated by each source's effect with its own current fetch closure, so `refetch(key)`
    // (used by cues) always triggers a fetch with up-to-date ids without re-deriving them here.
    const fetchersRef = useRef<Record<string, () => void>>({})
    const refetch = useCallback((key: string) => {
        fetchersRef.current[key]?.()
    }, [])

    const needs = useMemo(() => deriveNeeds(config), [config])

    const channelIdRef = channelId
    const activeStreamId = channel?.active_stream_id ?? null
    const activeBreakId = stream?.active_break_id ?? null
    const seriesId = breakObject?.series_id ?? null

    // channel_get, 30s
    useEffect(() => {
        const fetchers = fetchersRef.current
        let cancelled = false
        function fetchChannel() {
            post(getEndpoints().channel_get, {id: channelIdRef}).then((resp: WNChannel) => {
                if (cancelled || !resp || isErrorResponse(resp)) return
                setChannel(resp)
                touch('channel')
            })
        }
        fetchers['channel'] = fetchChannel
        fetchChannel()
        const id = setInterval(fetchChannel, 30000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['channel']
        }
    }, [channelIdRef, touch])

    // stream_get, 20s — re-armed whenever the channel's active stream changes
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!activeStreamId) {
            setStream(null)
            return
        }
        let cancelled = false
        function fetchStream() {
            post(getEndpoints().stream_get, {id: activeStreamId}).then((resp: WNStream) => {
                if (cancelled || !resp || isErrorResponse(resp)) return
                setStream(resp)
                touch('stream')
            })
        }
        fetchers['stream'] = fetchStream
        fetchStream()
        const id = setInterval(fetchStream, 20000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['stream']
        }
    }, [activeStreamId, touch])

    // break_get, 30s — re-armed whenever the stream's active break changes
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!activeBreakId) {
            setBreakObject(null)
            return
        }
        let cancelled = false
        function fetchBreak() {
            post(getEndpoints().break_get, {id: activeBreakId}).then((resp: WNBreak) => {
                if (cancelled || !resp || isErrorResponse(resp)) return
                setBreakObject(resp)
                touch('breakObject')
            })
        }
        fetchers['breakObject'] = fetchBreak
        fetchBreak()
        const id = setInterval(fetchBreak, 30000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['breakObject']
        }
    }, [activeBreakId, touch])

    // break_events, 5s — same key as above
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!activeBreakId) {
            setEvents([])
            return
        }
        let cancelled = false
        function fetchEvents() {
            post(getEndpoints().break_events, {break_id: activeBreakId}).then(
                (resp: GetEventsByBreakResponse) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setEvents(resp.events ?? [])
                    touch('events')
                }
            )
        }
        fetchers['events'] = fetchEvents
        fetchEvents()
        const id = setInterval(fetchEvents, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['events']
        }
    }, [activeBreakId, touch])

    // series_get, on break/series change only (cobra board and the `name` widget both just need
    // the current series object; neither needs it fresher than "whenever the break changes").
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsSeries || !seriesId) {
            setSeries(null)
            return
        }
        let cancelled = false
        function fetchSeries() {
            post(getEndpoints().series_get, {id: seriesId}).then((resp: Series) => {
                if (cancelled || !resp || isErrorResponse(resp)) return
                setSeries(resp)
                touch('series')
            })
        }
        fetchers['series'] = fetchSeries
        fetchSeries()
        return () => {
            cancelled = true
            delete fetchers['series']
        }
    }, [needs.needsSeries, seriesId, touch])

    // widget_board_price_ranges_list, on break/series change (cobra only)
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsCobra) {
            setPriceRanges([])
            return
        }
        let cancelled = false
        function fetchRanges() {
            post(getEndpoints().widget_board_price_ranges_list, {channel_id: channelIdRef}).then(
                (resp: {ranges: PriceRange[]}) => {
                    if (cancelled || !resp?.ranges || isErrorResponse(resp)) return
                    setPriceRanges(resp.ranges)
                    touch('priceRanges')
                }
            )
        }
        fetchers['priceRanges'] = fetchRanges
        fetchRanges()
        return () => {
            cancelled = true
            delete fetchers['priceRanges']
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- seriesId re-triggers a refetch
        // even though the request body doesn't use it, matching obs/prices/[id]/cobra/page.tsx.
    }, [needs.needsCobra, channelIdRef, seriesId, touch])

    // seriesPricesEndpoint(series_id) via get(), 60s (cobra only)
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsCobra || !seriesId) {
            setTeamPrices([])
            return
        }
        const currentSeriesId = seriesId
        let cancelled = false
        function fetchPrices() {
            get(seriesPricesEndpoint(currentSeriesId)).then((data: SeriesTeamTotal[]) => {
                if (cancelled || !Array.isArray(data)) return
                setTeamPrices(data)
                touch('teamPrices')
            })
        }
        fetchers['teamPrices'] = fetchPrices
        fetchPrices()
        const id = setInterval(fetchPrices, 60000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['teamPrices']
        }
    }, [needs.needsCobra, seriesId, touch])

    // series_get_with_count, 5s (count widget)
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsCount || !seriesId) {
            setSeriesCount(null)
            return
        }
        let cancelled = false
        function fetchCount() {
            post(getEndpoints().series_get_with_count, {id: seriesId}).then(
                (resp: SeriesWithCount) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setSeriesCount(resp)
                    touch('seriesCount')
                }
            )
        }
        fetchers['seriesCount'] = fetchCount
        fetchCount()
        const id = setInterval(fetchCount, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['seriesCount']
        }
    }, [needs.needsCount, seriesId, touch])

    // widget_pick2_get {channel_id}, 5s
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsPick2) {
            setPick2(null)
            return
        }
        let cancelled = false
        function fetchPick2() {
            post(getEndpoints().widget_pick2_get, {channel_id: channelIdRef}).then(
                (resp: CircleWidgetValue) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setPick2(resp)
                    touch('pick2')
                }
            )
        }
        fetchers['pick2'] = fetchPick2
        fetchPick2()
        const id = setInterval(fetchPick2, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['pick2']
        }
    }, [needs.needsPick2, channelIdRef, touch])

    // widget_stashorpass_get {channel_id}, 5s
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsStashOrPass) {
            setStashOrPass(null)
            return
        }
        let cancelled = false
        function fetchStashOrPass() {
            post(getEndpoints().widget_stashorpass_get, {channel_id: channelIdRef}).then(
                (resp: CircleWidgetValue) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setStashOrPass(resp)
                    touch('stashorpass')
                }
            )
        }
        fetchers['stashorpass'] = fetchStashOrPass
        fetchStashOrPass()
        const id = setInterval(fetchStashOrPass, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['stashorpass']
        }
    }, [needs.needsStashOrPass, channelIdRef, touch])

    // widget_boxes_per_break_get {series_id}, 5s
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsBoxesPerBreak || !seriesId) {
            setBoxesPerBreak(null)
            return
        }
        let cancelled = false
        function fetchBoxesPerBreak() {
            post(getEndpoints().widget_boxes_per_break_get, {series_id: seriesId}).then(
                (resp: CircleWidgetValue) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setBoxesPerBreak(resp)
                    touch('boxesPerBreak')
                }
            )
        }
        fetchers['boxesPerBreak'] = fetchBoxesPerBreak
        fetchBoxesPerBreak()
        const id = setInterval(fetchBoxesPerBreak, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['boxesPerBreak']
        }
    }, [needs.needsBoxesPerBreak, seriesId, touch])

    // widget_channel_count_settings_get {channel_id}, once (count widget)
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsCount) {
            setCountSettings(null)
            return
        }
        let cancelled = false
        function fetchCountSettings() {
            post(getEndpoints().widget_channel_count_settings_get, {channel_id: channelIdRef}).then(
                (resp: CountSettings) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setCountSettings(resp)
                    touch('countSettings')
                }
            )
        }
        fetchers['countSettings'] = fetchCountSettings
        fetchCountSettings()
        return () => {
            cancelled = true
            delete fetchers['countSettings']
        }
    }, [needs.needsCount, channelIdRef, touch])

    // photo_board {channel_id, with_sold:false}, 120s (cards board) — key 'photos' so the
    // `photos-changed` cue (fired after CardsPanel writes, see obs-layout-plan.md §2.6) can
    // force an immediate refresh via refetch('photos').
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsCards) {
            setPhotos([])
            return
        }
        let cancelled = false
        function fetchPhotos() {
            post(getEndpoints().photo_board, {channel_id: channelIdRef, with_sold: false}).then(
                (resp: Photo[]) => {
                    if (cancelled || !Array.isArray(resp)) return
                    setPhotos(resp)
                    touch('photos')
                }
            )
        }
        fetchers['photos'] = fetchPhotos
        fetchPhotos()
        const id = setInterval(fetchPhotos, 120000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['photos']
        }
    }, [needs.needsCards, channelIdRef, touch])

    // widget_cards_board_get {channel_id}, 5s (cards board settings)
    useEffect(() => {
        const fetchers = fetchersRef.current
        if (!needs.needsCards) {
            setCardsBoardSettings(null)
            return
        }
        let cancelled = false
        function fetchCardsBoardSettings() {
            post(getEndpoints().widget_cards_board_get, {channel_id: channelIdRef}).then(
                (resp: CardsBoardSettings) => {
                    if (cancelled || !resp || isErrorResponse(resp)) return
                    setCardsBoardSettings(resp)
                    touch('cardsBoardSettings')
                }
            )
        }
        fetchers['cardsBoardSettings'] = fetchCardsBoardSettings
        fetchCardsBoardSettings()
        const id = setInterval(fetchCardsBoardSettings, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
            delete fetchers['cardsBoardSettings']
        }
    }, [needs.needsCards, channelIdRef, touch])

    // Cues: `photos-changed` forces an immediate photo_board refetch (otherwise it would lag up
    // to 120s after a controls-panel write); the generic `refetch` cue lets any future cue kind
    // target any source key by name.
    const cueBus = useCueBus()
    useEffect(() => {
        return cueBus.subscribe((cue) => {
            if (cue.kind === 'photos-changed') {
                refetch('photos')
            } else if (cue.kind === 'refetch' && typeof cue.key === 'string') {
                refetch(cue.key)
            }
        })
    }, [cueBus, refetch])

    const value: LayoutData = {
        config,
        channel,
        stream,
        breakObject,
        events,
        series,
        priceRanges,
        teamPrices,
        seriesCount,
        pick2,
        stashorpass,
        boxesPerBreak,
        countSettings,
        photos,
        cardsBoardSettings,
        lastFetched,
        refetch,
    }

    return <LayoutDataContext.Provider value={value}>{children}</LayoutDataContext.Provider>
}
