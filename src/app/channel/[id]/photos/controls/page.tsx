'use client'

import React, {useState} from 'react'
import {Photo} from '@/app/entity/entities'
import {usePhotoBoard} from '../usePhotoBoard'

const CARD_SIZE_KEY = 'photos-controls-card-size'

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const {photos, markSold} = usePhotoBoard(channelId, true)

    const [cardSize, setCardSize] = useState(() => {
        if (typeof localStorage === 'undefined') return 70
        const stored = localStorage.getItem(CARD_SIZE_KEY)
        return stored ? parseInt(stored) : 70
    })

    function updateCardSize(size: number) {
        setCardSize(size)
        localStorage.setItem(CARD_SIZE_KEY, String(size))
    }

    const unsold = photos.filter((p) => !p.is_sold && !p.is_deleted)
    const sold   = photos.filter((p) =>  p.is_sold && !p.is_deleted)

    function renderCard(photo: Photo) {
        return (
            <div key={photo.id} style={{
                width: `${cardSize}px`,
                flexShrink: 0,
                padding: '3px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '4px',
            }}>
                <div
                    className="position-relative"
                    style={{cursor: 'pointer'}}
                    onClick={() => markSold(photo.id, !photo.is_sold)}
                >
                    <img
                        src={photo.url}
                        alt={photo.name || 'card'}
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            borderRadius: '2px',
                            opacity: photo.is_sold ? 0.4 : 1,
                        }}
                    />
                    {photo.is_sold && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(128,128,128,0.4)',
                            pointerEvents: 'none',
                        }} />
                    )}
                </div>
            </div>
        )
    }

    return (
        <main className="container-fluid py-3">
            <div className="d-flex align-items-center gap-3 mb-3" style={{maxWidth: '300px'}}>
                <label className="text-nowrap small">Size: {cardSize}px</label>
                <input
                    type="range"
                    className="form-range"
                    min={40}
                    max={500}
                    value={cardSize}
                    onChange={(e) => updateCardSize(parseInt(e.target.value))}
                />
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center'}}>
                {unsold.map((p) => renderCard(p))}
                {sold.map((p) => renderCard(p))}
            </div>
        </main>
    )
}
