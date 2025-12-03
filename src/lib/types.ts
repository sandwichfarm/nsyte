// Enforces an ArrayBuffer-backed Uint8Array for APIs that require BufferSource/BlobPart
export type ByteArray = Uint8Array<ArrayBuffer>;
