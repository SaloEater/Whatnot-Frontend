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
        <div className='border border-1 border-primary rounded rounded-3 d-flex align-items-center'>
            <TextInput params={customerInputParams}/>
            <Image className='bg-secondary p-1' alt='Delete' src="/images/bin_static_sm.png" width='30' height='30' onClick={_ => {
                setNewCustomer('')
                params.resetEvent(params.event)
            }}/>
        </div>
    )
}