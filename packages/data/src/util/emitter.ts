/**
 * A tiny typed event emitter.
 *
 * Node's EventEmitter is untyped and pulls in `any`; this is a few lines and
 * keeps the listener payloads checked. Listeners never throw into the emitter:
 * a failing listener is reported and the rest still run.
 */
export type Listener<T> = (payload: T) => void;

export type Unsubscribe = () => void;

export class Emitter<Events extends Record<string, unknown>> {
    private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();
    private readonly onListenerError?: (event: keyof Events, error: unknown) => void;

    constructor(onListenerError?: (event: keyof Events, error: unknown) => void) {
        this.onListenerError = onListenerError;
    }

    on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): Unsubscribe {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener as Listener<never>);
        return () => this.off(event, listener);
    }

    once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): Unsubscribe {
        const unsubscribe = this.on(event, (payload) => {
            unsubscribe();
            listener(payload);
        });
        return unsubscribe;
    }

    off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
        this.listeners.get(event)?.delete(listener as Listener<never>);
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        const set = this.listeners.get(event);
        if (!set) return;
        for (const listener of [...set]) {
            try {
                (listener as Listener<Events[K]>)(payload);
            } catch (error) {
                this.onListenerError?.(event, error);
            }
        }
    }

    listenerCount(event: keyof Events): number {
        return this.listeners.get(event)?.size ?? 0;
    }

    removeAllListeners(): void {
        this.listeners.clear();
    }
}
