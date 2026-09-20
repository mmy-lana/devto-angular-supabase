import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { AuthModalComponent } from '../features/auth/auth-modal.component';
import { AppHeaderComponent } from './app-header/app-header.component';
import { MobileBottomBarComponent } from './mobile-bottom-bar/mobile-bottom-bar.component';
import { OfflineNoticeComponent } from './offline-notice/offline-notice.component';

/**
 * Application shell: sticky header, routed page and the mobile bottom dock.
 *
 * The dock is hidden on the post detail route, where the reaction rail docks to
 * the same edge; showing both would stack two fixed bars over the article.
 *
 * The offline notice lives here rather than on each page: it describes the
 * application's data source, which is a single fact that must never be repeated
 * or contradicted by another screen.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    MobileBottomBarComponent,
    AuthModalComponent,
    OfflineNoticeComponent,
  ],
  template: `
    <div class="min-h-screen flex flex-col bg-[#f5f5f5]">
      <app-header />

      <app-offline-notice />

      <main class="flex-1 pb-16 sm:pb-8">
        <router-outlet />
      </main>

      @if (!hidesMobileBar()) {
        <app-mobile-bottom-bar />
      }

      @if (authService.isAuthModalOpen()) {
        <app-auth-modal (closed)="authService.closeAuthModal()" />
      }
    </div>
  `,
})
export class ShellComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /** Current URL, re-emitted on every completed navigation. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Post detail renders its own bottom rail below 1024px. */
  protected readonly hidesMobileBar = computed(() => this.currentUrl().startsWith('/post/'));
}
