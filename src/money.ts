export const isMinorUnits = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

export const divideRound = (numerator: number, denominator: number): number => {
  const negative = numerator < 0
  const value = negative ? -numerator : numerator
  const rounded = Math.floor((value * 2 + denominator) / (denominator * 2))

  return negative && rounded !== 0 ? -rounded : rounded
}

export const shareOut = (
  numerators: number[],
  denominator: number,
  total: number,
): number[] => {
  const floors = numerators.map((numerator) => Math.floor(numerator / denominator))
  const remainders = numerators.map(
    (numerator, index) => numerator - (floors[index] ?? 0) * denominator,
  )

  let assigned = floors.reduce((sum, value) => sum + value, 0)
  const order = remainders
    .map((remainder, index) => ({ index, remainder }))
    .sort((a, b) => (b.remainder === a.remainder ? a.index - b.index : b.remainder - a.remainder))

  const shares = [...floors]
  let cursor = 0

  while (assigned < total && cursor < order.length) {
    const target = order[cursor]

    if (target) {
      shares[target.index] = (shares[target.index] ?? 0) + 1
      assigned += 1
    }

    cursor += 1
  }

  return shares
}
