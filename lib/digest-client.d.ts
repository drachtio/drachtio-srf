/**
 * Internal class handling SIP digest authentication.
 * Automatically processes 401/407 challenges and generates the proper Authorization header.
 * @internal
 */
export default class DigestClient {
    res: any;
    req: any;
    agent: any;
    nc: number;
    constructor(res: any);
    authenticate(callback: any): void;
    _updateNC(): string;
    _compileParams(params: any): string;
    _parseChallenge(digest: string): any;
}
