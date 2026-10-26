import { userSchema } from './User.mjs';
import { sessionSchema } from './Session.mjs';
import { authTokenSchema } from './AuthToken.mjs';
import { workspaceSchema } from './Workspace.mjs';
import { branchSchema } from './Branch.mjs';
import { mailOutboxSchema } from './MailOutbox.mjs';
import { schemaVersionSchema } from './SchemaVersion.mjs';
import { notificationSchema } from './Account.mjs';
import { oauthStateSchema } from './OAuthState.mjs';
import { billingAccountSchema, billingEventSchema } from './Billing.mjs';
import { actionSchema } from './Actions.mjs';
import { contactSchema } from './ContactRequest.mjs';
import {
  surveySchema,
  surveyRevisionSchema,
  surveyLinkSchema,
  surveyStartSchema,
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
    Notification: notificationSchema,
    OAuthState: oauthStateSchema,
    BillingAccount: billingAccountSchema,
    BillingEvent: billingEventSchema,
    Action: actionSchema,
    ContactRequest: contactSchema,
    Session: sessionSchema,
    AuthToken: authTokenSchema,
    Workspace: workspaceSchema,
    Branch: branchSchema,
    MailOutbox: mailOutboxSchema,
    SchemaVersion: schemaVersionSchema,
    Survey: surveySchema,
    SurveyRevision: surveyRevisionSchema,
    SurveyLink: surveyLinkSchema,
    SurveyStart: surveyStartSchema,
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
