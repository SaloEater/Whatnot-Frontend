// Concurrency limiter for the layout page's backend reads.
//
// The data spine (useLayoutData.tsx) runs one poller per source, and they all start within the
// same render pass — so their intervals stay in lockstep and every tick fires as a simultaneous
// burst rather than a spread. On HTTP/1.1 a browser opens roughly six connections per host, so a
// burst that size sits exactly on that limit: requests queue in the browser anyway, but invisibly,
// and one slow endpoint delays everything behind it.
//
// This makes the queueing explicit and bounded instead. Tasks beyond MAX_CONCURRENT wait FIFO and
// start as slots free up. It is deliberately not a scheduler — no priorities, no dedupe, no
// cancellation: a fetcher that is already queued and fires again simply queues twice, which is
// harmless because each one just re-reads current state. Add dedupe here if that ever stops being
// true.
//
// Only the spine uses this. One-off reads (a settings panel loading its own values) go direct —
// they are user-initiated and rare, and making them wait behind background polling would be
// backwards.

/** Simultaneous in-flight spine requests. Comfortably under the ~6-per-host HTTP/1.1 limit so a
 *  reconcile or a user-initiated read is never stuck behind a full queue of pollers. */
const MAX_CONCURRENT = 3

let inFlight = 0
const waiting: Array<() => void> = []

function pump() {
    while (inFlight < MAX_CONCURRENT && waiting.length > 0) {
        const next = waiting.shift()
        next?.()
    }
}

/**
 * Run `task` when a slot is free. Resolves/rejects with whatever the task does — note the spine's
 * `post()`/`get()` resolve an `{error}` shape rather than rejecting, so in practice this only ever
 * resolves and the slot is released either way via `finally`.
 */
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const run = () => {
            inFlight++
            task()
                .then(resolve, reject)
                .finally(() => {
                    inFlight--
                    pump()
                })
        }
        if (inFlight < MAX_CONCURRENT) run()
        else waiting.push(run)
    })
}

/** Test/debug visibility — not used by the spine itself. */
export function queueStats(): { inFlight: number; waiting: number } {
    return { inFlight, waiting: waiting.length }
}
