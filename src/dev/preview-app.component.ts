import { Component } from '@angular/core';
import { PrimitivePreviewComponent } from './primitive-preview.component';
import { MoleculePreviewComponent } from './molecule-preview.component';
import { DomainPreviewComponent } from './domain-preview.component';

/** Swallows harness navigation so clicking a link does not log a router error. */
@Component({ selector: 'app-preview-blank', template: '' })
export class PreviewBlankComponent {}

/** Dev-only harness that renders the whole design system for inspection. */
@Component({
  selector: 'app-preview-app',
  imports: [PrimitivePreviewComponent, MoleculePreviewComponent, DomainPreviewComponent],
  template: `
    <app-primitive-preview />
    <app-molecule-preview />
    <app-domain-preview />
  `,
})
export class PreviewAppComponent {}
