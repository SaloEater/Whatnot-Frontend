export interface Logger {
    add: (value: string) => void
    addMany: (values: string[]) => void
}

export class ConsoleLogger implements Logger {
    add(value: string) {
        console.log(value)
    }
    addMany(values: string[]) {
        console.log(values)
    }
}

export class ComponentLogger implements Logger {
    log: string[] = []
    _setter: undefined|((data: string[]) => void)
    fallbackLogger = new ConsoleLogger()

    add(value: string): void {
        this.addOne(value)
        this.update()
    }

    addMany(values: string[]): void {
        values.forEach(i => this.addOne(i))
        this.update()
    }

    setSetter(func: (data: string[]) => void) {
        this._setter = func
    }

    private update() {
        if (this._setter) {
            this._setter(this.log)
        } else {
            let arr = ['Here is log dump']
            arr.push(...this.log)
            this.fallbackLogger.addMany(arr)
        }
    }

    private addOne(value: string) {
        this.log.push(value)
    }

    clear() {
        this.log = []
        this.update()
    }
}