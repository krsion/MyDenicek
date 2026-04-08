export class BinaryHeap<T> {
  private readonly values: T[] = [];
  private readonly compareValues: (left: T, right: T) => number;

  constructor(compareValues: (left: T, right: T) => number) {
    this.compareValues = compareValues;
  }

  get length(): number {
    return this.values.length;
  }

  push(value: T): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): T | undefined {
    if (this.values.length === 0) {
      return undefined;
    }

    const topValue = this.values[0]!;
    const lastValue = this.values.pop()!;

    if (this.values.length > 0) {
      this.values[0] = lastValue;
      this.bubbleDown(0);
    }

    return topValue;
  }

  private bubbleUp(index: number): void {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (
        this.compareValues(
          this.values[currentIndex]!,
          this.values[parentIndex]!,
        ) >= 0
      ) {
        return;
      }

      [this.values[currentIndex], this.values[parentIndex]] = [
        this.values[parentIndex]!,
        this.values[currentIndex]!,
      ];
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    let currentIndex = index;
    while (true) {
      const leftChildIndex = currentIndex * 2 + 1;
      const rightChildIndex = leftChildIndex + 1;
      let smallestIndex = currentIndex;

      if (
        leftChildIndex < this.values.length &&
        this.compareValues(
            this.values[leftChildIndex]!,
            this.values[smallestIndex]!,
          ) < 0
      ) {
        smallestIndex = leftChildIndex;
      }

      if (
        rightChildIndex < this.values.length &&
        this.compareValues(
            this.values[rightChildIndex]!,
            this.values[smallestIndex]!,
          ) < 0
      ) {
        smallestIndex = rightChildIndex;
      }

      if (smallestIndex === currentIndex) {
        return;
      }

      [this.values[currentIndex], this.values[smallestIndex]] = [
        this.values[smallestIndex]!,
        this.values[currentIndex]!,
      ];
      currentIndex = smallestIndex;
    }
  }
}
