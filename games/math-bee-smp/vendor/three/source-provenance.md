# Vendored Three.js provenance

The task's required outbound proxy returned HTTP 503 (`VPN DNS or routing is unavailable`) for npm/Git HTTPS CONNECT. Native GitHub connector reads remained available. These files were obtained through that authorized connector; no direct-egress or proxy bypass was used.

## Runtime

- Project: https://github.com/mrdoob/three.js
- Release: r183 / 0.183.0
- Release commit: `1939c35f2d92a4c870568da011aab54dabdfdd30`
- Sources: `build/three.module.min.js`, `build/three.core.min.js`, and `LICENSE` at r183.
- License: MIT, retained at `LICENSE` and in both source headers.
- This is a minimal local ESM distribution. `package.json` was authored locally to export only the main ESM runtime and its declarations. Addons, WebGPU entrypoints, and CommonJS bundles are not included.
- No modifications to runtime code. The files preserve the fetched source bytes, including its trailing newline.

| Runtime file | SHA-256 |
| --- | --- |
| `build/three.module.min.js` | `0a61c95f14e0fa015b3083475c73424f360e5f6f5b74c282b50fdbc2f4c228fc` |
| `build/three.core.min.js` | `0a9c2f0672c7b8d993ba7639e71919db181ca50c9dff99c78476d3e19057ca9c` |
| `LICENSE` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

## Actual upstream TypeScript declarations

- Project: https://github.com/DefinitelyTyped/DefinitelyTyped
- Matching Three.js r183 declaration commit: `7411f80efd1b70a63894649ab632b5692e949592`
- Source root: `types/three/` at that commit.
- Copied the reachable declaration graph from `src/Three.d.ts`: 430 `.d.ts` files and the upstream `src/renderers/common/RenderPipeline.ts` file. The latter really has a `.ts` extension upstream; it is not a locally invented fallback declaration.
- Upstream MIT license is retained at `types/LICENSE`.
- `types/index.d.ts` is a locally authored entrypoint re-exporting the actual upstream `src/Three.js` declarations. It includes real WebXR globals; it does not declare Three.js values as `any`.

### Small integration changes

1. `types/src/renderers/webxr/WebXRManager.d.ts`: upstream `reference types="webxr"` was repointed to the vendored real declaration at `types/external/webxr/index.d.ts`.
2. `types/src/textures/ExternalTexture.d.ts`: upstream `reference types="@webgpu/types"` was omitted because the installed TypeScript 6.0.3 `lib.dom` already defines WebGPU globals. Including the standalone WebGPU package caused duplicate declarations; no WebGPU declarations were replaced with an `any` shim.
3. The root entrypoint supplies the WebXR reference and preserves the upstream Three.js exports. Package `types` and export conditions point to that entrypoint.

WebXR globals are from DefinitelyTyped `types/webxr/index.d.ts`, whose last source change on the fetched master snapshot is commit `b85cf6abeab75d88081d7fb07df32eac874f835e`. The actual declaration and upstream MIT license are retained under `types/external/webxr/`.

## Verification performed

- Node ESM import reports `REVISION === '183'`; `WebGLRenderer`, `Group`, and `MeshStandardMaterial` are functions.
- Standalone declaration graph passed TypeScript 6.0.3 with `--strict --noEmit --skipLibCheck false --target ES2022 --module ESNext --moduleResolution Bundler --lib DOM,ES2022`.
- Runtime browser rendering and application correctness require the game's separate browser/domain checks. Vendoring and a passing declaration check do not establish those claims.
