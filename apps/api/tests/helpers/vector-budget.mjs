export function vectorRows(value, dimensions = 768) {
  return Array.from({ length: 32 }, (_, index) => {
    const id = `response-${index}`;
    return {
      _id: id,
      createdAt: new Date(1700000000000 + index),
      text: `Feedback ${index}`,
      analysis: { embeddings: { vectors: [{ id, values: Array(dimensions).fill(value) }] } },
    };
  });
}

export const exponentCases = [
  [1e-7, '1e-07'],
  [-1e-7, '-1e-07'],
  [1e-8, '1e-08'],
  [-1e-8, '-1e-08'],
  [1e-9, '1e-09'],
  [-1e-9, '-1e-09'],
  [1e-10, '1e-10'],
  [-1e-10, '-1e-10'],
];
