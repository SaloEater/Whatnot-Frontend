import {Event, GiveawayTypeNone, GiveawayTypePack, GiveawayTypeSlab} from "@/app/entity/entities";
import Image from "next/image";
import TextInput from "@/app/common/textInput";
import React, {useCallback, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Teams} from "@/app/common/teams";

export default function GiveawayComponent({params}: {params: {
    event: Event,
    updateEvent: (event: Event) => void,
    resetEvent: (event: Event) => void
}}) {
    const [newCustomer, setNewCustomer] = useState(params.event.customer)
    const [isPack, setIsPack] = useState(false)
    const [isSlab, setIsSlab] = useState(false)

    useEffect(() => {
        let type = params.event.giveaway_type
        setIsPack(type == GiveawayTypePack)
        setIsSlab(type == GiveawayTypeSlab)
    }, [params.event.giveaway_type]);

    const updateCustomer = (value: string) => {
        if (value == '') {
            value = params.event.customer
        }
        setNewCustomer(value)
    }

    const saveCustomer = () => {
        let newEvent = params.event
        newEvent.customer = newCustomer
        params.updateEvent(newEvent)
    }

    const customerInputParams = {
        value: newCustomer,
        update: updateCustomer,
        save: saveCustomer,
        max_width: 150,
        font_size: 15,
        placeholder: 'Enter nickname',
        onClick: null,
        onBlur: null,
        disabled: false,
    }

    function switchType(type: number) {
        if (type == params.event.giveaway_type) {
            type = GiveawayTypeNone
        }
        setIsPack(type == GiveawayTypePack)
        setIsSlab(type == GiveawayTypeSlab)
        let newEvent = params.event
        newEvent.giveaway_type = type
        params.updateEvent(newEvent)
    }

    function getGiveawayTypeName(type: number) {
        return type == GiveawayTypeSlab ? 'S' : 'P';
    }

    function getGiveawayTypeFullName(type: number) {
        return type == GiveawayTypeSlab ? 'Slab' : 'Pack';
    }

    return (
        <div className='border-1 rounded rounded-3 d-flex align-items-center justify-content-evenly'>
            <div className='w-75p'><TextInput params={customerInputParams}/></div>
            <div className="dropdown p-2">
                <button className="btn btn-secondary dropdown-toggle btn-sm" type="button" id="dropdownMenuButton1" data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                    {getGiveawayTypeName(params.event.giveaway_type)}
                </button>
                <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                    {
                        [GiveawayTypeSlab, GiveawayTypePack].map(i => <li key={i} onClick={_ => switchType(i)} className={`dropdown-item ${params.event.giveaway_type == i ? 'active' : ''}`}>{getGiveawayTypeFullName(i)}</li>)
                    }
                </ul>
            </div>
            <img className='bg-secondary w-15p p-1 rounded rounded-3' alt='Delete' src="/images/bin_static_sm.png" onClick={_ => {
                setNewCustomer('')
                params.resetEvent(params.event)
            }}/>
        </div>
    )
}