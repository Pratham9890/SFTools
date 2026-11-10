import {ChangeDetectionStrategy, Component, Signal, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router, RouterLink} from '@angular/router';
import {CoopAccessDeniedError, CoopPlayer} from '@src/Model/Coop/CoopApi';
import {COOP_COLORS, CoopSession} from '@src/Model/Coop/CoopSession';
import {VersionManager} from '@src/Model/Data/VersionManager';

/** What an invite link opens: the fragment holds the space and its token, so nothing is fetched until it parses. */
@Component({
	selector: 'coop-join',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './CoopJoinComponent.html',
	styles: [`
		.swatch {
			width: 26px;
			height: 26px;
			border-radius: 50%;
			border: 2px solid transparent;
			padding: 0;
		}
		.swatch.selected {
			border-color: var(--bs-light);
			box-shadow: 0 0 0 2px var(--bs-dark);
		}
	`],
	imports: [FormsModule, RouterLink],
})
export class CoopJoinComponent
{

	public readonly colors = COOP_COLORS;

	private readonly coop = inject(CoopSession);
	private readonly versionManager = inject(VersionManager);
	private readonly router = inject(Router);

	public readonly player: Signal<CoopPlayer | null> = this.coop.player;

	/** '#<spaceId>.<token>', as carried by the invite link. */
	public readonly invite = CoopSession.parseInvite(window.location.hash.replace(/^#/, ''));

	public playerName = '';
	public playerColor = COOP_COLORS[0];

	public readonly busy = signal(false);
	public readonly error = signal<string | null>(null);

	public constructor()
	{
		if (this.invite !== null && this.player() !== null) {
			void this.join();
		}
	}

	public submit(): void
	{
		const name = this.playerName.trim();
		if (name === '' || this.invite === null) {
			return;
		}
		this.coop.setPlayer(name.slice(0, 40), this.playerColor);
		void this.join();
	}

	public async join(): Promise<void>
	{
		if (this.invite === null) {
			return;
		}
		this.busy.set(true);
		this.error.set(null);
		try {
			await this.coop.joinSpace(this.invite);
			await this.openPlanner();
		} catch (error) {
			console.error(error);
			this.error.set(error instanceof CoopAccessDeniedError
				? error.message
				: 'Could not reach the co-op space. Check your connection and try again.');
		} finally {
			this.busy.set(false);
		}
	}

	/** A join link opened on its own has no version in the address, so it starts from the default one. */
	private async openPlanner(): Promise<void>
	{
		const version = this.versionManager.activeVersion() ?? this.versionManager.defaultPublicVersion(false);
		await this.router.navigate(
			version === null ? ['/'] : ['/', this.versionManager.urlSlug(version), 'planner'],
			{replaceUrl: true},
		);
	}

}
