import {Event, GiveawayTypeNone, GiveawayTypePack, GiveawayTypeSlab} from "@/app/entity/entities";
import Image from "next/image";
import TextInput from "@/app/common/textInput";
import {useCallback, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";

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

    return (
        <div className='border-1 rounded rounded-3'>
            <div className='d-flex align-items-center justify-content-evenly'>
                <div className='w-75p'><TextInput params={customerInputParams}/></div>
                <img className='bg-secondary w-15p p-1 rounded rounded-3' alt='Delete' src="/images/bin_static_sm.png" onClick={_ => {
                    setNewCustomer('')
                    params.resetEvent(params.event)
                }}/>
            </div>
            <div className='d-flex gap-1'>
                <div className='border-dashed border-1 rounded rounded-1'>
                    Is Pack
                    <input type="checkbox" checked={isPack} onClick={() => switchType(GiveawayTypePack)}/>
                </div>
                <div className='border-dashed border-1 rounded rounded-1'>
                    Is Slab
                    <input type="checkbox" checked={isSlab} onClick={() => switchType(GiveawayTypeSlab)}/>
                </div>
            </div>
        </div>
    )
}