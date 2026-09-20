import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/**
 * Sticky bottom navigation for phone viewports (360–430px).
 *
 * The centre action changes with the session: signed-in readers get the create
 * shortcut, visitors get the sign-in prompt. Every target is at least 44px tall
 * so it stays inside the comfortable thumb zone.
 */
@Component({
  selector: 'app-mobile-bottom-bar',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav
      aria-label="Mobile navigation"
      class="sm:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-[#e2e8f0] flex items-center justify-around z-40 px-2 shadow-lg"
    >
      <a
        routerLink="/"
        routerLinkActive="text-[#3b49df]"
        [routerLinkActiveOptions]="{ exact: true }"
        class="flex flex-col items-center justify-center w-16 h-full text-gray-500 text-[10px] font-medium"
      >
        <app-icon name="home" size="md" />
        <span>Feed</span>
      </a>

      @if (authService.isAuthenticated()) {
        <a
          routerLink="/new"
          class="flex items-center justify-center w-11 h-11 rounded-full bg-[#3b49df] text-white shadow-md active:scale-95 transition-transform"
          aria-label="Create post"
        >
          <app-icon name="plus" size="md" />
        </a>
      } @else {
        <button
          type="button"
          class="flex items-center justify-center w-11 h-11 rounded-full bg-[#3b49df] text-white shadow-md active:scale-95 transition-transform"
          aria-label="Sign in"
          (click)="authService.openAuthModal()"
        >
          <app-icon name="user" size="md" />
        </button>
      }

      <a
        routerLink="/bookmarks"
        routerLinkActive="text-[#3b49df]"
        class="flex flex-col items-center justify-center w-16 h-full text-gray-500 text-[10px] font-medium"
      >
        <app-icon name="bookmark" size="md" />
        <span>Reading List</span>
      </a>
    </nav>
  `,
})
export class MobileBottomBarComponent {
  protected readonly authService = inject(AuthService);
}
