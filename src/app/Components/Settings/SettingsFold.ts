import {InjectionToken} from '@angular/core';

/** Provided by the planner's settings sheet: long sections start folded there. The app's Settings page shows them in full. */
export const SETTINGS_FOLD = new InjectionToken<true>('settings fold');
