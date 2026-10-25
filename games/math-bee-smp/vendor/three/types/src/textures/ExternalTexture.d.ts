// WebGPU globals are supplied by TypeScript 6 lib.dom; upstream @webgpu/types reference omitted to avoid duplicate DOM globals.

import { Texture } from "./Texture.js";

declare class ExternalTexture extends Texture<null> {
    sourceTexture: WebGLTexture | GPUTexture | null;

    readonly isExternalTexture: true;

    constructor(sourceTexture?: WebGLTexture | GPUTexture | null);
}

export { ExternalTexture };
