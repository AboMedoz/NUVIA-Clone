# Multiple businesses per account

The existing `workspaces` and `branches` collections now support multiple independent businesses. No IDs or ownership fields are rewritten. The active business belongs to the protected server session (`Session.workspaceId`); profile, password, security and notification preferences remain account-specific.

| Method | Route                           | Contract                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/workspaces`            | `{ workspaces }` with business ID/name/industry, owner/manager/viewer role and selected flag. Only owned workspaces or current memberships appear.                                                                                                                            |
| POST   | `/api/v1/workspaces`            | Verified account creates a separate business, its primary branch and session selection in one transaction. Body: `businessName`, `industry`, optional `locale`, `reportingTimezone`, `branchType`, `branchName`. Returns 201 `{ workspace }` with the ordinary workspace DTO. |
| POST   | `/api/v1/workspaces/:id/select` | Empty body, exact Origin and CSRF required. Verifies current ownership/membership, saves selection in this session, returns `{ workspace }`. Foreign or revoked selections return 404.                                                                                        |

Creating an independent owned business does not elevate a member's role in an existing business. Accepting another business invitation adds the scoped membership and selects that business in the accepting session. Existing owned businesses and memberships remain available in the business switcher. Selection is independent across separate login sessions; tabs sharing the same session share its server selection.

Legacy sessions without a selection retain deterministic owner-first/member fallback. A selected workspace that becomes inaccessible does not silently grant another workspace's access. The session view returns no workspace until an authorized selection is made. The supplied onboarding card then offers only remaining authorized businesses; it blocks replacement-business saving while that access list is loading or unavailable. Role and branch membership are resolved on every private request.

Existing `/workspace`, setup, product, branch, billing and action operations use the selected business. Explicit branch URLs cannot mutate a different business merely because the same user owns both businesses. Initial onboarding and additional business creation increment the private `User.workspaceVersion` inside transactions to serialize concurrent creation even when the clock is frozen.

## Stale tabs and downloads

The web HTTP client adds `X-Workspace-ID` to workspace-bound private reads/writes from the latest authoritative session/workspace DTO. When another tab changes the server selection, a stale request returns 409 `WORKSPACE_CHANGED` before reading or writing another business. The client clears protected state and refreshes the session without automatically replaying a mutation. Account-specific routes and business list/create/select routes remain usable when the old selected scope is unavailable. Notification listing and marking read are workspace-scoped exceptions; preference editing remains account-specific.

Feedback CSV links include `expectedWorkspaceId` in the query for the same validation because native downloads cannot attach custom headers. Report/evidence downloads also validate their record IDs within the current authorized workspace. Public survey/content routes and process liveness bypass incidental account-session resolution; an old account cookie cannot make public collection or `/health/live` depend on session storage.

## Existing database migration

Fresh databases declare the nonunique `workspace_owner_created` index. Existing databases may retain the old unique `ownerUserId_1` index. Ordinary schema setup adds indexes and never drops that legacy index. Attempting a second owned business under it returns 409 `WORKSPACE_MIGRATION_REQUIRED` and leaves existing documents and session selection intact.

An explicit operational script is available:

```sh
node apps/api/scripts/migrate-multi-workspace.mjs
# Review the preview and configured database before applying:
node apps/api/scripts/migrate-multi-workspace.mjs --apply
```

The default is read-only preview. Application adds the nonunique owner/creation index and removes only the exact known legacy index name/specification after rechecking it. Custom/sparse/partial/collated unique owner indexes require manual review. No documents, branches, customer data or IDs are deleted or rewritten. The script was tested only against isolated synthetic databases; it was not applied to the configured application database.
