type SankeyLabelNode = {
  readonly index: number;
  readonly x0: number;
  readonly y0: number;
  readonly y1: number;
  readonly value: number;
};

export function hiddenSankeyLabels(
  nodes: readonly SankeyLabelNode[],
  options: { height: number; minSpacing: number },
): Set<number>;
