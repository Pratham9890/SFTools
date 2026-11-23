import {ChangeDetectionStrategy, Component, effect, inject, signal, untracked} from '@angular/core';
import {RouterLink} from '@angular/router';
import {CoopServerSettingsComponent} from '@src/Components/Coop/CoopServerSettings/CoopServerSettingsComponent';
import {CoopApi} from '@src/Model/Coop/CoopApi';
import {CoopSession} from '@src/Model/Coop/CoopSession';
import {PlanFileOpenService} from '@src/Model/PlanFiles/PlanFileOpenService';

/** What a "Send a copy" link opens: the stored plan file goes through the usual import dialog. */
@Component({
	selector: 'plan-copy',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './PlanCopyComponent.html',
	imports: [RouterLink, CoopServerSettingsComponent],
})
export class PlanCopyComponent
{

	private readonly api = inject(CoopApi);
	private readonly opener = inject(PlanFileOpenService);

	public readonly configured = inject(CoopSession).configured;

	/** '#<id>', as carried by the link. */
	public readonly id = /^#([0-9a-f]{32})$/i.exec(window.location.hash)?.[1] ?? null;

	public readonly busy = signal(false);
	public readonly error = signal<string | null>(null);

	public constructor()
	{
		// The server can be entered on this page; the copy then loads from it.
		effect(() => {
			if (this.configured()) {
				untracked(() => void this.open());
			}
		});
	}

	public async open(): Promise<void>
	{
		if (this.id === null || this.busy()) {
			return;
		}
		this.busy.set(true);
		this.error.set(null);
		try {
			const copy = await this.api.copy(this.id);
			if (copy === null) {
				this.error.set('This copy does not exist any more. Ask for a new link.');
				return;
			}
			await this.opener.open({name: `${copy.name}.sft`, content: copy.content});
		} catch (error) {
			console.error(error);
			this.error.set('Could not load the copy. Check your connection and try again.');
		} finally {
			this.busy.set(false);
		}
	}

}
