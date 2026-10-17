import type { PluginRpcCallArgs, PluginRpcClient, PluginRpcContract, PluginRpcResult } from "@get-bb/plugin-sdk/app";

export type RpcApi<Contract extends PluginRpcContract> = {
  [Method in Extract<keyof Contract, string>]: (
    ...args: PluginRpcCallArgs<Contract[Method]>
  ) => Promise<PluginRpcResult<Contract[Method]>>;
};

/**
 * `api.method(input)` in place of `rpc.call("method", input)`. A member call names the method the way
 * the server registers its handler (`{ method }`), so GitNexus links each call site to that handler.
 */
export function rpcApi<Contract extends PluginRpcContract>(rpc: PluginRpcClient<Contract>): RpcApi<Contract> {
  const call = rpc.call as (method: string, ...args: unknown[]) => Promise<unknown>;
  return new Proxy({} as RpcApi<Contract>, {
    // Not a thenable and no symbol members, so awaiting or inspecting the object stays harmless.
    get: (_target, method) =>
      typeof method === "string" && method !== "then" ? (...args: unknown[]) => call(method, ...args) : undefined,
  });
}
