import {
  ReadableStream as NodeReadableStream,
  WritableStream as NodeWritableStream,
  TransformStream as NodeTransformStream,
} from 'stream/web';
import { Blob as NodeBlob } from 'buffer';

if (typeof globalThis.ReadableStream === 'undefined') globalThis.ReadableStream = NodeReadableStream;
if (typeof globalThis.WritableStream === 'undefined') globalThis.WritableStream = NodeWritableStream;
if (typeof globalThis.TransformStream === 'undefined') globalThis.TransformStream = NodeTransformStream;
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = NodeBlob;
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  };
}
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends NodeBlob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = String(name || '');
      this.lastModified = Number(options?.lastModified || Date.now());
    }
  };
}

const serverModule = await import('./server.js');

export const startServer = serverModule.startServer;
export const stopServer = serverModule.stopServer;
