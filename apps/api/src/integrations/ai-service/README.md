# Internal AI transport

`client.mjs` owns authenticated bounded HTTP transport and independent output validation. Node owns MongoDB writes, tenancy, branch authorization, job state, report/evidence snapshots and result provenance. Python never receives database credentials and never writes product storage.

See [the public and internal contracts](../../../../../docs/api/README.md) and [the AI runtime](../../../../ai-service/README.md). Configure private `AI_SERVICE_URL`, `AI_SERVICE_KEY` and optional `AI_SERVICE_TIMEOUT_MS`. Defaults contact only loopback. A configured nonlocal provider is an explicit deployment/data-sharing choice, not an automatic fallback.

Missing models remain waiting. Builtin normalization/language can run independently; trained sentiment/aspect/embedding/cluster/forecast/generative capabilities activate only through the Python capability registry. Raw codepoint offsets and exact source quotations are checked again before any derived result reaches product dashboards. Contract fixtures run only in isolated tests.
