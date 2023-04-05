declare module 'drachtio-srf' {
    import { Socket } from 'net';
    import { EventEmitter } from 'events';
  
    type SipMethod = 'ACK' | 'BYE' | 'CANCEL' | 'INFO' | 'INVITE' | 'MESSAGE' | 'NOTIFY' | 'OPTIONS' | 'PRACK' | 'PUBLISH' | 'REFER' | 'REGISTER' | 'SUBSCRIBE' | 'UPDATE';
  
    interface SrfConfig {
      apiSecret?: string;
      host?: string;
      port?: number;
      secret?: string;
    }
  
    interface SrfRequest {
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
  
    interface SrfResponse {
      headers: {[name: string]: any};
      status: number;
      send(sdp?: string): void;
      end(): void;
      set(name: string, value: string | number): void;
      get(name: string): string;
    }
  
    interface Srf extends EventEmitter {
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
      on(event: 'connect' | 'error' | 'disconnect', listener: () => void): this;
      on(event: 'message', listener: (req: SrfRequest, res: SrfResponse) => void): this;
      on(event: 'request', listener: (req: SrfRequest, res: SrfResponse) => void): this;
      on(event: 'register' | 'invite' | 'bye' | 'cancel' | 'ack' | 'info' | 'notify' | 'options' | 'prack' | 'publish' | 'refer' | 'subscribe' | 'update', listener: (req: SrfRequest, res: SrfResponse) => void): this;
      locals: {[name: string]: any};
      socket: Socket;
    }
  
    export default function srf(config?: SrfConfig): Srf;
  }
  