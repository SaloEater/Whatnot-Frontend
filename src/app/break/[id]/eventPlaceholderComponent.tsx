import {Event} from "@/app/entity/entities";
import Image from "next/image";
import TextInput from "@/app/common/textInput";
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";

export default function EventPlaceholderComponent({params}: {params: {
    event: Event,
    updateEventPlaceholder: (event: Event) => void,
    resetEventPlaceholder: null|((event: Event) => void),
    selectEventPlaceholder: (event: Event) => void,
    deselectEventPlaceholder: () => void,
    isSelected: boolean,
    isAuto: boolean,
    inputDisabled: boolean,
}}) {
    const [newCustomer, setNewCustomer] = useState(params.event.customer)
    const [newPrice, setNewPrice] = useState(params.event.price)

    useEffect(() => {
        setNewCustomer(params.event.customer)
    }, [params.event.customer]);

    useEffect(() => {
        setNewPrice(params.event.price)
    }, [params.event.price]);

    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    function updateCustomer(value: string) {
        setNewCustomer(value)
    }

    function saveCustomer() {
        if (newCustomer == '' ) {
            params.deselectEventPlaceholder()
            return
        }
        let newEvent = {...params.event}
        newEvent.customer = newCustomer
        params.updateEventPlaceholder(newEvent)
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

    function isChanged() {
        return params.event.customer != '';
    }

    function onCheck() {
        if (params.isSelected) {
            params.deselectEventPlaceholder()
        } else if (isChanged()) {
            params.selectEventPlaceholder(params.event)
        }
    }

    function resetCurrent() {
        if (params.resetEventPlaceholder == null) {
            return
        }
        setNewCustomer('')
        setNewPrice(0)
        params.resetEventPlaceholder(params.event)
    }

    const priceInputParams = {
        value: `$${newPrice}`,
        update: updatePrice,
        save: savePrice,
        max_width: 50,
        placeholder: 'Enter price',
        font_size: null,
        onClick: null,
        onBlur: null,
        disabled: params.inputDisabled,
    }

    const customerInputParams = {
        value: newCustomer,
        update: updateCustomer,
        save: saveCustomer,
        max_width: 100,
        placeholder: 'Enter nickname',
        font_size: null,
        onClick: null,
        onBlur: null,
        disabled: params.inputDisabled,
    }

    return (
        <div className='position-relative border border-1 border-primary rounded rounded-3'>
            <div className='d-flex flex-column justify-content-center align-items-center p-1'>
                Future event:
                <div className='d-flex gap-2 flex-column' id={params.isAuto ? 'auto' : ''}>
                    <div className='d-flex justify-content-evenly align-items-center'>
                        {params.resetEventPlaceholder != null && <img onClick={resetCurrent} className='bg-secondary p-1 w-15p rounded rounded-3' alt='Delete' src="/images/bin_static_sm.png"/>}
                        <div className='w-50p'><TextInput params={priceInputParams}/></div>
                        <button className={`btn btn-sm ${params.isSelected ? 'btn-primary' : 'btn-secondary'}`} disabled={!isChanged()} onClick={onCheck}>{params.isSelected ? 'Stop' : 'Copy'}</button>
                        {/*<label>Copy</label><input disabled={!isChanged()} type='checkbox' checked={params.isSelected} onChange={onCheck}/>*/}
                    </div>
                    <TextInput params={customerInputParams}/>
                </div>
            </div>
        </div>
    )
}