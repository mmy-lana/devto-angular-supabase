import { Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/** Reads one query parameter out of a router URL. */
function queryParam(url: string, name: string): string {
  const queryStart = url.indexOf('?');

  if (queryStart === -1) {
    return '';
  }

  return new URLSearchParams(url.slice(queryStart + 1)).get(name) ?? '';
}

/**
 * Persistent application header.
 *
 * The search box writes its term into the URL (`/?q=…`) rather than holding a
 * private copy, so a search survives a refresh and can be shared. On phones the
 * field collapses behind a toggle and reopens prefilled with the active query.
 *
 * The account menu is click driven — not hover only — so it works with a
 * keyboard and on touch devices, and it closes on Escape or any outside click.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, AvatarComponent, ButtonComponent, IconComponent],
  host: {
    '(document:keydown.escape)': 'handleEscape()',
    '(document:click)': 'handleDocumentClick($event)',
  },
  template: `
    <header class="sticky top-0 z-40 bg-white border-b border-[#e2e8f0]">
      <div class="max-w-7xl mx-auto h-14 px-3 sm:px-4 flex items-center justify-between gap-2">
        <div class="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
          <a routerLink="/" class="flex items-center shrink-0" aria-label="DEV Community home">
            <span
              class="bg-black text-white font-black text-lg sm:text-xl px-2.5 py-1 rounded tracking-tight font-mono hover:bg-[#3b49df] transition-colors"
            >
              DEV
            </span>
          </a>

          <form class="relative w-full max-w-md hidden sm:block" (submit)="submitSearch($event)">
            <label class="sr-only" for="header-search">Search posts</label>
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <app-icon name="search" size="sm" />
            </span>
            <input
              id="header-search"
              type="search"
              name="q"
              [value]="searchTerm()"
              placeholder="Search posts, tags, authors..."
              class="w-full min-h-9 pl-9 pr-3 py-1.5 text-sm border border-[#d4d4d4] rounded-md bg-gray-50 focus:border-[#3b49df] focus:ring-1 focus:ring-[#3b49df] focus:outline-none"
              (input)="onSearchInput($event)"
            />
          </form>

          <button
            type="button"
            class="sm:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded text-gray-700 hover:bg-gray-100"
            [attr.aria-expanded]="mobileSearchOpen()"
            aria-controls="header-mobile-search"
            [attr.aria-label]="mobileSearchOpen() ? 'Close search' : 'Search posts'"
            (click)="toggleMobileSearch()"
          >
            <app-icon [name]="mobileSearchOpen() ? 'close' : 'search'" size="md" />
          </button>
        </div>

        <div class="flex items-center space-x-2 sm:space-x-3 shrink-0">
          @if (authService.isAuthenticated()) {
            <a routerLink="/new" class="hidden sm:inline-block">
              <app-button variant="secondary" size="md">Create Post</app-button>
            </a>

            @if (authService.currentProfile(); as profile) {
              <div class="relative header-user-menu py-1">
                <button
                  type="button"
                  class="flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b49df]"
                  [attr.aria-expanded]="menuOpen()"
                  aria-haspopup="menu"
                  [attr.aria-label]="'Account menu for ' + profile.fullName"
                  (click)="toggleMenu()"
                >
                  <app-avatar
                    [src]="profile.avatarUrl"
                    [alt]="profile.fullName"
                    [fallbackSeed]="profile.username"
                    size="sm"
                  />
                </button>

                @if (menuOpen()) {
                  <div
                    role="menu"
                    class="absolute right-0 mt-2 w-52 bg-white border border-[#d4d4d4] rounded-md shadow-lg py-1 z-50"
                  >
                    <div class="px-4 py-2 border-b border-gray-100">
                      <p class="text-xs font-bold text-gray-900 truncate">{{ profile.fullName }}</p>
                      <p class="text-[11px] text-gray-500 font-mono truncate">
                        &#64;{{ profile.username }}
                      </p>
                    </div>

                    <a
                      role="menuitem"
                      routerLink="/new"
                      class="block px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      (click)="closeMenu()"
                    >
                      Create Post
                    </a>
                    <a
                      role="menuitem"
                      routerLink="/bookmarks"
                      class="block px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      (click)="closeMenu()"
                    >
                      Reading List
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      class="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-gray-100 disabled:text-gray-400"
                      [disabled]="authService.isPending()"
                      (click)="signOut()"
                    >
                      {{ authService.isPending() ? 'Signing out…' : 'Sign Out' }}
                    </button>
                  </div>
                }
              </div>
            }
          } @else {
            <button
              type="button"
              class="text-sm text-gray-700 hover:text-[#3b49df] px-2 sm:px-3 min-h-11"
              (click)="authService.openAuthModal()"
            >
              Log in
            </button>
            <app-button variant="secondary" size="sm" (clicked)="authService.openAuthModal()">
              Create account
            </app-button>
          }
        </div>
      </div>

      @if (mobileSearchOpen()) {
        <form
          id="header-mobile-search"
          class="sm:hidden border-t border-[#e2e8f0] bg-white px-3 py-2"
          (submit)="submitSearch($event)"
        >
          <label class="sr-only" for="header-mobile-search-input">Search posts</label>
          <input
            #mobileSearchInput
            id="header-mobile-search-input"
            type="search"
            name="q-mobile"
            [value]="searchTerm()"
            placeholder="Search posts, tags, authors..."
            class="w-full min-h-11 px-3 text-sm border border-[#d4d4d4] rounded-md focus:border-[#3b49df] focus:ring-1 focus:ring-[#3b49df] focus:outline-none"
            (input)="onSearchInput($event)"
          />
        </form>
      }
    </header>
  `,
})
export class AppHeaderComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly mobileSearchInput = viewChild<ElementRef<HTMLInputElement>>('mobileSearchInput');

  protected readonly mobileSearchOpen = signal<boolean>(false);
  protected readonly menuOpen = signal<boolean>(false);
  /** Mirrors the active `?q=` query parameter so the field stays in sync. */
  protected readonly searchTerm = signal<string>('');

  constructor() {
    // The search field only exists once the toggle has rendered, so focus is
    // applied from an effect rather than from the click handler.
    effect(() => {
      const input = this.mobileSearchInput();

      if (this.mobileSearchOpen() && input) {
        input.nativeElement.focus();
      }
    });

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.searchTerm.set(queryParam(event.urlAfterRedirects, 'q'));
        this.mobileSearchOpen.set(false);
      });

    this.searchTerm.set(queryParam(this.router.url, 'q'));
  }

  protected onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected submitSearch(event: Event): void {
    event.preventDefault();
    const term = this.searchTerm().trim();

    void this.router.navigate(['/'], { queryParams: term.length > 0 ? { q: term } : {} });

    this.mobileSearchOpen.set(false);
  }

  protected toggleMobileSearch(): void {
    this.mobileSearchOpen.update((open) => !open);
  }

  /** Escape closes the account menu and collapses the mobile search field. */
  protected handleEscape(): void {
    this.closeMenu();
    this.mobileSearchOpen.set(false);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (!target?.closest('.header-user-menu')) {
      this.closeMenu();
    }
  }

  protected async signOut(): Promise<void> {
    this.closeMenu();
    await this.authService.signOut();
  }
}
