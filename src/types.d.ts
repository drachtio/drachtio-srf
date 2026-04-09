declare module 'only' {
  function only(obj: any, keys: string | string[]): any;
  export = only;
}

declare module 'utils-merge' {
  function merge<T, U>(a: T, b: U): T & U;
  export = merge;
}

declare module 'sip-methods' {
  const methods: string[];
  export = methods;
}

declare module 'delegates' {
  function delegate(obj: any, prop: string): any;
  export = delegate;
}

declare module 'sip-status' {
  const sipStatus: Record<number, string>;
  export = sipStatus;
}

declare module 'uuid-random' {
  function uuid(): string;
  export = uuid;
}

declare module 'short-uuid' {
  interface ShortUUID {
    new(): string;
  }
  function short(): ShortUUID;
  export = short;
}
