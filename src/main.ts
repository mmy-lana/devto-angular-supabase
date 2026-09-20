import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { toErrorMessage } from './app/core/utils/error-message.util';
import './styles.css';

bootstrapApplication(AppComponent, appConfig).catch(renderBootstrapFailure);

/**
 * Renders a readable failure screen when the application cannot start.
 *
 * A missing Supabase configuration is deliberately absent from this path: the
 * application starts in offline mode and serves its bundled sample content, so
 * the screen below only covers genuine startup defects. Everything is built
 * through DOM APIs so an error message can never be interpreted as markup.
 */
function renderBootstrapFailure(error: unknown): void {
  console.error('[bootstrap] The application failed to start.', error);

  const host = document.querySelector('app-root');

  if (!host) {
    return;
  }

  host.replaceChildren(buildFailurePanel(error));
}

function buildFailurePanel(error: unknown): HTMLElement {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.className =
    'mx-auto my-10 max-w-xl rounded-md border border-[#d4d4d4] bg-white p-6 shadow-sm';

  const heading = document.createElement('h1');
  heading.className = 'text-lg font-bold text-[#171717]';
  heading.textContent = 'The application could not start';
  panel.append(heading);

  const detail = document.createElement('p');
  detail.className = 'mt-3 text-sm leading-relaxed text-[#575757]';
  detail.textContent = toErrorMessage(error, 'An unexpected error occurred during startup.');
  panel.append(detail);

  const hint = document.createElement('p');
  hint.className = 'mt-4 border-t border-[#e2e8f0] pt-4 text-xs leading-relaxed text-[#575757]';
  hint.textContent =
    'Reload the page to try again. If this screen reappears, check the browser console for the underlying error.';
  panel.append(hint);

  return panel;
}
