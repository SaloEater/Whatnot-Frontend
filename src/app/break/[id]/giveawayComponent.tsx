import {Event} from "@/app/entity/entities";
import Image from "next/image";
import TextInput from "@/app/common/textInput";
import {useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";

export default function GiveawayComponent({params}: {params: {
    event: Event,
    updateEvent: (event: Event) => void,
    resetEvent: (event: Event) => void
}}) {
    const [newCustomer, setNewCustomer] = useState(params.event.customer)

    function updateCustomer(value: string) {
        if (value == '') {
            value = params.event.customer
        }
        setNewCustomer(value)
    }

    function saveCustomer() {
        let newEvent = {...params.event}
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
    }

    return (
        <div className='border-1 rounded rounded-3 d-flex align-items-center justify-content-evenly'>
            <div className='w-75'><TextInput params={customerInputParams}/></div>
            <img className='bg-secondary w-15 p-1 rounded rounded-3' alt='Delete' src="/images/bin_static_sm.png" onClick={_ => {
                setNewCustomer('')
                params.resetEvent(params.event)
            }}/>
        </div>
    )
}