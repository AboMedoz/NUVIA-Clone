# Connected UI ownership and interaction contract

The current product keeps React, the existing hash router, EN/AR providers and
shared workspace shell. This contract records ownership for the existing
controls; it is not evidence that every browser or accessibility criterion has
passed. Runtime results belong in the QA report.

## Canonical UI Map

| Capability     | Canonical owner                                                            | Source of truth                              | Allowed variants                                                       | Verification                                                                         |
| -------------- | -------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Select/Listbox | Supplied ChoiceMenu; native selects in retained team/public business forms | DESIGN.md and feature schemas                | Native product selection; established account menu                     | Keyboard selection, localized option text and narrow-browser checks                  |
| Date           | Native date input in shared Filters and preview OverviewControls           | Workspace timezone and API filter contract   | Native date-only entry; no implicit timezone conversion by the browser | Timezone filter tests and browser keyboard/date entry                                |
| Form           | Feature validation with shared fields/status styles and server validation  | Public API schemas and feature form handlers | Create, edit, public response and account flows                        | Invalid-submit, draft retention, failure and duplicate-submit regressions            |
| Scrollbar      | Global application CSS and workspace geometry                              | DESIGN.md                                    | Visible native scrolling; sidebar/table geometry overrides             | Computed styles and EN/AR narrow/desktop scrolling                                   |
| CRUD           | Existing hash router, session/workspace providers and feature API clients  | Implemented API and module boundaries        | Account, survey, branch, team, feedback and report workflows           | Account/invitation browser runners, product acceptance and feature interaction tests |

## Established behavior

The approved ProductContext owns saved identity, workspace switching and header
navigation. GlobalSearch queries authorized saved feedback, surveys and reports;
Enter can commit feedback text search to the protected route. Searches cancel when
the query or session scope changes. Survey lists retain local title search.

- Keep native selects and date inputs; use translated labels/options and real
  labels. Native picker chrome is controlled by the browser/OS and may follow its
  locale rather than the application locale. Do not claim an app-translated
  calendar or identical popup rendering across platforms.
- Shared product filters apply the same authorized cohort across feedback,
  analytics, export and reports. Advanced fields remain reachable by keyboard;
  an active advanced filter must not be concealed by the disclosure.
- Invalid forms show localized application feedback associated with their fields.
  Preserve entered values on validation/server failure; prevent duplicate writes.
  Keep browser input semantics for keyboards/autofill while the application owns
  validation feedback. Long text must remain readable and editable.
- Loading, empty, failed, unavailable and successful results are distinct states.
  A configured model is not proof of remote reachability or result quality.
- Dialogs retain the established focus trap, Escape and focus-return behavior.
  Controls and responsive tables remain keyboard operable and scrollable.
- Figma fixture metrics, subscription controls and illustrative AI prose do not
  become account data. Use saved metrics or explicit absence; retain provider-configuration
  and model readiness limits.

Static `premium-ui.json` declarations identify owners and validation commands;
they do not execute tests or waive runtime findings. Exact Figma source frames,
screenshots and deliberate product differences are recorded with the QA evidence.
