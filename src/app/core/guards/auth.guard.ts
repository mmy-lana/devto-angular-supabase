import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes that require a signed-in user (post creation, editing).
 *
 * Anonymous visitors are redirected to the feed with the sign-in modal already
 * open, so the interruption is actionable instead of a dead end.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  authService.openAuthModal();
  return router.parseUrl('/');
};
