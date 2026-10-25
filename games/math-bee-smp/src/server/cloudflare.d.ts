/** Public D1/Worker interfaces used by this app; no provider implementation is mocked here. */
interface D1Result<T=unknown> { success:boolean; results:T[]; meta:{changes:number; [key:string]:unknown} }
interface D1PreparedStatement {
  bind(...values:(string|number|null|ArrayBuffer|Uint8Array)[]):D1PreparedStatement;
  first<T=Record<string,unknown>>(column?:string):Promise<T|null>;
  run<T=Record<string,unknown>>():Promise<D1Result<T>>;
  all<T=Record<string,unknown>>():Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query:string):D1PreparedStatement;
  batch<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>;
}
interface ExecutionContext {waitUntil(promise:Promise<unknown>):void}
