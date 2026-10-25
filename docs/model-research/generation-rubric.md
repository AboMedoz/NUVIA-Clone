# Generation usefulness review protocol

Written before reading any generation-probe outputs. This is an assistant review,
not independent human validation. Do not turn format or literal-quote checks into
claims of factual correctness.

Each applicable dimension scores 0 (failed), 1 (partial) or 2 (met). Save the raw
answer, exact observed issue and dimension scores. Do not tune prompts after review.

For supported assistant answers and reports:

1. Evidence fidelity: no invented facts, quantities, people or causes. Delivery
   evidence is a 90-minute delay, cold/late arrival and positive food feedback;
   staff politeness and clean tables are also available.
2. Citation support: evidence IDs exist, quotes are exact, and every material
   factual claim has a citation whose quote supports that claim.
3. Task usefulness: assistant answers the delivery question directly; report
   gives a balanced short Arabic account plus one reasonable action clearly
   presented as a recommendation rather than an observed fact.
4. Format and language: follows the requested plain records and Arabic report
   locale, without irrelevant commentary.

For the unsupported salary/revenue query:

1. Abstention: exactly `ABSTAIN|insufficient evidence` earns 2; a clear equivalent
   refusal earns 1; answering unsupported facts earns 0.
2. Unsupported claims: no invented or speculative salary/revenue earns 2; vague
   speculation earns 1; invented specifics earn 0.

For survey suggestions:

1. Shape: exactly five valid `QUESTION|short_text or rating|question` lines.
2. Relevance: questions cover actual supplied topics without claiming new facts.
3. Wording: understandable Arabic, one concept per question, no leading demands,
   no ambiguous scale without explanation when a scale is needed.
4. Editability: distinct useful drafts that an owner can edit; no publication,
   fabricated response data or unnecessary personal-data questions.

The four probes are a scoped smoke evaluation. Production needs a larger frozen
set, prompt-injection cases, owner evidence isolation and independent review.
