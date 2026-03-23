/**
 * Find all connected components in a graph.
 * adjacency: map of node id → set of neighbor ids
 * nodes: all node ids to consider
 */
export function findConnectedComponents(
  nodes: number[],
  adjacency: Map<number, Set<number>>
): number[][] {
  const nodeSet = new Set(nodes);
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const node of nodes) {
    if (visited.has(node)) continue;
    const component: number[] = [];
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor) && nodeSet.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }
    components.push(component);
  }

  return components;
}

/**
 * Find the largest connected component among given nodes.
 */
export function largestContiguousGroup(
  nodes: number[],
  adjacency: Map<number, Set<number>>
): number {
  if (nodes.length === 0) return 0;
  const components = findConnectedComponents(nodes, adjacency);
  return Math.max(...components.map((c) => c.length));
}

/**
 * Check if two territories are adjacent.
 */
export function areAdjacent(
  a: number,
  b: number,
  adjacency: Map<number, Set<number>>
): boolean {
  return adjacency.get(a)?.has(b) ?? false;
}

/**
 * Build an adjacency map from a list of edges.
 */
export function buildAdjacencyMap(
  edges: [number, number][]
): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const [a, b] of edges) {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  }
  return map;
}
