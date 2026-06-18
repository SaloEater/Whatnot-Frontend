'use client'
import {useState, useEffect} from 'react'
import {Photo} from '@/app/entity/entities'
import {getEndpoints, post} from '@/app/lib/backend'

export function usePhotoBoard(channelId: number) {
    const [photos, setPhotos] = useState<Photo[]>([])

    function fetchPhotos() {
        post(getEndpoints().photo_board, {channel_id: channelId})
            .then((data: Photo[]) => { if (data) setPhotos(data) })
    }

    useEffect(() => {
        fetchPhotos()
        const id = setInterval(fetchPhotos, 120000)
        return () => clearInterval(id)
    }, [channelId])

    function markSold(photoId: number, sold: boolean) {
        const snapshot = photos
        setPhotos((old) => old.map((p) => p.id === photoId ? {...p, is_sold: sold} : p))
        post(getEndpoints().photo_mark_sold, {id: photoId, sold})
            .catch(() => setPhotos(snapshot))
    }

    return {photos, markSold}
}
