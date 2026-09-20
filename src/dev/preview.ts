import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';
import { PrimitivePreviewComponent } from './primitive-preview.component';
import '../styles.css';

bootstrapApplication(PrimitivePreviewComponent, {
  providers: [provideZoneChangeDetection({ eventCoalescing: true })],
}).catch((error: unknown) => console.error(error));
