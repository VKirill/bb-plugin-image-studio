STATUS: complete

# Hub install fails: import experimental_defineHostEntry from the bare SDK, not @get-bb/plugin-sdk/host; version 0.8.6

`bb plugin update image-studio` to v0.8.5 is refused by the hub: 'server bundle build failed: host.ts:8:45: [plugin: bb-plugin-sdk-resolution] "@get-bb/plugin-sdk/host" is not installed for this plugin (no node_modules/@get-bb/plugin-sdk); bb serves only the bare "@get-bb/plugin-sdk" at load time'. server.ts imports hostContract from host.ts, so the host import lands in the server bundle. Import experimental_defineHostEntry (and defineRpcContract) from the bare "@get-bb/plugin-sdk" in host.ts, as bb-plugin-repo-pulse does (its root export exists in our SDK 0.4.87: node_modules/@get-bb/plugin-sdk/dist/index.js). No file in the plugin (outside node_modules/dist) may import an @get-bb/plugin-sdk subpath. Bump package.json version to 0.8.6.

Attempt 2 accepted by Lane Pilot BB writer.
