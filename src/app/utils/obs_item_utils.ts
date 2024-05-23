import {RawObsItem} from "@/app/entity/entities";

export const RawObsItemTypeImage = 'image_source'
export const RawObsItemTypeMedia = 'ffmpeg_source'

export function filterOnlyType(items: RawObsItem[], type: string) {
    return items.filter(i => i.inputKind == type)
}