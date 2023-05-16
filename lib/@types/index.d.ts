declare module 'drachtio-srf' {
    import { Socket } from 'net';
    import { EventEmitter } from 'events';
  
    type SipMethod = 'ACK' | 'BYE' | 'CANCEL' | 'INFO' | 'INVITE' | 'MESSAGE' | 'NOTIFY' | 'OPTIONS' | 'PRACK' | 'PUBLISH' | 'REFER' | 'REGISTER' | 'SUBSCRIBE' | 'UPDATE';
  
    export interface SrfConfig {
      apiSecret?: string;
      host?: string;
      port?: number;
      secret?: string;
    }
  
    export interface SipMessage {
      headers: {[name: string]: string | string[]};
      raw: string;
      body: string;
      method: SipMethod;
      version: string;
      uri: string;
      payload: object[];
      get(name: string): string;
    }
    
    export interface SrfRequest {
      headers: {[name: string]: any};
      msg: any;
      method: SipMethod;
      uri: string;
      from: string;
      to: string;
      callId: string;
      branch: string;
      sdp: string;
      get(name: string): string;
      has(name: string): boolean;
    }
  
    export interface SrfResponse {
      headers: {[name: string]: any};
      status: number;
      send(sdp?: string): void;
      end(): void;
      set(name: string, value: string | number): void;
      get(name: string): string;
    }
  
    class Srf extends EventEmitter {
      constructor();
      constructor(tags: string | string[]);
      connect(config?: SrfConfig): Promise<void>;
      disconnect(): void;
      register(options: any): void;
      invite(sipUri: string, options: any): void;
      bye(request: SrfRequest, options: any): void;
      cancel(request: SrfRequest, options: any): void;
      ack(request: SrfRequest, options: any): void;
      info(request: SrfRequest, options: any): void;
      message(request: SrfRequest, options: any): void;
      notify(request: SrfRequest, options: any): void;
      options(request: SrfRequest, options: any): void;
      prack(request: SrfRequest, options: any): void;
      publish(request: SrfRequest, options: any): void;
      refer(request: SrfRequest, target: string, options: any): void;
      subscribe(request: SrfRequest, target: string, options: any): void;
      update(request: SrfRequest, options: any): void;
      on(event: 'connect', listener: (err: Error, hostPort: string) => void): this;
      on(event: 'error', listener: (err: Error) => void): this;
      on(event: 'disconnect', listener: () => void): this;
      on(event: 'message', listener: (req: SrfRequest, res: SrfResponse) => void): this;
      on(event: 'request', listener: (req: SrfRequest, res: SrfResponse) => void): this;
      on(event: 'register' | 'invite' | 'bye' | 'cancel' | 'ack' | 'info' | 'notify' | 'options' | 'prack' | 'publish' | 'refer' | 'subscribe' | 'update', listener: (req: SrfRequest, res: SrfResponse) => void): this;
      on(event: 'cdr:attempt', listener: (source: string, time: string, msg: SipMessage) => void): this;
      on(event: 'cdr:start', listener: (source: string, time: string, role: string, msg: SipMessage) => void): this;
      on(event: 'cdr:stop', listener: (source: string, time: string, reason: string, msg: SipMessage) => void): this;
      locals: {[name: string]: any};
      socket: Socket;
    }
  
    export default Srf
  }
  