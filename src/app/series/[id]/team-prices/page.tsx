'use client'

import React, {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {getEndpoints, get, post} from "@/app/lib/backend";
import {SeriesTeamPrice} from "@/app/entity/entities";
import {Teams} from "@/app/common/teams";

const MAX_RECENT = 5

export default function Page({params}: {params: {id: string}}) {
    const seriesId = parseInt(params.id)
    const router = useRouter()

    const [prices, setPrices] = useState<Record<string, string>>(() =>
        Object.fromEntries(Teams.map((t) => [t, '0']))
    )
    const [recentPrices, setRecentPrices] = useState<number[]>([])
    const [focusedTeam, setFocusedTeam] = useState<string | null>(null)
    const [savedTeam, setSavedTeam] = useState<string | null>(null)

    const inputRefs = useRef<(HTMLInputElement | null)[]>([])
    const mobileInputRefs = useRef<(HTMLInputElement | null)[]>([])
    const serverPrices = useRef<Record<string, number>>({})

    useEffect(() => {
        const fetchCurrent = post(getEndpoints().series_team_prices, {series_id: seriesId})
        const fetchLast = get(getEndpoints().series_team_price_last_prices)

        fetchCurrent.then((data: SeriesTeamPrice[]) => {
            if (!data) return
            data.forEach((p) => { serverPrices.current[p.team] = p.price })
            setPrices((old) => {
                const next = {...old}
                data.forEach((p) => { next[p.team] = String(p.price) })
                return next
            })
        })

        Promise.all([fetchCurrent, fetchLast]).then(([current, last]) => {
            const currentPrices: number[] = (current ?? []).map((p: SeriesTeamPrice) => p.price)
            const lastPrices: number[] = last ?? []
            const combined = Array.from(new Set([...currentPrices, ...lastPrices]))
                .filter((p) => p > 0)
                .sort((a, b) => a - b)
            setRecentPrices(combined)
        })
    }, [])

    function addRecent(price: number) {
        setRecentPrices((old) => {
            const filtered = old.filter((p) => p !== price)
            return [price, ...filtered].slice(0, MAX_RECENT)
        })
    }

    function savePrice(team: string, value: string, thenFocusNext?: boolean) {
        const price = parseFloat(value)
        if (isNaN(price)) return
        if (price > 0) addRecent(price)
        if (price === serverPrices.current[team]) {
            if (thenFocusNext) focusNext(team)
            return
        }
        post(getEndpoints().series_team_price_set, {series_id: seriesId, team, price}).then(() => {
            serverPrices.current[team] = price
            setSavedTeam(team)
            setTimeout(() => setSavedTeam(null), 1000)
            if (thenFocusNext) focusNext(team)
        })
    }

    function focusNext(team: string) {
        const idx = Teams.indexOf(team)
        const desktop = inputRefs.current[idx + 1]
        const mobile = mobileInputRefs.current[idx + 1]
        if (desktop && desktop.offsetParent !== null) {
            desktop.focus()
        } else if (mobile) {
            mobile.focus()
        }
    }

    function applyRecent(price: number) {
        if (!focusedTeam) return
        const value = String(price)
        setPrices((old) => ({...old, [focusedTeam]: value}))
        savePrice(focusedTeam, value, true)
    }

    return (
        <main className="container py-3">
            <div className="d-flex align-items-center gap-3 mb-3">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => router.back()}>← Back</button>
                <h4 className="mb-0">Team Prices</h4>
            </div>

            {/* Mobile: single table, input stacked under team name */}
            <div className="d-md-none">
                <table className="table table-sm table-dark w-100">
                    <tbody>
                        {Teams.map((team) => {
                            const idx = Teams.indexOf(team)
                            return (
                            <tr key={team}>
                                <td className="align-top pt-2 pe-2" style={{width: '40px'}}>
                                    <img
                                        src={`/images/teams/${team}.webp`}
                                        alt={team}
                                        style={{width: '32px', height: '32px', objectFit: 'contain'}}
                                    />
                                </td>
                                <td>
                                    <div className="mb-1">{team}</div>
                                    <div className="d-flex align-items-center gap-1">
                                        <input
                                            ref={(el) => { mobileInputRefs.current[idx] = el }}
                                            type="number"
                                            min="0"
                                            step="1"
                                            className="form-control form-control-sm"
                                            value={prices[team]}
                                            onChange={(e) => setPrices((old) => ({...old, [team]: e.target.value}))}
                                            onFocus={() => setFocusedTeam(team)}
                                            onBlur={() => {
                                                savePrice(team, prices[team])
                                                setFocusedTeam(null)
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') savePrice(team, prices[team], true)
                                            }}
                                        />
                                        {savedTeam === team && (
                                            <span style={{color: 'limegreen', flexShrink: 0}}>✓</span>
                                        )}
                                    </div>
                                    {focusedTeam === team && recentPrices.length > 0 && (
                                        <div className="d-flex flex-wrap gap-1 pt-1">
                                            {[...recentPrices].sort((a, b) => a - b).map((p) => (
                                                <button
                                                    key={p}
                                                    className="btn btn-sm btn-outline-primary"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => applyRecent(p)}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>

            {/* Desktop: two half-tables side by side */}
            <div className="d-none d-md-flex justify-content-center gap-4">
                {[Teams.slice(0, 16), Teams.slice(16)].map((half, halfIdx) => (
                    <table key={halfIdx} className="table table-sm table-dark" style={{width: 'auto'}}>
                        <tbody>
                            {half.map((team) => {
                                const idx = Teams.indexOf(team)
                                return (
                                    <tr key={team}>
                                        <td className="align-middle">{team}</td>
                                        <td className="align-middle px-2">
                                            <img
                                                src={`/images/teams/${team}.webp`}
                                                alt={team}
                                                style={{width: '32px', height: '32px', objectFit: 'contain'}}
                                            />
                                        </td>
                                        <td style={{width: '120px'}}>
                                            <div className="d-flex align-items-center gap-1">
                                                <input
                                                    ref={(el) => { inputRefs.current[idx] = el }}
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    className="form-control form-control-sm"
                                                    value={prices[team]}
                                                    onChange={(e) => setPrices((old) => ({...old, [team]: e.target.value}))}
                                                    onFocus={() => setFocusedTeam(team)}
                                                    onBlur={() => {
                                                        savePrice(team, prices[team])
                                                        setFocusedTeam(null)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') savePrice(team, prices[team], true)
                                                    }}
                                                />
                                                {savedTeam === team && (
                                                    <span style={{color: 'limegreen', flexShrink: 0}}>✓</span>
                                                )}
                                            </div>
                                            {focusedTeam === team && recentPrices.length > 0 && (
                                                <div className="d-flex gap-1 pt-1">
                                                    {[...recentPrices].sort((a, b) => a - b).map((p) => (
                                                        <button
                                                            key={p}
                                                            className="btn btn-sm btn-outline-primary"
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => applyRecent(p)}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                ))}
            </div>
        </main>
    )
}
