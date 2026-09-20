import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { SupabaseConfigurationError } from './app/core/services/supabase.service';
import { toErrorMessage } from './app/core/utils/error-message.util';
import './styles.css';

bootstrapApplication(AppComponent, appConfig).catch(renderBootstrapFailure);

/**
 * Renders a readable failure screen when the application cannot start.
 *
 * The most common cause is a build without Supabase credentials, which is why
 * that case also gets step-by-step remediation. Everything is built through DOM
 * APIs so an error message can never be interpreted as markup.
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

  if (error instanceof SupabaseConfigurationError) {
    panel.append(buildConfigurationSteps(error.missingVariables));
  }

  return panel;
}

function buildConfigurationSteps(missingVariables: readonly string[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'mt-5 border-t border-[#e2e8f0] pt-4';

  const title = document.createElement('h2');
  title.className = 'text-sm font-semibold text-[#171717]';
  title.textContent = 'Finish the local setup';
  wrapper.append(title);

  if (missingVariables.length > 0) {
    const missing = document.createElement('p');
    missing.className = 'mt-2 text-xs font-mono text-[#b91c1c]';
    missing.textContent = `Missing: ${missingVariables.join(', ')}`;
    wrapper.append(missing);
  }

  const steps = document.createElement('ol');
  steps.className = 'mt-3 list-decimal space-y-1.5 pl-5 text-sm text-[#575757]';

  for (const step of [
    'Copy .env.example to .env at the project root.',
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase → Project Settings → API.',
    'Run the migration from plan.md in the Supabase SQL editor.',
    'Restart the dev server so Vite picks up the new variables.',
  ]) {
    const item = document.createElement('li');
    item.textContent = step;
    steps.append(item);
  }

  wrapper.append(steps);
  return wrapper;
}
