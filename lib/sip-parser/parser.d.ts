/**
 * Gets the properly cased name of a SIP header.
 *
 * @param hdr The header name to look up.
 * @returns The standardized header name.
 */
export declare function getHeaderName(hdr: string): string;
/**
 * Parses a SIP URI string into an object.
 *
 * @param s The URI string to parse.
 * @returns An object containing the parsed URI components, or undefined if parsing fails.
 */
export declare function parseUri(s: any): any;
/**
 * Stringifies a parsed URI object back into a string.
 *
 * @param uri The parsed URI object.
 * @returns The string representation of the URI.
 */
export declare function stringifyUri(uri: any): string;
/**
 * Stringifies a parsed Authorization or WWW-Authenticate header.
 *
 * @param a The parsed authentication object.
 * @returns The string representation of the authentication header.
 */
export declare function stringifyAuthHeader(a: any): string;
/**
 * Stringifies an entire SIP message object into its raw string format.
 *
 * @param m The parsed SIP message.
 * @returns The raw string of the SIP message.
 */
export declare function stringifySipMessage(m: any): string;
/**
 * Parses a raw SIP message string into an object.
 *
 * @param s The raw SIP message (Buffer or string).
 * @param lazy Whether to do lazy parsing (only splitting headers, not fully parsing them).
 * @returns An object containing the parsed message components.
 */
export declare function parseSipMessage(s: any, lazy?: boolean): any;
/**
 * Gets a specific parser function for a given SIP header.
 *
 * @param hdr The header name.
 * @returns The parsing function for that header.
 */
export declare function getParser(hdr: string): any;
/**
 * Gets a specific stringifier function for a given SIP header.
 *
 * @param hdr The header name.
 * @returns The stringifier function for that header.
 */
export declare function getStringifier(hdr: string): any;
