import type { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { FeedPageComponent } from './features/feed/feed-page.component';
import { ShellComponent } from './layout/shell.component';

/**
 * Application route table.
 *
 * Everything renders inside `ShellComponent`, so the header, the mobile dock and
 * the auth modal are mounted once and survive navigation. The feed reads its
 * filters from query parameters, which is how a tag view (`/?tag=angular`), a
 * search (`/?q=signals`) or the reading list (`/bookmarks`) stays linkable.
 *
 * The feed ships in the initial bundle because it is the entry screen; every
 * other route is fetched on demand.
 */
export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        component: FeedPageComponent,
        title: 'DEV Community - Where developers learn and share',
      },
      {
        path: 'bookmarks',
        component: FeedPageComponent,
        data: { readingList: true },
        title: 'Reading List - DEV Community',
      },
      {
        path: 'tags',
        loadComponent: () =>
          import('./features/tags/tags-page.component').then((m) => m.TagsPageComponent),
        title: 'Tags - DEV Community',
      },
      {
        path: 'post/:slug',
        loadComponent: () =>
          import('./features/post-detail/post-detail-page.component').then(
            (m) => m.PostDetailPageComponent,
          ),
        title: 'Post - DEV Community',
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/editor/post-editor-page.component').then(
            (m) => m.PostEditorPageComponent,
          ),
        canActivate: [authGuard],
        title: 'New Post - DEV Community',
      },
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];
