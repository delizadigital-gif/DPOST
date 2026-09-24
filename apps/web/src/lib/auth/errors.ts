interface AuthClientError {
  status?: number;
  code?: string | undefined;
  message?: string | undefined;
}

/** Turns a Better Auth client error into a message a non-technical user can act on. */
export function authErrorMessage(error: AuthClientError): string {
  if (error.status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password don’t match. Check them and try again.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Try logging in instead.';
    case 'INVALID_TOKEN':
      return 'This link is invalid or has expired. Please request a new one.';
    case 'PASSWORD_TOO_SHORT':
      return 'Your password needs at least 8 characters.';
    case 'PASSWORD_TOO_LONG':
      return 'Your password can be at most 128 characters.';
    case 'INVALID_EMAIL':
      return 'Please enter a valid email address.';
    default:
      if (error.status === 401)
        return 'That email and password don’t match. Check them and try again.';
      return 'Something went wrong. Please try again.';
  }
}
