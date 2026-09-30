// Which frame a card gets (card-frames-plan.md §2/decision 4). Thresholds are read from the channel's
// price ranges exactly as SportStyleBoard does (`tier_id` -> `price_from`, same fallbacks).
// ASSUMPTIONS awaiting user confirmation: (1) mapping best -> gold, good -> silver, mid -> bronze,
// regular -> bare; (2) the value compared is the photo's own `price`.

import type { PriceRange } from '@/app/entity/entities'
import { BEST_THRESHOLD, GOOD_THRESHOLD, MID_THRESHOLD } from '../board-cobra/pricing'
import type { FrameTier } from './frameAssets'

export function frameTierFor(price: number, ranges: PriceRange[]): FrameTier | null {
    const best = ranges.find((r) => r.tier_id === 'best')?.price_from ?? BEST_THRESHOLD
    const good = ranges.find((r) => r.tier_id === 'good')?.price_from ?? GOOD_THRESHOLD
    const mid = ranges.find((r) => r.tier_id === 'mid')?.price_from ?? MID_THRESHOLD
    if (price >= best) return 'gold'
    if (price >= good) return 'silver'
    if (price >= mid) return 'bronze'
    return null
}
