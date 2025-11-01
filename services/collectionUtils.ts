export function filterInPlace<T>(
  array: T[],
  predicate: (value: T, index: number) => boolean,
  onRemove?: (value: T) => void
): void {
  let writeIndex = 0;
  for (let i = 0; i < array.length; i++) {
    const value = array[i];
    if (predicate(value, i)) {
      array[writeIndex++] = value;
    } else if (onRemove) {
      onRemove(value);
    }
  }
  array.length = writeIndex;
}
