import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { PdfEngine, type PdfJsLike } from '../../src/core/pdf/index.ts';
import { computeDeckId, sha256HexFallback, toByteView } from '../../src/core/pdf/hash.ts';

const encoder = new TextEncoder();

describe('SHA-256 / computeDeckId', () => {
  const vectors: Array<{ label: string; bytes: Uint8Array; expected: string }> = [
    {
      label: 'empty input',
      bytes: new Uint8Array(0),
      expected: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    {
      label: '"abc"',
      bytes: encoder.encode('abc'),
      expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    },
    {
      label: '56-byte boundary (forces 2-block padding)',
      bytes: encoder.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      expected: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    },
    {
      label: '112-byte multi-block input',
      bytes: encoder.encode(
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      ),
      expected: 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    },
    {
      label: 'all byte values 0..255',
      bytes: Uint8Array.from({ length: 256 }, (_, i) => i),
      expected: '40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880',
    },
  ];

  it.each(vectors)('matches NIST vector for $label via both WebCrypto and fallback', async ({ bytes, expected }) => {
    expect(sha256HexFallback(bytes)).toBe(expected);
    await expect(computeDeckId(bytes)).resolves.toBe(expected);
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    await expect(computeDeckId(ab)).resolves.toBe(expected);
  });

  it('hashes only the sub-view byteOffset..byteOffset+byteLength slice', async () => {
    const backing = new Uint8Array([0xaa, 0xbb, 0x61, 0x62, 0x63, 0xcc, 0xdd]);
    const subView = backing.subarray(2, 5); // "abc"
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    expect(sha256HexFallback(subView)).toBe(expected);
    await expect(computeDeckId(subView)).resolves.toBe(expected);
  });

  it('hashes non-zero byteOffset DataView and Int32Array views over their exact byte ranges', async () => {
    const raw = new ArrayBuffer(16);
    const bytes = new Uint8Array(raw);
    bytes.fill(0xff);
    // Write "abc" at byteOffset 5..8 for DataView
    bytes[5] = 0x61;
    bytes[6] = 0x62;
    bytes[7] = 0x63;
    const dataView = new DataView(raw, 5, 3);
    const expectedAbc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    expect(sha256HexFallback(dataView)).toBe(expectedAbc);
    await expect(computeDeckId(dataView)).resolves.toBe(expectedAbc);

    // Int32Array at byteOffset 4 (length 2 -> 8 bytes)
    const int32Slice = new Int32Array(raw, 4, 2);
    const sliceBytes = new Uint8Array(raw, 4, 8);
    const expectedSlice = sha256HexFallback(sliceBytes);

    expect(sha256HexFallback(int32Slice)).toBe(expectedSlice);
    await expect(computeDeckId(int32Slice)).resolves.toBe(expectedSlice);
  });

  it('falls back cleanly to pure-TS SHA-256 when crypto.subtle is unavailable or throws', async () => {
    const payload = encoder.encode('typst-presenter-fallback-check');
    const expected = sha256HexFallback(payload);

    const originalSubtle = globalThis.crypto?.subtle;
    const digestSpy = vi
      .spyOn(globalThis.crypto, 'subtle', 'get')
      .mockReturnValue(undefined as unknown as SubtleCrypto);

    try {
      await expect(computeDeckId(payload)).resolves.toBe(expected);
    } finally {
      digestSpy.mockRestore();
    }

    if (originalSubtle) {
      const rejectSpy = vi
        .spyOn(originalSubtle, 'digest')
        .mockRejectedValueOnce(new Error('Not allowed in insecure context'));
      try {
        await expect(computeDeckId(payload)).resolves.toBe(expected);
      } finally {
        rejectSpy.mockRestore();
      }
    }
  });

  it('handles node:vm cross-realm ArrayBuffer without 0-byte truncation in sha256HexFallback, computeDeckId, and PdfEngine.loadDeck', async () => {
    const raw = encoder.encode('%PDF-1.7');
    const expected = sha256HexFallback(raw);
    const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(expected).not.toBe(emptySha256);

    const crossRealmBuffer = vm.runInNewContext(
      'new Uint8Array(bytes).buffer',
      { bytes: Array.from(raw) },
    ) as ArrayBuffer;

    expect(crossRealmBuffer instanceof ArrayBuffer).toBe(false);
    expect(ArrayBuffer.isView(crossRealmBuffer)).toBe(false);
    expect(Object.prototype.toString.call(crossRealmBuffer)).toBe('[object ArrayBuffer]');

    expect(sha256HexFallback(crossRealmBuffer)).toBe(expected);
    await expect(computeDeckId(crossRealmBuffer)).resolves.toBe(expected);
    expect(() => toByteView({} as never)).toThrow(TypeError);

    let receivedBytes: Uint8Array | null = null;
    const mockPdfjs: PdfJsLike = {
      getDocument(params) {
        receivedBytes = (params.data as Uint8Array).slice();
        return {
          promise: Promise.resolve({
            numPages: 1,
            getPageLabels: async () => null,
            getPage: async () => ({
              getViewport: ({ scale }) => ({
                width: 800 * scale,
                height: 450 * scale,
                scale,
                convertToViewportPoint: (x, y) => [x, 450 - y],
              }),
              render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
              getAnnotations: async () => [],
              cleanup: vi.fn(),
            }),
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: async () => {},
          }),
          destroy: async () => {},
        };
      },
    };

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    const meta = await engine.loadDeck(crossRealmBuffer, 'cross-realm.pdf');

    expect(meta.byteLength).toBe(raw.byteLength);
    expect(meta.deckId).toBe(expected);
    expect(receivedBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(receivedBytes!)).toEqual(Array.from(raw));

    await engine.destroy();
  });
});
