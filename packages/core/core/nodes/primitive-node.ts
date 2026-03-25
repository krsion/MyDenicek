import type { PrimitiveValue, SelectorSegment } from '../selector.ts';
import { Node } from './base.ts';

export class PrimitiveNode extends Node {
  value: PrimitiveValue;

  constructor(value: PrimitiveValue) {
    super();
    this.value = value;
  }

  override setPrimitive(value: PrimitiveValue): boolean {
    this.value = value;
    return true;
  }

  protected resolveSegment(): { key: SelectorSegment; child: Node }[] { return []; }
  replaceChild(): void {}
  wrapChild(): void {}

  clone(): PrimitiveNode {
    return new PrimitiveNode(this.value);
  }

  toPlain(): PrimitiveValue {
    return this.value;
  }

  equals(other: Node): boolean {
    return other instanceof PrimitiveNode && this.value === other.value;
  }
}
