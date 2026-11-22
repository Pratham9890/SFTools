import {Injectable, Signal, signal} from '@angular/core';

/**
 * The planner's one settings sheet, opened by the top bar's gear. The state lives at the root because
 * the top bar, the co-op box and the dock's 'settings' entry all open it, while the planner renders it.
 */
@Injectable({providedIn: 'root'})
export class SettingsSheetService
{

	private readonly openSignal = signal(false);
	private readonly sectionSignal = signal<string | null>(null);
	private readonly requestSignal = signal(0);

	public readonly isOpen: Signal<boolean> = this.openSignal.asReadonly();

	/** The section the caller asked to show, by its data-settings-section name. */
	public readonly section: Signal<string | null> = this.sectionSignal.asReadonly();

	/** Bumped on every open, so asking for the section already shown scrolls to it again. */
	public readonly request: Signal<number> = this.requestSignal.asReadonly();

	/** Opens on the requested section, or at the top when none is named. */
	public open(section: string | null = null): void
	{
		this.sectionSignal.set(section);
		this.requestSignal.update(count => count + 1);
		this.openSignal.set(true);
	}

	public close(): void
	{
		this.openSignal.set(false);
	}

	public toggle(): void
	{
		if (this.openSignal()) {
			this.close();
			return;
		}
		this.open();
	}

}
