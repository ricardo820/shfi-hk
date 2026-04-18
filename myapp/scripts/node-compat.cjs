if (!Array.prototype.toReversed) {
  Object.defineProperty(Array.prototype, 'toReversed', {
    configurable: true,
    writable: true,
    value: function toReversed() {
      return [...this].reverse();
    },
  });
}

if (!Array.prototype.toSorted) {
  Object.defineProperty(Array.prototype, 'toSorted', {
    configurable: true,
    writable: true,
    value: function toSorted(compareFn) {
      return [...this].sort(compareFn);
    },
  });
}

if (!Array.prototype.toSpliced) {
  Object.defineProperty(Array.prototype, 'toSpliced', {
    configurable: true,
    writable: true,
    value: function toSpliced(start, deleteCount, ...items) {
      const clone = [...this];
      clone.splice(start, deleteCount, ...items);
      return clone;
    },
  });
}

if (!Array.prototype.with) {
  Object.defineProperty(Array.prototype, 'with', {
    configurable: true,
    writable: true,
    value: function withMethod(index, value) {
      const clone = [...this];
      const normalizedIndex = index < 0 ? clone.length + index : index;
      clone[normalizedIndex] = value;
      return clone;
    },
  });
}