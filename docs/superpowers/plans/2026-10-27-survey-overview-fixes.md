# Survey and overview corrections

Scope: the reported approved survey wizard, overview cards, notification badges and navigation reloads. Preserve current visual system, EN/AR and public authorization.

1. Add failing approved-wizard interaction regressions for AI routing, name validation, branch counts, continuous typing and deleting every draft question. Fix action precedence, stable React keys and zero-question editing; saving still requires a question. Clear transient notices on corrections and expire them.
2. Add resource regressions for navigation reuse, concurrent request deduplication, filter/session/workspace isolation, mutation invalidation and stale responses. Implement bounded in-memory GET caching in the existing resource/HTTP layer with background refresh and cancellation; never persist private results.
3. Add notification regressions for scoped unread totals including records beyond the visible list. Connect both workspace headers and feedback badges to actual unread counts; render a bell with a conditional indicator.
4. Add overview regressions for saved report summaries/recommendations matching locale, selected filters and current response count. Connect the cards to actual reports, expose explicit generation/pending/error/unavailable states, and retain deterministic observed alerts.
5. Run web tests, relevant API tests, lint/format/build and isolated real-browser survey/overview flows at desktop/narrow EN/AR. Review final diff, commit, push task branch and open PR against main. No merge.

Review focus: stale inference/cache results after logout or scope changes; invalidating an active read during a mutation; empty editor reload; untranslated template detection; report/filter mismatch; unread totals independent of the 100-item display limit.

Execution: continue directly under the user's authorized bug-fix request; work in the existing clean checkout on a descriptive task branch. Existing owned browser runner uses an isolated replica set and Playwright because the Browser plugin is unavailable.
