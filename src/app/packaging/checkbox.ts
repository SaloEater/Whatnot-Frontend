export class CheckboxState {
    private state: boolean[] = []

    constructor(length: number) {
        let counter = 0
        this.state = Array(length).fill(false)
    }

    get(index: number) {
        return this.state[index]
    }

    set(index: number, value: boolean) {
        this.state[index] = value
    }

    turnOn(index: number) {
        this.set(index, true)
    }

    turnOff(index: number) {
        this.set(index, false)
    }

    allTrue() {
        return !this.state.includes(false)
    }

    clone() {
        let newState = new CheckboxState(this.state.length)
        this.state.forEach((i, j) => newState.state[j] = i)
        return newState
    }

    cloneAndSet(index: number, value: boolean) {
        let newState = this.clone()
        newState.set(index, value)
        return newState
    }

    setAllTrue() {
        this.setAll(true)
    }

    setAll(value: boolean) {
        this.state.forEach((_, j) => value ? this.turnOn(j) : this.turnOff(j))
    }
}