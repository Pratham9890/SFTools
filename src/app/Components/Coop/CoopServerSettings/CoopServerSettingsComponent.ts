import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {CoopServerConfig} from '@src/Model/Coop/CoopServerConfig';

/** The Supabase project the co-op feature talks to; stored on this device. */
@Component({
	selector: 'coop-server-settings',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './CoopServerSettingsComponent.html',
	imports: [FormsModule],
})
export class CoopServerSettingsComponent
{

	private readonly config = inject(CoopServerConfig);

	public serverAddress = this.config.url();
	public publicKey = this.config.key();

	public readonly error = signal<string | null>(null);
	public readonly saved = signal(false);

	public save(): void
	{
		const error = this.config.save(this.serverAddress, this.publicKey);
		this.error.set(error);
		this.saved.set(error === null);
		if (error !== null) {
			return;
		}
		this.serverAddress = this.config.url();
		this.publicKey = this.config.key();
	}

	public clear(): void
	{
		this.config.clear();
		this.serverAddress = this.config.url();
		this.publicKey = this.config.key();
		this.error.set(null);
		this.saved.set(false);
	}

}
