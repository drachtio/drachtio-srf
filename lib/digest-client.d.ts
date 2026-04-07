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
