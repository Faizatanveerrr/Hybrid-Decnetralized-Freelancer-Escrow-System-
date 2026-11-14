/**
 * Who is this user on a given project?
 *
 * The "Client mode / Freelancer mode" switch is just a workspace preference. Whether you may
 * fund, approve, submit or dispute depends on your actual relationship to the project, so on a
 * project page the role comes from the project itself. The mode only decides what you see where
 * you are not (yet) a party, e.g. browsing open projects as a freelancer to send a proposal.
 */
export const idOf = (value) => String(value?._id || value?.id || value || '');

export const roleForProject = (project, user, modeRole) => {
  const me = idOf(user);
  if (project && me) {
    if (idOf(project.client) === me) return 'client';
    if (project.freelancer && idOf(project.freelancer) === me) return 'freelancer';
  }
  return modeRole;
};
