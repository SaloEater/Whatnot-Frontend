import {Event} from "@/app/entity/entities";
import Image from "next/image";
import TextInput from "@/app/common/textInput";
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";

export default function EventPlaceholderComponent({params}: {params: {
    event: Event,
    updateEventPlaceholder: (event: Event) => void,
    resetEventPlaceholder: (event: Event) => void
}}) {
    const [newCustomer, setNewCustomer] = useState(params.event.customer)
    const [newPrice, setNewPrice] = useState(params.event.price)

    useEffect(() => {
        setNewCustomer(params.event.customer)
        setNewPrice(params.event.price)
    }, [params.event]);

    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    function updateCustomer(value: string) {
        setNewCustomer(value)
    }

    function saveCustomer() {
        let newEvent = {...params.event}
        newEvent.customer = newCustomer
        params.updateEventPlaceholder(newEvent)
    }

    const customerInputParams = {
        value: newCustomer,
        update: updateCustomer,
        save: saveCustomer,
        max_width: 100,
        placeholder: 'Enter nickname',
        font_size: null,
    }

    function updatePrice(value: string) {
        if (value == '' || value == '$') {
            value = '0'
        } else {
            value = value.replace('$', '')
        }
        setNewPrice(parseInt(value))
    }

    function savePrice() {
        let newEvent = {...params.event}
        newEvent.price = newPrice
        params.updateEventPlaceholder(newEvent)
    }

    const priceInputParams = {
        value: `$${newPrice}`,
        update: updatePrice,
        save: savePrice,
        max_width: 50,
        placeholder: 'Enter price',
        font_size: null,
    }

    function hasIndex() {
        return params.event.customer != '';
    }

    return (
        <div className='position-relative border border-1 border-primary rounded rounded-3'>
            <div className='d-flex flex-column justify-content-center align-items-center p-1'>
                <div className='d-flex gap-2 flex-column'>
                    <TextInput params={priceInputParams}/>
                    <TextInput params={customerInputParams}/>
                </div>
            </div>
            <div className='position-absolute top-0 start-0' onClick={_ => {
                setNewCustomer('')
                setNewPrice(0)
                params.resetEventPlaceholder(params.event)
            }}>
                <Image className='bg-secondary p-1' alt='Delete' src="/images/bin_static_sm.png" width='30' height='30'/>
            </div>
        </div>
    )
}