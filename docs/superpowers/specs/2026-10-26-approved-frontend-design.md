# Approved frontend integration

The user approved using `Frontend.zip` as the canonical visual interface and changing its code as required to connect the existing backend and AI. Preserve the source ZIP. Preserve supplied layout, CSS, imagery, typography, EN/AR and responsive behavior. Replace illustrative account data with authorized saved data; use existing unavailable/empty/error patterns when a service or model cannot answer.

## Approach

Import the supplied source into `apps/web/src/features/approved-ui` and its public assets into the existing public asset tree. Adapt its data and action boundaries to the existing authenticated HTTP client and AuthProvider. Keep the public Node/Express/Mongoose boundary, transaction and authorization rules, and internal FastAPI adapters. Direct replacement with demo services would break accounts; recreating the design independently would risk fidelity. Therefore reuse the supplied components themselves.

## Scope

Landing, authentication, verification, onboarding, workspace navigation, overview, feedback, analytics, surveys/public collection, reports, assistant, business and branches. Existing team and public business capabilities remain accessible. The user subsequently expanded scope to implement missing services, including account settings and prepared Google/hosted billing integrations. External activation awaits supplied credentials; identity, metrics, successful saves and analysis must never be fabricated. Backend/AI changes are permitted only where required by the interface contract, not a general architecture rewrite.

## Acceptance

Original ZIP unchanged. Approved styling and assets retained. Protected routes never expose demo records. Existing signup/login/reset, workspace, survey publish/response, feedback/export and authorized analytics/report/assistant flows work with real data. Pending/unavailable models remain explicit. Verify EN/AR desktop and narrow layouts and affected interactions, unit tests, lint, formatting, build and isolated browser workflows. Record actual remaining limitations.
