// Explicit optional-Python contract regression. The ordinary API suite remains Python-free.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryRoot } from '../src/config/paths.mjs';
import {
  buildClusteringSample,
  parameterSizeUpperBound,
} from '../src/modules/analysis/datasets.mjs';
import { exponentCases, vectorRows } from './helpers/vector-budget.mjs';

const python =
  process.argv[2] ||
  process.env.AI_PYTHON_EXECUTABLE ||
  resolve(
    repositoryRoot,
    'apps/ai-service/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
if (!existsSync(python))
  throw new Error(
    'Use an existing AI-service Python executable; this regression never installs dependencies.',
  );
const values = [
  ...exponentCases.map(([value]) => value),
  1.234567890123456e-7,
  -1.234567890123456e-7,
  0.000001,
  0.0001,
  Number.MIN_VALUE,
  Number.MAX_VALUE,
];
const cases = values.map((value, index) => {
  const sample = buildClusteringSample(vectorRows(value));
  assert.ok(sample.evidence.length >= 5);
  return {
    name: `32x768:${JSON.stringify(value)}`,
    upperBound: parameterSizeUpperBound(sample.parameters),
    wireBytes: Buffer.byteLength(JSON.stringify(sample.parameters)),
    request: { schemaVersion: 1, taskId: `vector-case-${index}`, locale: 'en', ...sample },
  };
});
const standard = buildClusteringSample(vectorRows(0.1234567890123456, 384));
cases.push({
  name: '32x384:standard',
  upperBound: parameterSizeUpperBound(standard.parameters),
  wireBytes: Buffer.byteLength(JSON.stringify(standard.parameters)),
  request: { schemaVersion: 1, taskId: 'vector-case-standard', locale: 'en', ...standard },
});

const scalarValues = [0, -0, 0.1, -0.1, Number.EPSILON, Number.MIN_VALUE, Number.MAX_VALUE];
for (let exponent = -323; exponent <= 308; exponent++) {
  const value = Number(`1.234567890123456e${exponent}`);
  if (Number.isFinite(value)) scalarValues.push(value, -value);
}
// Deterministic binary64 coverage, including varied mantissas and exponent sizes.
let state = 0x123456789abcdefn;
const bits = Buffer.alloc(8);
for (let index = 0; index < 20000; index++) {
  state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
  bits.writeBigUInt64LE(state);
  const value = bits.readDoubleLE();
  if (Number.isFinite(value)) scalarValues.push(value);
}
const payload = {
  cases,
  scalars: scalarValues.map((value) => ({
    wire: JSON.stringify(value),
    upperBound: parameterSizeUpperBound(value),
  })),
};
const outputDirectory = resolve(repositoryRoot, '.local/qa');
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'vector-exponent-cases.json'), JSON.stringify(payload));
const script = `
import json,sys
from app.schemas.tasks import TaskRequest
payload=json.load(sys.stdin)
results=[]
for case in payload['cases']:
    parameters=case['request']['parameters']
    actual=len(json.dumps(parameters,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    assert actual <= case['upperBound'] <= 120000,(case['name'],actual,case['upperBound'])
    TaskRequest.model_validate(case['request'])
    results.append({'name':case['name'],'sampled':len(case['request']['evidence']),'wireBytes':case['wireBytes'],'pythonBytes':actual,'upperBound':case['upperBound']})
for item in payload['scalars']:
    actual=len(json.dumps(json.loads(item['wire']),ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    assert actual <= item['upperBound'],(item['wire'],actual,item['upperBound'])
print(json.dumps({'cases':results,'scalarChecks':len(payload['scalars'])}))
`;
const result = spawnSync(python, ['-c', script], {
  cwd: resolve(repositoryRoot, 'apps/ai-service'),
  input: JSON.stringify(payload),
  encoding: 'utf8',
  timeout: 30000,
  maxBuffer: 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr?.slice(0, 3000) || result.error?.message);
const report = JSON.parse(result.stdout);
writeFileSync(
  resolve(outputDirectory, 'vector-exponent-report.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
