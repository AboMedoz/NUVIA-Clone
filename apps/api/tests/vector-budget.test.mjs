import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClusteringSample } from '../src/modules/analysis/datasets.mjs';
import { vectorRows, exponentCases } from './helpers/vector-budget.mjs';

test('vector sampling budgets Python exponent formatting for positive and negative small floats', () => {
  for (const [value, pythonToken] of exponentCases) {
    const sample = buildClusteringSample(vectorRows(value));
    const wire = JSON.stringify(sample.parameters);
    // Controlled corpus: the only matching exponent tokens are vector entries.
    const pythonBytes = Buffer.byteLength(wire.replaceAll(JSON.stringify(value), pythonToken));
    assert.ok(
      pythonBytes <= 128000,
      `${value} selected ${sample.evidence.length}, Python parameters ${pythonBytes} bytes`,
    );
    assert.ok(Buffer.byteLength(wire) <= 120000);
    assert.ok(sample.evidence.length >= 5);
    assert.equal(sample.parameters.sampleCount, sample.evidence.length);
    assert.equal(sample.parameters.totalResponses, 32);
    assert.equal(sample.parameters.sampled, sample.evidence.length < 32);
    assert.deepEqual(
      sample.parameters.vectors.map((vector) => vector.id),
      sample.evidence.map((item) => item.id),
    );
    assert.ok(
      sample.parameters.vectors.every(
        (vector) => vector.values.length === 768 && vector.values.every((item) => item === value),
      ),
    );
  }
});
