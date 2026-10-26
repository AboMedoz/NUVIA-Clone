# Saved action board

All routes use the existing verified cookie session, exact Origin and CSRF protection. Node owns persistence. The action board never creates sample actions for a real account.

| Method | Path                           | Behavior                                                                                                                                            |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/actions`              | Up to 500 saved actions, newest first, within workspace and complete assigned branch scope.                                                         |
| POST   | `/api/v1/actions`              | Owner/manager creates an action and validates its branches and linked evidence. Returns 201 with `{ action }`.                                      |
| GET    | `/api/v1/actions/:id`          | Returns `{ action }` only when every action branch remains authorized.                                                                              |
| PATCH  | `/api/v1/actions/:id`          | Owner/manager updates supplied fields using the current `version`; stale writes return 409 `VERSION_CONFLICT`. Unspecified fields remain unchanged. |
| DELETE | `/api/v1/actions/:id`          | Owner/manager deletes the action using body `{ version }`. Linked customer responses and reports remain saved. Returns 204.                         |
| GET    | `/api/v1/actions/:id/evidence` | Returns `{ action, responses }` containing the linked saved responses that belong to the action's workspace and branches.                           |

Creation fields: `title` (1–200 characters), `summary` (up to 5,000), nonempty unique `branchIds` (up to 100), unique `responseIds` (up to 100, default empty), nullable `reportId`, `priority` (`high`, `medium`, `opportunity`), `status` (`todo`, `progress`, `done`), `owner` (assignment label up to 120), and `due` (a valid `YYYY-MM-DD` calendar date or empty). Defaults are medium priority, todo status and empty owner/due. Updates require a positive integer `version` and accept the same fields without applying creation defaults.

Every referenced response must belong to the selected branches. If a report is linked, its complete branch scope must fit the action and selected response IDs must be in that report's saved evidence. Invalid or unauthorized references return 404/422 without saving. Archived branches keep historical action/evidence access under the existing branch authorization rules. Viewer accounts may read authorized actions and evidence but cannot mutate them. Access is resolved for every request so revoked assignments take effect immediately.

The supplied interface now offers manual action creation with a saved-feedback picker, status/owner/due updates, explicit deletion confirmation and source-response links. Actions persist in the connection-scoped `actions` collection. It does not invent recommendations when a trained model or saved report lacks recommendations.

## Feedback interface additions

The feedback filter contract accepts `order=newest|oldest` (default newest). `GET /api/v1/feedback/:id` additionally returns `{ navigation: { previousId, nextId } }`. Neighbors follow newest-first chronological order, break equal timestamps by response ID, and use the same workspace/branch authorization as the original response. Unavailable neighbors are `null`; unauthorized records never become navigation links.
