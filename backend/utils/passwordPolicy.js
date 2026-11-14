// Password rules for NEW passwords (registration). Login does not use this,
// so existing accounts with older/weaker passwords can still sign in.
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyuiop',
  '12345678', '123456789', '1234567890', 'iloveyou', 'admin123', 'welcome1',
  'letmein123', 'abc12345', 'escrowx', 'escrowx123'
]);

export const validatePassword = (password, { email = '', name = '' } = {}) => {
  const pw = String(password ?? '');
  const errors = [];

  if (pw.length < MIN_LENGTH) errors.push(`At least ${MIN_LENGTH} characters`);
  if (pw.length > MAX_LENGTH) errors.push(`At most ${MAX_LENGTH} characters`);
  if (!/[a-z]/.test(pw)) errors.push('One lowercase letter');
  if (!/[A-Z]/.test(pw)) errors.push('One uppercase letter');
  if (!/\d/.test(pw)) errors.push('One number');
  if (!/[^A-Za-z0-9\s]/.test(pw)) errors.push('One special character');
  if (/\s/.test(pw)) errors.push('No spaces');
  if (/(.)\1{3,}/.test(pw)) errors.push('No character repeated 4+ times in a row');

  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) errors.push('Not a commonly used password');

  const emailLocal = String(email).split('@')[0].toLowerCase();
  if (emailLocal.length >= 3 && lower.includes(emailLocal)) errors.push('Must not contain your email name');

  const nameParts = String(name).toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (nameParts.some((p) => lower.includes(p))) errors.push('Must not contain your name');

  return { valid: errors.length === 0, errors };
};
