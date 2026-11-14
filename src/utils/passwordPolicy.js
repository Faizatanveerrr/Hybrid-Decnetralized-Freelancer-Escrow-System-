// Mirrors backend/utils/passwordPolicy.js. Keep both in sync.
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyuiop',
  '12345678', '123456789', '1234567890', 'iloveyou', 'admin123', 'welcome1',
  'letmein123', 'abc12345', 'escrowx', 'escrowx123'
]);

// Live checklist: [{ id, label, ok }]
export const getPasswordChecks = (password, { email = '', name = '' } = {}) => {
  const pw = String(password ?? '');
  const lower = pw.toLowerCase();
  const emailLocal = String(email).split('@')[0].toLowerCase();
  const nameParts = String(name).toLowerCase().split(/\s+/).filter((p) => p.length >= 3);

  return [
    { id: 'length', label: `${MIN_LENGTH}-${MAX_LENGTH} characters`, ok: pw.length >= MIN_LENGTH && pw.length <= MAX_LENGTH },
    { id: 'lower', label: 'One lowercase letter', ok: /[a-z]/.test(pw) },
    { id: 'upper', label: 'One uppercase letter', ok: /[A-Z]/.test(pw) },
    { id: 'number', label: 'One number', ok: /\d/.test(pw) },
    { id: 'special', label: 'One special character (!@#$...)', ok: /[^A-Za-z0-9\s]/.test(pw) },
    { id: 'spaces', label: 'No spaces', ok: pw.length > 0 && !/\s/.test(pw) },
    { id: 'repeat', label: 'No character repeated 4+ times', ok: pw.length > 0 && !/(.)\1{3,}/.test(pw) },
    { id: 'common', label: 'Not a common password', ok: pw.length > 0 && !COMMON.has(lower) },
    {
      id: 'personal',
      label: 'Does not contain your name or email',
      ok: pw.length > 0 && !(emailLocal.length >= 3 && lower.includes(emailLocal)) && !nameParts.some((p) => lower.includes(p))
    }
  ];
};

export const validatePassword = (password, ctx) => {
  const checks = getPasswordChecks(password, ctx);
  return { valid: checks.every((c) => c.ok), checks };
};

// 0-4 score + label/colour classes for the strength bar
export const getStrength = (password) => {
  const pw = String(password ?? '');
  if (!pw) return { score: 0, label: '', bar: 'bg-slate-200', text: 'text-slate-400' };
  let score = 0;
  if (pw.length >= MIN_LENGTH) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9\s]/.test(pw)) score++;
  const map = [
    { label: 'Very weak', bar: 'bg-rose-500', text: 'text-rose-600' },
    { label: 'Weak', bar: 'bg-rose-500', text: 'text-rose-600' },
    { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-600' },
    { label: 'Good', bar: 'bg-emerald-500', text: 'text-emerald-600' },
    { label: 'Strong', bar: 'bg-emerald-600', text: 'text-emerald-700' }
  ];
  return { score, ...map[score] };
};

export const isValidWalletAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value ?? '').trim());
