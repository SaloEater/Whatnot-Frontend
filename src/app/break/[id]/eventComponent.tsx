import {Event} from "@/app/entity/entities";
import Image from "next/image";
import TextInput from "@/app/common/textInput";
import {useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import OrderChangingComponent from "@/app/break/[id]/orderChangingComponent";

export default function EventComponent({params}: {params: {
    event: Event,
    events: Event[],
    updateEvent: (event: Event, index: number) => void,
    index: number,
    resetEvent: (event: Event, index: number) => void,
    getEventPlaceholder: () => Event,
    moveEvent: (event: Event, newIndex: number) => void,
    }}) {
    const [newCustomer, setNewCustomer] = useState(params.event.customer)
    const [newPrice, setNewPrice] = useState(params.event.price)
    const [showOverlay, setShowOverlay] = useState(false)

    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    function updateCustomer(value: string) {
        if (value == '') {
            value = '?'
        } else {
            value = value.replace('?', '')
        }
        setNewCustomer(value)
    }

    function saveCustomer() {
        let newEvent = {...params.event}
        newEvent.customer = newCustomer
        params.updateEvent(newEvent, params.index)
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
        params.updateEvent(newEvent, params.index)
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

    function applyPlaceholder() {
        let eventPlaceholder = params.getEventPlaceholder()
        let newEvent = {...params.event}
        newEvent.customer = eventPlaceholder.customer
        newEvent.price = eventPlaceholder.price
        setNewCustomer(eventPlaceholder.customer)
        setNewPrice(eventPlaceholder.price)
        params.updateEvent(newEvent, params.index)
    }

    function showOrderChangingInterface() {
        if (hasIndex()) {
            setShowOverlay(true)
        }
    }

    return (
        <div className='position-relative border border-1 border-primary rounded rounded-3'>
            {
                showOverlay && <OrderChangingComponent params={{
                    onClose: () => setShowOverlay(false),
                    moveTeamAfter: (event: Event|null) => {
                        let nextIndex = 1
                        if (event) {
                            if (event.index > params.event.index) {
                                nextIndex = event.index
                            } else {
                                nextIndex = event.index + 1
                            }
                        }
                        params.moveEvent(params.event, nextIndex)
                    },
                    events: params.events,
                    callingEvent: params.event,
                }}/>
            }
            <div style={{opacity: hasIndex() ? 0.5 : 1}}>
                <div className='d-flex flex-column justify-content-center align-items-center p-1'>
                    <Image src={getTeamImageSrc(params.event.team)} alt={params.event.team} height="75" width="75"/>
                    {params.event.team}
                    <div className='d-flex gap-2 flex-column'>
                        <div className='d-flex gap-1'>
                            <strong className='fs-4 text-white' onClick={showOrderChangingInterface}>{hasIndex() ? `#${params.event.index}` : '-'}</strong>
                            <TextInput params={priceInputParams}/>
                        </div>
                        <TextInput params={customerInputParams}/>
                    </div>
                </div>
            </div>
            <div className='position-absolute top-0 start-0 d-flex'>
                <div onClick={_ => {
                    setNewCustomer('')
                    setNewPrice(0)
                    params.resetEvent(params.event, params.index)
                }}>
                    <Image className='bg-secondary p-1' alt='Delete' src="/images/bin_static_sm.png" width='30' height='30'/>
                </div>
                <div onClick={_ => applyPlaceholder()}>
                    <Image className='bg-secondary p-1' alt='Delete' src="/images/copy.png" width='30' height='30'/>
                </div>
            </div>
        </div>
    )
}