import {ChangeDetectionStrategy, Component, EventEmitter, Output, Signal, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {PlannerDockService} from '@src/Components/Planner/Dock/PlannerDockService';
import {CoopAccessDeniedError, CoopPlayer} from '@src/Model/Coop/CoopApi';
import {COOP_COLORS, CoopSession} from '@src/Model/Coop/CoopSession';
import {NotificationService} from '@src/Model/NotificationService';

/**
 * What the top bar's co-op indicator opens: start or join a space, and the few things worth doing from the
 * top bar while in one. Everything else (claims, the parts list, renaming) stays in the Co-op panel.
 */
@Component({
	selector: 'planner-coop-box',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './CoopBoxComponent.html',
	imports: [FormsModule],
})
export class CoopBoxComponent
{

	public readonly colors = COOP_COLORS;

	private readonly coop = inject(CoopSession);
	private readonly dock = inject(PlannerDockService);
	private readonly notifications = inject(NotificationService);

	/** Asks the top bar to close its dropdown: a panel, Settings or Leave replaces the box. */
	@Output() public readonly close = new EventEmitter<void>();

	public readonly configured = this.coop.configured;
	public readonly active = this.coop.active;
	public readonly player = this.coop.player;

	public readonly players: Signal<(CoopPlayer & {online: boolean; me: boolean})[]> = computed(() => {
		const online = this.coop.online();
		const me = this.coop.player()?.id ?? null;
		return this.coop.players().map(player => ({...player, online: player.id === me || online.has(player.id), me: player.id === me}));
	});

	public playerName = '';
	public playerColor = COOP_COLORS[0];
	public spaceName = '';
	public inviteText = '';

	public readonly busy = signal(false);
	public readonly error = signal<string | null>(null);

	public constructor()
	{
		const player = this.coop.player();
		if (player !== null) {
			this.playerName = player.name;
			this.playerColor = player.color;
		}
	}

	public title(): string
	{
		const name = this.coop.spaceName();
		return name === null || name.trim() === '' ? 'Co-op' : `Co-op: ${name}`;
	}

	/** Solo needs a name before the space forms: it is what the others see next to what the player claims. */
	public savePlayer(): void
	{
		const name = this.playerName.trim();
		if (name === '') {
			return;
		}
		this.coop.setPlayer(name.slice(0, 40), this.playerColor);
		this.error.set(null);
	}

	public async create(): Promise<void>
	{
		const name = this.spaceName.trim() || `${this.coop.player()?.name ?? 'Our'}'s factory`;
		if (await this.run(() => this.coop.createSpace(name.slice(0, 100)))) {
			this.close.emit();
		}
	}

	public async join(): Promise<void>
	{
		const text = this.inviteText.trim();
		const fragment = text.includes('#') ? text.slice(text.indexOf('#') + 1) : text;
		const credentials = CoopSession.parseInvite(fragment);
		if (credentials === null) {
			this.error.set('That does not look like a co-op invite link.');
			return;
		}
		if (await this.run(() => this.coop.joinSpace(credentials))) {
			this.close.emit();
		}
	}

	public openPanel(id: string): void
	{
		this.dock.open(id);
		this.close.emit();
	}

	public async copyInvite(): Promise<void>
	{
		const link = this.coop.inviteLink();
		if (link === null) {
			return;
		}
		try {
			await navigator.clipboard.writeText(link);
			this.notifications.show('Invite link copied. Anyone with it can open and edit this space.', 5_000);
		} catch {
			window.prompt('Copy the invite link:', link);
		}
	}

	public leave(): void
	{
		this.coop.leave();
		this.close.emit();
	}

	private async run(task: () => Promise<void>): Promise<boolean>
	{
		this.busy.set(true);
		this.error.set(null);
		try {
			await task();
			this.spaceName = '';
			this.inviteText = '';
			return true;
		} catch (error) {
			console.error(error);
			this.error.set(error instanceof CoopAccessDeniedError
				? error.message
				: 'Could not reach the co-op space. Check your connection and try again.');
			return false;
		} finally {
			this.busy.set(false);
		}
	}

}
