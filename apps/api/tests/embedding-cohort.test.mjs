import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClusteringSample, datasetKey } from '../src/modules/analysis/datasets.mjs';

function rows(version, count, pipelineVersion = 'pipeline-1') {
  return Array.from({ length: count }, (_, index) => ({
    _id: `${version}-${index}`,
    text: 'Synthetic review',
    createdAt: new Date('2026-10-25T00:00:00Z'),
    analysis: {
      embeddings: {
        modelVersion: version,
        pipelineVersion,
        vectors: [{ id: `${version}-${index}`, values: [0.5, 0.5] }],
      },
    },
  }));
}

test('clustering never mixes equal-dimension embeddings from different models or pipelines', () => {
  const responses = [...rows('gemini/embedding/d2', 6), ...rows('local-encoder', 5)];
  const sample = buildClusteringSample(responses);
  assert.equal(sample.evidence.length, 6);
  assert.ok(sample.evidence.every((item) => item.id.startsWith('gemini/')));
  assert.equal(sample.parameters.sampled, true);
  const separatePipelines = buildClusteringSample([
    ...rows('same-model', 5, 'cloud-v1'),
    ...rows('same-model', 6, 'local-v1').map((row) => ({
      ...row,
      _id: `other-${row._id}`,
      analysis: {
        embeddings: {
          ...row.analysis.embeddings,
          vectors: [{ id: `other-${row._id}`, values: [0.5, 0.5] }],
        },
      },
    })),
  ]);
  assert.equal(separatePipelines.evidence.length, 6);
  const undersized = buildClusteringSample([...rows('cloud-small', 4), ...rows('local-small', 4)]);
  assert.equal(undersized.evidence.length, 4, 'Different spaces cannot be pooled to reach five');
});

test('dataset cache identity changes when a provider pipeline changes', () => {
  assert.notEqual(
    datasetKey(rows('same-model', 5, 'cloud-v1'), 'day', 'UTC'),
    datasetKey(rows('same-model', 5, 'local-v1'), 'day', 'UTC'),
  );
});
