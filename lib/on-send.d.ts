/**
 * Registers a listener that executes right before a SIP response is sent via `res.send()`.
 * This allows modifying the response or logging it.
 *
 * @param res The Response object to attach the listener to.
 * @param listener A callback function called before the response is sent.
 */
export default function onSend(res: any, listener: any): void;
