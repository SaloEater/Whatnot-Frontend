import {Event} from "@/app/entity/entities";
import Image from "next/image";
import {TextInput} from "@/app/common/textInput";
import {FC, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import OrderChangingComponent from "@/app/break/[id]/orderChangingComponent";
import './eventComponent.css'
import SwapComponent from "@/app/break/[id]/swapComponent";
import {TextInputWithSuggestions} from "@/app/common/textInputWithSuggestions";
import {IsTeam} from "@/app/common/teams";

interface EventProps {
    event: Event,
    events: Event[],
    updateEvent: (event: Event) => void,
    resetEvent: (event: Event) => void,
    getEventPlaceholder: () => Event,
    moveEvent: (event: Event, newIndex: number) => void,
    isPlaceholderEmpty: () => boolean,
    usernames: string[],
    addUsername: (username: string) => void,
    isHighBid: boolean
}

export const EventComponent: FC<EventProps> = (props) => {
    const [newCustomer, setNewCustomer] = useState(props.event.customer)
    const [newPrice, setNewPrice] = useState(props.event.price)
    const [showOverlay, setShowOverlay] = useState(false)

    useEffect(() => {
        setNewPrice(props.event.price)
        setNewCustomer(props.event.customer)
    }, [props.event.customer, props.event.price]);

    function getEventImage(team: string) {
        if (IsTeam(team)) {
            return `/images/teams/${team}.webp`;
        } else {
            return `/images/events/${team.toLowerCase()}.png`;
        }
    }

    function updateCustomer(value: string) {
        if (value == '') {
            value = '?'
        } else {
            value = value.replace('?', '')
        }
        setNewCustomer(value.trim())
    }

    function saveCustomer(forceValue: string|null = null) {
        let newCustomerActual = forceValue != null ? forceValue : newCustomer
        if (props.event.customer == newCustomerActual) {
            return
        }
        let newEvent = {...props.event}
        newEvent.customer = newCustomerActual
        setNewCustomer(newCustomerActual)
        props.addUsername(newCustomer)
        props.updateEvent(newEvent)
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
        if (props.event.price == newPrice) {
            return
        }
        let newEvent = {...props.event}
        newEvent.price = newPrice
        props.updateEvent(newEvent)
    }
    
    function hasIndex() {
        return props.event.customer != '';
    }

    function applyPlaceholder() {
        let eventPlaceholder = props.getEventPlaceholder()
        let newEvent = {...props.event}
        newEvent.customer = eventPlaceholder.customer
        newEvent.price = eventPlaceholder.price
        setNewCustomer(eventPlaceholder.customer)
        setNewPrice(eventPlaceholder.price)
        props.updateEvent(newEvent)
    }

    function showOrderChangingInterface() {
        if (hasIndex()) {
            setShowOverlay(true)
        }
    }

    function moveTeamAfter(event: Event|null) {
        let nextIndex = 1
        if (event) {
            if (event.index > props.event.index) {
                nextIndex = event.index
            } else {
                nextIndex = event.index + 1
            }
        }
        props.moveEvent(props.event, nextIndex)
    }

    let borderColor = 'border-primary'
    if (hasIndex()) {
        borderColor = 'border-green'
    }

    let split = props.event.team.split(' ')
    if (split.length == 1) {
        split.push('...')
    }
    let firstPart = split.length > 2 ? `${split[0]} ${split[1]}` : split[0]
    let secondPart = split.length > 2 ? `${split[2]}` : split[1]

    return (
        <div className={`w-125p position-relative border border-1 rounded rounded-3 ${borderColor}`} >
            {
                showOverlay && <OrderChangingComponent params={{
                    onClose: () => setShowOverlay(false),
                    moveTeamAfter: moveTeamAfter,
                    events: props.events,
                    callingEvent: props.event,
                }}/>
            }
            <div style={{opacity: hasIndex() ? 0.5 : 1}}>
                <div className='w-100p d-flex flex-column justify-content-center align-items-center p-1'>
                    <Image src={getEventImage(props.event.team)} alt={props.event.team} height="75" width="75"/>
                    <div>{firstPart}</div>
                    <div>{secondPart}</div>
                    <div className='w-100p d-flex gap-2 flex-column hidden'>
                        <div className='d-flex gap-1'>
                            <strong className='fs-4 text-white cursor-pointer' onClick={showOrderChangingInterface}>{hasIndex() ? `#${props.event.index}` : '-'}</strong>
                            <TextInput
                                value={`$${newPrice}`}
                                update={updatePrice}
                                save={savePrice}
                                placeholder={'Enter price'}
                                font_size={null}
                                onClick={null}
                                onBlur={null}
                                disabled={false} 
                            />
                        </div>
                        <TextInputWithSuggestions
                            value={newCustomer}
                            update={updateCustomer}
                            save={saveCustomer}
                            max_width={100}
                            placeholder={'Enter nickname'}
                            font_size={null}
                            onClick={null}
                            onBlur={null}
                            suggestions={[]}
                            alwaysOn={false}
                            disabled={false}
                        />
                    </div>
                </div>
            </div>
            <div className='position-absolute top-0 start-0 d-flex'>
                {
                    props.event.customer != '' && <div onClick={_ => {
                            setNewCustomer('')
                            setNewPrice(0)
                            props.resetEvent(props.event)
                        }}>
                            <Image className='bg-secondary p-1 rounded rounded-3' alt='Delete' src="/images/bin_static_sm.png" width='30' height='30'/>
                        </div>
                    }
                {
                    !props.isPlaceholderEmpty() && <div onClick={_ => applyPlaceholder()}>
                        <Image className='bg-secondary p-1' alt='Delete' src="/images/copy.png" width='30' height='30'/>
                    </div>
                }
            </div>
        </div>
    )
}