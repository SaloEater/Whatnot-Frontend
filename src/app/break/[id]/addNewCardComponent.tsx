import {Event, GiveawayTypePack, GiveawayTypeSlab} from "@/app/entity/entities";
import Image from "next/image";
import {TextInput} from "@/app/common/textInput";
import React, {FC, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import OrderChangingComponent from "@/app/break/[id]/orderChangingComponent";
import './eventComponent.css'
import SwapComponent from "@/app/break/[id]/swapComponent";
import {TextInputWithSuggestions} from "@/app/common/textInputWithSuggestions";

interface AddNewCardProps {
    addNewCard: (event: Event) => void
    events: Event[]
}

const NEW_CARD_TYPE_NONE = 0
const NEW_CARD_TYPE_MISCELLANEOUS = 1
const TYPE_NAMES = ['', 'Miscellaneous']

export const AddNewCardComponent: FC<AddNewCardProps> = (props) => {
    const [newType, setNewType] = useState(NEW_CARD_TYPE_NONE)

    function getImageSrc() {
        return `/images/plus.png`;
    }

    let borderColor = 'border-primary'

    function createNewCard(newType: number) {
        if (newType == NEW_CARD_TYPE_NONE) {
            return
        }

        props.addNewCard({
            break_id: 0,
            customer: "",
            giveaway_type: 0,
            id: 0,
            index: 0,
            is_giveaway: false,
            note: "",
            price: 0,
            quantity: 0,
            team: getNewTypeName(newType)
        })
    }

    function getNewTypeName(newType: number) {
        if (newType == NEW_CARD_TYPE_MISCELLANEOUS) {
            return 'Miscellaneous'
        }
        return 'Select type'
    }

    function switchType(nextNewType: number) {
        setNewType(nextNewType)
    }

    function getTypeName(newType: number) {
        return TYPE_NAMES[newType]
    }

    function getAvailableTypes(): number[] {
        let isMiscellaneousExist = props.events.find(e => e.team == TYPE_NAMES[NEW_CARD_TYPE_MISCELLANEOUS]) != undefined
        let types = []

        if (!isMiscellaneousExist) {
            types.push(NEW_CARD_TYPE_MISCELLANEOUS)
        }

        return types
    }

    let availableTypes = getAvailableTypes()

    if (availableTypes.length == 0) {
        return null
    }

    return (
        <div className={`w-125p position-relative border border-1 rounded rounded-3 ${borderColor}`} >
            <div style={{opacity: 1}} className={'h-100 d-flex justify-content-center align-content-center'}>
                <div className='w-100p d-flex flex-column justify-content-center align-items-center p-1'>
                    {newType != NEW_CARD_TYPE_NONE && <Image src={getImageSrc()} alt={"Add new"} height="75" width="75"
                                                             onClick={_ => createNewCard(newType)}/>}
                    <div className="dropdown p-2">
                        <button className="btn btn-secondary dropdown-toggle btn-lg" type="button"
                                id="dropdownMenuButton1" data-bs-auto-close="true" data-bs-toggle="dropdown"
                                aria-expanded="false">
                            {getNewTypeName(newType)}
                        </button>
                        <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                            {
                                availableTypes.map(i => <li key={i} onClick={_ => switchType(i)}
                                                                                  className={`dropdown-item ${newType == i ? 'active' : ''}`}>{getTypeName(i)}</li>)
                            }
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}