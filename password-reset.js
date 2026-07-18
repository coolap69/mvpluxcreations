function passwordResetClient() {
  return window.getMvpluxSupabaseClient?.() || null;
}

function setPasswordResetStatus(message, isError = false) {
  const status = document.getElementById('passwordResetStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('auth-error', isError);
  status.classList.toggle('auth-success', !isError && Boolean(message));
}

function passwordResetRedirectUrl() {
  const allowedOrigins = new Set([
    'http://localhost:3000',
    'https://mvpluxcreations.com'
  ]);
  const origin = allowedOrigins.has(window.location.origin)
    ? window.location.origin
    : 'https://mvpluxcreations.com';
  return `${origin}/reset-password.html`;
}

async function submitForgotPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const email = form.elements.email.value.trim().toLowerCase();
  const client = passwordResetClient();

  if (!client?.auth) {
    setPasswordResetStatus('The password reset service is unavailable right now. Please try again.', true);
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending...';
  setPasswordResetStatus('');
  try {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirectUrl()
    });
    if (error) throw error;
    setPasswordResetStatus('Check your email for a secure password reset link.');
    form.reset();
  } catch (error) {
    setPasswordResetStatus(error?.message || 'Could not send the reset email. Please try again.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Send Reset Link';
  }
}

async function submitNewPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const password = form.elements.password.value;
  const confirmation = form.elements.confirmPassword.value;
  const client = passwordResetClient();

  if (password !== confirmation) {
    setPasswordResetStatus('The passwords do not match.', true);
    return;
  }
  if (password.length < 8) {
    setPasswordResetStatus('Use at least 8 characters for your new password.', true);
    return;
  }
  if (!client?.auth) {
    setPasswordResetStatus('The password reset service is unavailable right now. Please request a new link.', true);
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';
  setPasswordResetStatus('');
  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData?.session) throw new Error('This reset link is invalid or expired. Please request a new one.');

    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    setPasswordResetStatus('Your password has been updated. Returning to Sign In...');
    window.setTimeout(() => window.location.assign('signin.html'), 1200);
  } catch (error) {
    setPasswordResetStatus(error?.message || 'Could not update the password. Please request a new reset link.', true);
    button.disabled = false;
    button.textContent = 'Save New Password';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('forgotPasswordForm')?.addEventListener('submit', submitForgotPassword, { once: false });
  document.getElementById('updatePasswordForm')?.addEventListener('submit', submitNewPassword, { once: false });
});
