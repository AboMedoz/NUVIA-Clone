import React, { useState } from 'react';
import { useResource, useMutation } from '../product/useResource.js';
import { productApi } from '../product/api.js';
import { isOwner } from '../product/product-state.js';
import { DataTable, ErrorNotice, ResourceState, Status } from '../product/ui.jsx';
function MemberBranches({ member, workspace, language, mutation, reload }) {
  const [selected, setSelected] = useState(member.branchIds || []),
    t = (a, b) => (language === 'ar' ? b : a);
  return (
    <details>
      <summary>{t('Edit branch assignments', 'تعديل الفروع المخصصة')}</summary>
      <div className="product-form" style={{ marginTop: 12 }}>
        {workspace.branches
          ?.filter((b) => !b.archivedAt)
          .map((branch) => (
            <label className="product-check" key={branch.id}>
              <input
                type="checkbox"
                checked={selected.includes(branch.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked ? [...old, branch.id] : old.filter((id) => id !== branch.id),
                  )
                }
              />
              {branch.name}
            </label>
          ))}
        <button
          disabled={mutation.busy || !selected.length}
          onClick={async () => {
            const result = await mutation.run((signal) =>
              productApi.send(
                '/team/members/' + member.id,
                { branchIds: selected },
                'PATCH',
                signal,
              ),
            );
            if (result) reload();
          }}
        >
          {t('Save assignments', 'حفظ الفروع')}
        </button>
      </div>
    </details>
  );
}
export default function TeamPage({ language, workspace, page }) {
  const t = (a, b) => (language === 'ar' ? b : a),
    resource = useResource(isOwner(workspace) ? '/team' : null),
    mutation = useMutation(),
    [email, setEmail] = useState(''),
    [role, setRole] = useState('viewer'),
    [branchIds, setBranchIds] = useState([]),
    [accepted, setAccepted] = useState(false),
    [emailError, setEmailError] = useState(false),
    [invitationUrl, setInvitationUrl] = useState('');
  const token = new URLSearchParams(location.hash.split('?')[1]).get('token');
  async function invite(e) {
    e.preventDefault();
    if (mutation.busy) return;
    if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError(true);
      e.currentTarget.elements.namedItem('invitation-email')?.focus();
      return;
    }
    if (!branchIds.length) return;
    setEmailError(false);
    const result = await mutation.run((signal) =>
      productApi.send(
        '/team/invitations',
        { email: email.trim(), role, branchIds },
        'POST',
        signal,
      ),
    );
    if (result) {
      setInvitationUrl(result.invitation?.acceptUrl || '');
      setEmail('');
      resource.reload();
    }
  }
  return (
    <>
      <div className="product-heading">
        <div>
          <h1>{t('Business & Teams', 'النشاط والفريق')}</h1>
          <p>
            {t(
              'Manage access for the people working with your feedback.',
              'أدر صلاحيات الأشخاص الذين يتابعون آراء العملاء.',
            )}
          </p>
        </div>
        <a className="product-button" href="#/branches">
          {t('Manage branches', 'إدارة الفروع')}
        </a>
      </div>
      {!isOwner(workspace) && (
        <p className="product-notice">
          {t('Your role: ', 'دورك: ')}
          {workspace.role}.{' '}
          {t(
            'Only the owner can manage team access. Your assigned branches are available in Branches.',
            'يمكن للمالك فقط إدارة الفريق. تجد الفروع المخصصة لك في صفحة الفروع.',
          )}
        </p>
      )}
      {invitationUrl && (
        <section className="product-card">
          <h2>{t('Invitation created', 'تم إنشاء الدعوة')}</h2>
          <p>
            {t(
              'Share this private link with your teammate. They must sign in with the invited email.',
              'شارك هذا الرابط الخاص مع العضو. يجب تسجيل الدخول بالبريد المدعو.',
            )}
          </p>
          <a href={invitationUrl}>{invitationUrl}</a>
          <button onClick={() => navigator.clipboard.writeText(invitationUrl).catch(() => {})}>
            {t('Copy invitation link', 'نسخ رابط الدعوة')}
          </button>
        </section>
      )}
      {page === 'team-accept' && token && (
        <section className="product-card">
          <h2>{t('Accept team invitation', 'قبول دعوة الفريق')}</h2>
          <button
            className="primary"
            disabled={accepted || mutation.busy}
            onClick={async () => {
              const result = await mutation.run((signal) =>
                productApi.send('/team/accept', { token }, 'POST', signal),
              );
              if (result) {
                setAccepted(true);
                window.dispatchEvent(new Event('nuvia:session-expired'));
              }
            }}
          >
            {accepted
              ? t('Invitation accepted', 'تم قبول الدعوة')
              : t('Accept invitation', 'قبول الدعوة')}
          </button>
        </section>
      )}
      <ErrorNotice error={mutation.error} language={language} />
      <ResourceState resource={resource} language={language} />
      <section className="product-card">
        <h2>{t('Team members', 'أعضاء الفريق')}</h2>
        <DataTable
          headings={[
            t('Member', 'العضو'),
            t('Role', 'الدور'),
            t('Branches', 'الفروع'),
            t('Actions', 'الإجراءات'),
          ]}
        >
          {(resource.data?.members || []).map((member) => (
            <tr key={member.id}>
              <td>
                {member.name || member.email}
                <p>{member.email}</p>
              </td>
              <td>
                {isOwner(workspace) && member.role !== 'owner' ? (
                  <select
                    aria-label={t('Role for ', 'دور ') + member.email}
                    value={member.role}
                    disabled={mutation.busy}
                    onChange={async (e) => {
                      const result = await mutation.run((signal) =>
                        productApi.send(
                          '/team/members/' + member.id,
                          { role: e.target.value, branchIds: member.branchIds || [] },
                          'PATCH',
                          signal,
                        ),
                      );
                      if (result) resource.reload();
                    }}
                  >
                    <option value="manager">{t('Manager', 'مدير')}</option>
                    <option value="viewer">{t('Viewer', 'مشاهد')}</option>
                  </select>
                ) : (
                  member.role
                )}
              </td>
              <td>
                {member.role === 'owner'
                  ? t('All branches', 'كل الفروع')
                  : (member.branchIds || [])
                      .map((id) => workspace.branches?.find((b) => b.id === id)?.name || id)
                      .join(', ')}
                {isOwner(workspace) && member.role !== 'owner' && (
                  <MemberBranches
                    {...{ member, workspace, language, mutation }}
                    reload={resource.reload}
                  />
                )}
              </td>
              <td>
                {isOwner(workspace) && member.role !== 'owner' && (
                  <button
                    disabled={mutation.busy}
                    onClick={async () => {
                      const result = await mutation.run((signal) =>
                        productApi.send('/team/members/' + member.id, undefined, 'DELETE', signal),
                      );
                      if (result !== null) resource.reload();
                    }}
                  >
                    {t('Revoke access', 'إلغاء الوصول')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
      {isOwner(workspace) && (
        <section className="product-card">
          <h2>{t('Invite a teammate', 'دعوة عضو')}</h2>
          <form className="product-form" onSubmit={invite} noValidate>
            <div className="product-inline">
              <label>
                {t('Email', 'البريد الإلكتروني')}
                <input
                  type="email"
                  name="invitation-email"
                  required
                  maxLength={254}
                  aria-invalid={emailError || undefined}
                  aria-describedby={emailError ? 'invitation-email-error' : undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(false);
                  }}
                />
                {emailError && (
                  <span id="invitation-email-error" role="alert">
                    {t('Enter a valid email address.', 'أدخل بريدًا إلكترونيًا صالحًا.')}
                  </span>
                )}
              </label>
              <label>
                {t('Role', 'الدور')}
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="viewer">{t('Viewer', 'مشاهد')}</option>
                  <option value="manager">{t('Manager', 'مدير')}</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>{t('Assigned branches', 'الفروع المخصصة')}</legend>
              <div className="product-actions">
                {workspace.branches
                  ?.filter((b) => !b.archivedAt)
                  .map((branch) => (
                    <label className="product-check" key={branch.id}>
                      <input
                        type="checkbox"
                        checked={branchIds.includes(branch.id)}
                        onChange={(e) =>
                          setBranchIds((old) =>
                            e.target.checked
                              ? [...old, branch.id]
                              : old.filter((id) => id !== branch.id),
                          )
                        }
                      />
                      {branch.name}
                    </label>
                  ))}
              </div>
            </fieldset>
            <p>
              {t(
                'Managers can manage surveys for their branches. Viewers can read and export authorized evidence.',
                'يمكن للمديرين إدارة استبيانات فروعهم. يمكن للمشاهدين قراءة وتصدير الأدلة المسموح بها.',
              )}
            </p>
            <button className="primary" disabled={mutation.busy || !email || !branchIds.length}>
              {t('Create invitation', 'إنشاء دعوة')}
            </button>
          </form>
        </section>
      )}
      <section className="product-card">
        <h2>{t('Pending invitations', 'الدعوات المعلقة')}</h2>
        {(resource.data?.invitations || []).map((invite) => (
          <div className="product-inline" key={invite.id}>
            <p>
              {invite.email} · {invite.role}
            </p>
            <Status value={invite.status || 'pending'} language={language} />
            {isOwner(workspace) && (
              <button
                disabled={mutation.busy}
                onClick={async () => {
                  await mutation.run((signal) =>
                    productApi.send('/team/invitations/' + invite.id, undefined, 'DELETE', signal),
                  );
                  resource.reload();
                }}
              >
                {t('Revoke invitation', 'إلغاء الدعوة')}
              </button>
            )}
          </div>
        ))}
        {resource.data && !resource.data.invitations?.length && (
          <p>{t('No pending invitations.', 'لا توجد دعوات معلقة.')}</p>
        )}
      </section>
    </>
  );
}
