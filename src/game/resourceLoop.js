// Pure gather/deliver transitions. These are resource-agnostic so the same
// logic drives Wood (trees) and Food (berry bushes); the Wood wrappers below
// keep older call sites and tests working unchanged.

export function gatherResourceTick({ nodeAmount, carried, capacity }) {
  if (nodeAmount <= 0 || carried >= capacity) {
    return {
      nodeAmount,
      carried,
      gathered: false,
      nodeDepleted: nodeAmount <= 0,
      shouldReturn: true,
    };
  }

  const nextNodeAmount = nodeAmount - 1;
  const nextCarried = carried + 1;

  return {
    nodeAmount: nextNodeAmount,
    carried: nextCarried,
    gathered: true,
    nodeDepleted: nextNodeAmount === 0,
    shouldReturn: nextCarried >= capacity || nextNodeAmount === 0,
  };
}

export function deliverResourceLoad({ stored, carried, nodeAmount }) {
  return {
    stored: stored + carried,
    carried: 0,
    delivered: carried,
    shouldResumeGather: nodeAmount > 0,
  };
}

// --- Wood-specific wrappers (kept for backward compatibility) ---

export function harvestWoodTick({ treeWood, woodCarried, carryCapacity }) {
  const result = gatherResourceTick({ nodeAmount: treeWood, carried: woodCarried, capacity: carryCapacity });
  return {
    treeWood: result.nodeAmount,
    woodCarried: result.carried,
    harvested: result.gathered,
    treeDepleted: result.nodeDepleted,
    shouldReturn: result.shouldReturn,
  };
}

export function deliverWoodLoad({ woodStored, woodCarried, treeWood }) {
  const result = deliverResourceLoad({ stored: woodStored, carried: woodCarried, nodeAmount: treeWood });
  return {
    woodStored: result.stored,
    woodCarried: result.carried,
    delivered: result.delivered,
    shouldResumeHarvest: result.shouldResumeGather,
  };
}
