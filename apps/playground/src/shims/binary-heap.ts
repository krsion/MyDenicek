/** Browser-compatible BinaryHeap shim matching the @std/data-structures interface. */
export class BinaryHeap<T> {
  private data: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get length(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.data[i]!, this.data[parent]!) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent]!, this.data[i]!];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1, right = 2 * i + 2;
      if (
        left < n && this.compare(this.data[left]!, this.data[smallest]!) < 0
      ) smallest = left;
      if (
        right < n && this.compare(this.data[right]!, this.data[smallest]!) < 0
      ) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [
        this.data[smallest]!,
        this.data[i]!,
      ];
      i = smallest;
    }
  }
}
