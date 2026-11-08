// The growth worker: runs the engine off the page so drawing and editing stay smooth however slow a step is.
import { createRunner, type ToRunner } from './runner'

const scope = self as unknown as { postMessage: (message: unknown, transfer: Transferable[]) => void; onmessage: ((event: MessageEvent<ToRunner>) => void) | null }
const runner = createRunner((message, transfer) => scope.postMessage(message, transfer))
scope.onmessage = event => runner.handle(event.data)
