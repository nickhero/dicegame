import { describe, it, expect } from 'vitest';
import {
  findConnectedComponents,
  largestContiguousGroup,
  areAdjacent,
  buildAdjacencyMap,
} from '../../src/utils/graph';

describe('buildAdjacencyMap', () => {
  it('builds bidirectional adjacency from edges', () => {
    const adj = buildAdjacencyMap([[0, 1], [1, 2]]);
    expect(adj.get(0)!.has(1)).toBe(true);
    expect(adj.get(1)!.has(0)).toBe(true);
    expect(adj.get(1)!.has(2)).toBe(true);
    expect(adj.get(2)!.has(1)).toBe(true);
    expect(adj.get(0)!.has(2)).toBe(false);
  });
});

describe('areAdjacent', () => {
  it('returns true for adjacent territories', () => {
    const adj = buildAdjacencyMap([[0, 1], [1, 2]]);
    expect(areAdjacent(0, 1, adj)).toBe(true);
    expect(areAdjacent(1, 0, adj)).toBe(true);
  });

  it('returns false for non-adjacent territories', () => {
    const adj = buildAdjacencyMap([[0, 1], [1, 2]]);
    expect(areAdjacent(0, 2, adj)).toBe(false);
  });

  it('returns false for non-existent nodes', () => {
    const adj = buildAdjacencyMap([[0, 1]]);
    expect(areAdjacent(0, 99, adj)).toBe(false);
  });
});

describe('findConnectedComponents', () => {
  it('finds single component when all connected', () => {
    const adj = buildAdjacencyMap([[0, 1], [1, 2], [2, 3]]);
    const components = findConnectedComponents([0, 1, 2, 3], adj);
    expect(components.length).toBe(1);
    expect(components[0].sort()).toEqual([0, 1, 2, 3]);
  });

  it('finds multiple components', () => {
    const adj = buildAdjacencyMap([[0, 1], [2, 3]]);
    const components = findConnectedComponents([0, 1, 2, 3], adj);
    expect(components.length).toBe(2);
  });

  it('respects node filter', () => {
    const adj = buildAdjacencyMap([[0, 1], [1, 2], [2, 3]]);
    // Only consider nodes 0 and 2 (1 is excluded, breaking the connection)
    const components = findConnectedComponents([0, 2], adj);
    expect(components.length).toBe(2);
  });

  it('handles empty node list', () => {
    const adj = buildAdjacencyMap([[0, 1]]);
    const components = findConnectedComponents([], adj);
    expect(components.length).toBe(0);
  });
});

describe('largestContiguousGroup', () => {
  it('returns size of largest connected group', () => {
    const adj = buildAdjacencyMap([[0, 1], [1, 2], [3, 4]]);
    expect(largestContiguousGroup([0, 1, 2, 3, 4], adj)).toBe(3);
  });

  it('returns 1 for isolated nodes', () => {
    const adj = buildAdjacencyMap([[0, 1]]);
    expect(largestContiguousGroup([2], adj)).toBe(1);
  });

  it('returns 0 for empty list', () => {
    const adj = buildAdjacencyMap([]);
    expect(largestContiguousGroup([], adj)).toBe(0);
  });

  it('filters by provided nodes only', () => {
    // Full graph: 0-1-2-3-4, but player only owns 0, 2, 4
    const adj = buildAdjacencyMap([[0, 1], [1, 2], [2, 3], [3, 4]]);
    // 0 is alone, 2 is alone, 4 is alone (1 and 3 are not in the list)
    expect(largestContiguousGroup([0, 2, 4], adj)).toBe(1);
  });
});
