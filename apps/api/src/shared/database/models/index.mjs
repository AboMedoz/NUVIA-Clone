import { userSchema } from './User.mjs';
import { sessionSchema } from './Session.mjs';
import { authTokenSchema } from './AuthToken.mjs';
import { workspaceSchema } from './Workspace.mjs';
import { branchSchema } from './Branch.mjs';
import { mailOutboxSchema } from './MailOutbox.mjs';
import { schemaVersionSchema } from './SchemaVersion.mjs';
import {
  surveySchema,
  surveyRevisionSchema,
  surveyLinkSchema,
  responseSchema,
  analysisJobSchema,
  membershipSchema,
  invitationSchema,
  reportSchema,
  businessPageSchema,
} from './Product.mjs';

export function createModels(connection) {
  const schemas = {
    User: userSchema,
    Session: sessionSchema,
    AuthToken: authTokenSchema,
    Workspace: workspaceSchema,
    Branch: branchSchema,
    MailOutbox: mailOutboxSchema,
    SchemaVersion: schemaVersionSchema,
    Survey: surveySchema,
    SurveyRevision: surveyRevisionSchema,
    SurveyLink: surveyLinkSchema,
    Response: responseSchema,
    AnalysisJob: analysisJobSchema,
    Membership: membershipSchema,
    Invitation: invitationSchema,
    Report: reportSchema,
    BusinessPage: businessPageSchema,
  };
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      connection.models[name] || connection.model(name, schema),
    ]),
  );
}
