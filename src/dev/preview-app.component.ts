import { Component } from '@angular/core';
import { PrimitivePreviewComponent } from './primitive-preview.component';
import { MoleculePreviewComponent } from './molecule-preview.component';

/** Dev-only harness that renders the whole design system for inspection. */
@Component({
  selector: 'app-preview-app',
  imports: [PrimitivePreviewComponent, MoleculePreviewComponent],
  template: `
    <app-primitive-preview />
    <app-molecule-preview />
  `,
})
export class PreviewAppComponent {}
