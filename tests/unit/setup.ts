import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof globalThis.DOMMatrix === 'undefined') {
  class MinimalDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
      }
    }

    multiply(other: MinimalDOMMatrix): MinimalDOMMatrix {
      return new MinimalDOMMatrix([
        this.a * other.a + this.c * other.b,
        this.b * other.a + this.d * other.b,
        this.a * other.c + this.c * other.d,
        this.b * other.c + this.d * other.d,
        this.a * other.e + this.c * other.f + this.e,
        this.b * other.e + this.d * other.f + this.f,
      ]);
    }

    translate(tx = 0, ty = 0): MinimalDOMMatrix {
      return this.multiply(new MinimalDOMMatrix([1, 0, 0, 1, tx, ty]));
    }

    scale(sx = 1, sy = sx): MinimalDOMMatrix {
      return this.multiply(new MinimalDOMMatrix([sx, 0, 0, sy, 0, 0]));
    }

    transformPoint(point: { x?: number; y?: number } = {}): { x: number; y: number } {
      const x = point.x ?? 0;
      const y = point.y ?? 0;
      return {
        x: this.a * x + this.c * y + this.e,
        y: this.b * x + this.d * y + this.f,
      };
    }
  }

  (globalThis as unknown as { DOMMatrix: typeof MinimalDOMMatrix }).DOMMatrix = MinimalDOMMatrix;
}

afterEach(() => {
  cleanup();
});
