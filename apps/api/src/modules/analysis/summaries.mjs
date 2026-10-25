import { randomUUID, createHash } from 'node:crypto';

// A numeric clustering label identifies membership only. Semantic text is a separate,
// authorized generative result with its own unavailable state and immutable provenance.
export async function queueClusterSummaries(parent, deps, session) {
  if (parent.capability !== 'clustering' || parent.status !== 'succeeded') return;
  const source = new Map((parent.input?.evidence || []).map((item) => [item.id, item.text]));
  for (const cluster of parent.result.clusters) {
    const ids = [...new Set([...cluster.evidenceIds, ...cluster.memberIds])];
    const evidence = [];
    let remaining = 30000,
      shortened = false;
    for (const id of ids) {
      if (!cluster.memberIds.includes(id) || !source.has(id)) continue;
      if (evidence.length >= 30 || remaining <= 0) break;
      const text = source.get(id).slice(0, Math.min(10000, remaining));
      shortened ||= text.length < source.get(id).length;
      evidence.push({ id, text });
      remaining -= text.length;
    }
    if (!evidence.length) continue;
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          parent: parent._id,
          modelVersion: parent.modelVersion,
          pipelineVersion: parent.pipelineVersion,
          clusterId: cluster.id,
          evidence,
        }),
      )
      .digest('hex');
    const id = randomUUID();
    await deps.models.AnalysisJob.updateOne(
      {
        workspaceId: parent.workspaceId,
        capability: 'report',
        datasetKey: `cluster-summary:${key}`,
      },
      {
        $setOnInsert: {
          _id: id,
          workspaceId: parent.workspaceId,
          parentJobId: parent._id,
          clusterId: cluster.id,
          purpose: 'cluster_summary',
          branchIds: parent.branchIds,
          capability: 'report',
          datasetKey: `cluster-summary:${key}`,
          status: deps.config.aiServiceKey ? 'queued' : 'waiting_for_model',
          attempts: 0,
          createdAt: deps.now(),
          updatedAt: deps.now(),
          error: deps.config.aiServiceKey ? null : 'model_unavailable',
          input: {
            taskId: id,
            locale: parent.input.locale,
            evidence,
            parameters: {
              purpose: 'cluster_summary',
              clusterId: cluster.id,
              clusterSize: cluster.memberIds.length,
              coverage: {
                memberCount: cluster.memberIds.length,
                evidenceCount: evidence.length,
                truncated: shortened || evidence.length < cluster.memberIds.length,
              },
            },
          },
        },
      },
      { upsert: true, session },
    );
  }
}
