import { runAgentLoopStream, type AgentLoopStreamOptions } from "../agent-loop";

type NodeId = "agent_loop";

type Node = (ctx: AgentLoopStreamOptions) => Promise<NodeId | null>;

async function runGraph(start: NodeId, nodes: Record<NodeId, Node>, ctx: AgentLoopStreamOptions): Promise<void> {
  let current: NodeId | null = start;
  while (current !== null) {
    const nodeFn: Node = nodes[current];
    current = await nodeFn(ctx);
  }
}

export async function runFinanceGraphStream(ctx: AgentLoopStreamOptions): Promise<void> {
  await runGraph(
    "agent_loop",
    {
      agent_loop: async (c) => {
        await runAgentLoopStream(c);
        return null;
      },
    },
    ctx
  );
}
