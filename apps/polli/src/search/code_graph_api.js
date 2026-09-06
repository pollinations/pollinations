const { CodeGraph } = require("@colbymchenry/codegraph");

const [action, identifier, depthArgument] = process.argv.slice(2);
const depth = Number.parseInt(depthArgument, 10);

function serializeNode(node) {
  return {
    id: node.id,
    name: node.name,
    qualifiedName: node.qualifiedName,
    signature: node.signature,
    kind: node.kind,
    language: node.language,
    filePath: node.filePath,
    startLine: node.startLine,
    endLine: node.endLine,
  };
}

function resolveNode(graph, value) {
  const byId = graph.getNode(value);
  if (byId) return byId;

  const matches = graph
    .getNodesByName(value)
    .filter((node) => node.name === value || node.qualifiedName === value);
  if (matches.length === 0) throw new Error(`No exact symbol for '${value}'`);
  if (matches.length > 1) {
    const candidates = matches
      .slice(0, 5)
      .map((node) => `${node.qualifiedName || node.name} (${node.filePath}:${node.startLine})`)
      .join(", ");
    throw new Error(`Ambiguous symbol '${value}'. Use a stable ID. Candidates: ${candidates}`);
  }
  return matches[0];
}

async function main() {
  const graph = await CodeGraph.open(process.cwd());
  try {
    const target = resolveNode(graph, identifier);
    let nodes;
    let resultDepth;
    if (action === "resolve") {
      nodes = [];
    } else if (action === "callers") {
      nodes = graph.getCallers(target.id).map(({ node }) => node);
    } else if (action === "callees") {
      nodes = graph.getCallees(target.id).map(({ node }) => node);
    } else if (action === "impact") {
      const impact = graph.getImpactRadius(target.id, depth);
      const nodeIds = new Set([target.id, ...impact.nodes.keys()]);
      for (const edge of impact.edges) {
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
      nodes = [...nodeIds].map((nodeId) => graph.getNode(nodeId)).filter(Boolean);
      resultDepth = depth;
    } else {
      throw new Error(`Unknown action '${action}'`);
    }
    process.stdout.write(JSON.stringify({ target: serializeNode(target), nodes: nodes.map(serializeNode), depth: resultDepth }));
  } finally {
    graph.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
