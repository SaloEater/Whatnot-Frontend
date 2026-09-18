'use client'

// Per-element error boundary for the layout stage (obs-layout-disappearing-elements-findings.md
// fix #3). A class component is the only option here — `static getDerivedStateFromError` /
// `componentDidCatch` have no hooks equivalent; there is no way to catch a render-time throw from
// inside a function component.
//
// Deliberately scoped to ONE element (LayoutStageContent wraps each element's
// <ElementFrame>…<Component/></ElementFrame> individually) rather than once around the whole
// <Stage>. A boundary's fallback replaces its entire subtree on error, so the boundary IS the
// blast radius: one boundary around everything would mean a single bad registry component still
// takes every OTHER element down with it — exactly the "whole page blanks, no recovery" gap
// obs-layout-disappearing-elements-findings.md's "Also noted" section flagged. Per-element, only
// that one element disappears and its neighbours keep rendering.
//
// The fallback is nothing — no message, no border, no placeholder box. This renders inside OBS as
// a browser source in front of a live audience; a visible error UI is never acceptable there, only
// silently dropping the one broken element is.
import {Component, ReactNode} from 'react'

interface Props {
    children: ReactNode
    // Named only for the console.error below — which element crashed, in the operator's own
    // config vocabulary (the element's key in config.elements), not React's internal component
    // name.
    elementKey: string
    // Whatever identifies "this element's current config" to the caller — LayoutStageContent
    // passes the element object itself. A config push (or a bus payload, or the reconcile poll)
    // that changes this element produces a new object, so getDerivedStateFromProps below clears
    // `hasError` the moment one arrives: a fix pushed from the controls page recovers the element
    // on its own, instead of it staying blank until someone reloads the browser source.
    resetKey: unknown
}

interface State {
    hasError: boolean
    resetKey: unknown
}

export class ElementErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = {hasError: false, resetKey: props.resetKey}
    }

    static getDerivedStateFromError(): Partial<State> {
        return {hasError: true}
    }

    // Runs on every render, including the one right after getDerivedStateFromError set hasError —
    // guarded by the resetKey comparison so it only clears the error when the caller actually
    // handed us a NEW resetKey, never merely because the component re-rendered.
    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        if (props.resetKey !== state.resetKey) {
            return {hasError: false, resetKey: props.resetKey}
        }
        return null
    }

    componentDidCatch(error: unknown): void {
        console.error(`[obs/layout] element "${this.props.elementKey}" crashed`, error)
    }

    render(): ReactNode {
        if (this.state.hasError) return null
        return this.props.children
    }
}
