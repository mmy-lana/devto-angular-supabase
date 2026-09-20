import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';
import { PreviewAppComponent } from './preview-app.component';
import '../styles.css';

bootstrapApplication(PreviewAppComponent, {
  providers: [provideZoneChangeDetection({ eventCoalescing: true })],
}).catch((error: unknown) => console.error(error));
