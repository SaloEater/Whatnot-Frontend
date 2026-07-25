import {Event} from "@/app/entity/entities";
import React, {FC, useState} from "react";
import './eventComponent.css'

interface AddNewCardProps {
    addNewCard: (event: Event) => void
}

const NEW_CARD_TYPE_MISCELLANEOUS = 1
export const TYPE_NAMES: Record<number, string> = {
    [NEW_CARD_TYPE_MISCELLANEOUS]: 'Miscellaneous',
}

const AVAILABLE_TYPES = [NEW_CARD_TYPE_MISCELLANEOUS]

export const AddNewCardComponent: FC<AddNewCardProps> = (props) => {
    const [showCustomForm, setShowCustomForm] = useState(false)
    const [customName, setCustomName] = useState('')
    const [customCount, setCustomCount] = useState(1)

    function addCard(team: string) {
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
            team: team
        })
    }

    function resetCustomForm() {
        setShowCustomForm(false)
        setCustomName('')
        setCustomCount(1)
    }

    function openCustomForm(prefill: string) {
        setCustomName(prefill)
        setCustomCount(1)
        setShowCustomForm(true)
    }

    function confirmCustomSpot() {
        const trimmedName = customName.trim()
        if (trimmedName === '') {
            return
        }
        const count = Math.max(1, customCount || 1)
        if (count === 1) {
            addCard(trimmedName)
        } else {
            for (let i = 1; i <= count; i++) {
                addCard(`${trimmedName} ${i}`)
            }
        }
        resetCustomForm()
    }

    return (
        <div className='w-125p position-relative border border-1 rounded rounded-3 border-primary'>
            <div className='h-100 d-flex justify-content-center align-items-center'>
                {
                    !showCustomForm ? (
                        <div className="dropdown p-2">
                            <button className="btn btn-primary dropdown-toggle btn-lg" type="button"
                                    data-bs-auto-close="true" data-bs-toggle="dropdown"
                                    aria-expanded="false">
                                Add
                            </button>
                            <ul className="dropdown-menu cursor-pointer">
                                {
                                    AVAILABLE_TYPES.map(type => (
                                        <li key={type}
                                            onClick={() => openCustomForm(TYPE_NAMES[type])}
                                            className='dropdown-item'>
                                            Add {TYPE_NAMES[type]}
                                        </li>
                                    ))
                                }
                                <li onClick={() => openCustomForm('')}
                                    className='dropdown-item'>
                                    Custom spot
                                </li>
                                <li onClick={() => openCustomForm('Chaser')}
                                    className='dropdown-item'>
                                    Add Chaser
                                </li>
                            </ul>
                        </div>
                    ) : (
                        <div className="p-2 d-flex flex-column gap-2 w-100">
                            <input type="text"
                                   className="form-control form-control-sm"
                                   placeholder="Spot name (e.g. Chaser)"
                                   value={customName}
                                   onChange={e => setCustomName(e.target.value)}
                                   autoFocus/>
                            <input type="number"
                                   className="form-control form-control-sm"
                                   min={1}
                                   value={customCount}
                                   onChange={e => setCustomCount(Math.max(1, parseInt(e.target.value) || 1))}/>
                            <div className="d-flex gap-1">
                                <button className="btn btn-primary btn-sm"
                                        disabled={customName.trim() === ''}
                                        onClick={confirmCustomSpot}>
                                    Add
                                </button>
                                <button className="btn btn-secondary btn-sm"
                                        onClick={resetCustomForm}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    )
}
