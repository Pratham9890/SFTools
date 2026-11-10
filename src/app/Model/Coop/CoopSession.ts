import {Injectable, NgZone, OnDestroy, Signal, computed, signal} from '@angular/core';
import {RealtimeChannel, RealtimeClient} from '@supabase/realtime-js';
import {Observable, Subject} from 'rxjs';
import {env} from '@env/env';
import {CoopAccessDeniedError, CoopApi, CoopClaimRecord, CoopCredentials, CoopPlayer, CoopSpaceInfo} from '@src/Model/Coop/CoopApi';
import {NotificationService} from '@src/Model/NotificationService';
import {AppStorage} from '@src/Model/Storage/AppStorage';

const PLAYER_KEY = 'coop.player';
const SPACE_KEY = 'coop.space';

export const COOP_COLORS = ['#f6a623', '#3fa9f5', '#7ed321', '#e2557a', '#9b6cf0', '#2ec4b6', '#f8e71c', '#ff7043'];

/** What the database pushes after each write; see coop_notify(). */
export type CoopChange =
	| {kind: 'plan' | 'folder'; id: string; versionId: string; revision: number | null; by: string | null; deleted: boolean}
	| {kind: 'claim'; planId: string; nodeId: string; playerId: string | null}
	| {kind: 'player'; playerId: string};

export type CoopConnection = 'off' | 'connecting' | 'live' | 'offline';

interface StoredSpace extends CoopCredentials
{
	readonly name: string;
}

@Injectable({providedIn: 'root'})
export class CoopSession implements OnDestroy
{

	private readonly playerSignal = signal<CoopPlayer | null>(null);
	/** This browser's player; null until a name is picked. */
	public readonly player: Signal<CoopPlayer | null> = this.playerSignal.asReadonly();

	private readonly credentialsSignal = signal<StoredSpace | null>(null);
	private readonly spaceSignal = signal<CoopSpaceInfo | null>(null);
	public readonly space: Signal<CoopSpaceInfo | null> = this.spaceSignal.asReadonly();
	public readonly spaceName: Signal<string | null> = computed(() => this.spaceSignal()?.name ?? this.credentialsSignal()?.name ?? null);

	/** In a space: the plan list shows the space's plans, saved for everyone in it. */
	public readonly active: Signal<boolean> = computed(() => this.credentialsSignal() !== null && this.playerSignal() !== null);
	/** Same shape as AuthService, so the synced services can switch on it. */
	public readonly isAuthenticated: Signal<boolean> = this.active;

	private readonly connectionSignal = signal<CoopConnection>('off');
	public readonly connection: Signal<CoopConnection> = this.connectionSignal.asReadonly();

	private readonly onlineSignal = signal<ReadonlySet<string>>(new Set());
	public readonly online: Signal<ReadonlySet<string>> = this.onlineSignal.asReadonly();

	public readonly players: Signal<CoopPlayer[]> = computed(() => this.spaceSignal()?.players ?? []);
	private readonly playerMap: Signal<ReadonlyMap<string, CoopPlayer>> = computed(() => new Map(this.players().map(p => [p.id, p])));

	/** `${planId}:${nodeId}` → player id. */
	private readonly claimsSignal = signal<ReadonlyMap<string, string>>(new Map());
	public readonly claims: Signal<ReadonlyMap<string, string>> = this.claimsSignal.asReadonly();

	private readonly changesSubject = new Subject<CoopChange>();
	public readonly changes: Observable<CoopChange> = this.changesSubject.asObservable();

	/** Fires after the connection comes back: changes made meanwhile were missed. */
	private readonly reconnectedSubject = new Subject<void>();
	public readonly reconnected: Observable<void> = this.reconnectedSubject.asObservable();

	private client: RealtimeClient | null = null;
	private channel: RealtimeChannel | null = null;
	private wasLive = false;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(
		private readonly api: CoopApi,
		private readonly storage: AppStorage,
		private readonly notifications: NotificationService,
		private readonly zone: NgZone,
	)
	{
		this.playerSignal.set(this.read<CoopPlayer>(PLAYER_KEY));
		this.credentialsSignal.set(this.read<StoredSpace>(SPACE_KEY));
		if (this.active()) {
			void this.connect();
		}
	}

	public get configured(): boolean
	{
		return this.api.configured;
	}

	public credentials(): CoopCredentials | null
	{
		const stored = this.credentialsSignal();
		return stored === null ? null : {spaceId: stored.spaceId, token: stored.token};
	}

	public playerById(id: string | null): CoopPlayer | null
	{
		return id === null ? null : this.playerMap().get(id) ?? null;
	}

	public claimHolder(planId: string, nodeId: string): CoopPlayer | null
	{
		const id = this.claimsSignal().get(`${planId}:${nodeId}`);
		return id === undefined ? null : this.playerById(id) ?? {id, name: 'Someone', color: '#888888'};
	}

	/** Players can rename themselves; the new name reaches the space on the next join. */
	public setPlayer(name: string, color: string): CoopPlayer
	{
		const player: CoopPlayer = {id: this.playerSignal()?.id ?? crypto.randomUUID(), name: name.trim(), color};
		this.write(PLAYER_KEY, player);
		this.playerSignal.set(player);
		const credentials = this.credentials();
		if (credentials !== null) {
			void this.api.join(credentials, player).then(info => this.spaceSignal.set(info)).catch(() => undefined);
		}
		return player;
	}

	public async createSpace(name: string): Promise<void>
	{
		const player = this.requirePlayer();
		const created = await this.api.createSpace(name.trim(), player);
		this.enter({spaceId: created.id, token: created.token, name: created.name}, created);
	}

	public async joinSpace(credentials: CoopCredentials): Promise<void>
	{
		const player = this.requirePlayer();
		const info = await this.api.join(credentials, player);
		this.enter({...credentials, name: info.name}, info);
	}

	public async renameSpace(name: string): Promise<void>
	{
		const credentials = this.credentials();
		if (credentials === null) return;
		await this.api.renameSpace(credentials, name.trim());
		this.spaceSignal.update(space => space === null ? null : {...space, name: name.trim()});
		this.write(SPACE_KEY, {...credentials, name: name.trim()});
	}

	/** Only forgets the link on this device; the space and its plans stay for the others. */
	public leave(): void
	{
		this.disconnect();
		this.storage.removeItem(SPACE_KEY);
		this.credentialsSignal.set(null);
		this.spaceSignal.set(null);
		this.claimsSignal.set(new Map());
		this.onlineSignal.set(new Set());
	}

	public inviteLink(): string | null
	{
		const credentials = this.credentials();
		if (credentials === null) return null;
		// The desktop app's own address means nothing to a friend, so it links to the website.
		const base = new URL(document.baseURI);
		const site = base.protocol.startsWith('http') ? `${base.origin}${base.pathname}` : env.coop.siteUrl;
		return `${site.replace(/\/$/, '')}/coop/join#${credentials.spaceId}.${credentials.token}`;
	}

	public static parseInvite(fragment: string | null): CoopCredentials | null
	{
		const match = /^([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec((fragment ?? '').trim());
		return match === null ? null : {spaceId: match[1], token: match[2]};
	}

	public setClaims(claims: CoopClaimRecord[]): void
	{
		this.claimsSignal.set(new Map(claims.map(c => [`${c.planId}:${c.nodeId}`, c.playerId])));
	}

	public async claim(planId: string, nodeId: string): Promise<boolean>
	{
		const credentials = this.credentials();
		const player = this.playerSignal();
		if (credentials === null || player === null) return false;
		const holder = await this.guard(() => this.api.claim(credentials, player.id, planId, nodeId));
		if (holder === undefined) return false;
		this.setClaim(planId, nodeId, holder);
		if (holder !== player.id) {
			this.notifications.show(`${this.playerById(holder)?.name ?? 'Someone'} claimed this first.`, 5_000);
			return false;
		}
		return true;
	}

	public async unclaim(planId: string, nodeId: string): Promise<void>
	{
		const credentials = this.credentials();
		if (credentials === null) return;
		const previous = this.claimsSignal().get(`${planId}:${nodeId}`) ?? null;
		this.setClaim(planId, nodeId, null);
		// The call itself resolves to nothing, so success is marked explicitly: undefined from guard() means it failed.
		const done = await this.guard(async () => {
			await this.api.unclaim(credentials, planId, nodeId);
			return true;
		});
		if (done === undefined && previous !== null) {
			this.setClaim(planId, nodeId, previous);
		}
	}

	/** Split nodes get new ids; their claim follows the first part. */
	public async moveClaims(planId: string, moves: {from: string; to: string | null}[]): Promise<void>
	{
		const credentials = this.credentials();
		const relevant = moves.filter(m => this.claimsSignal().has(`${planId}:${m.from}`));
		if (credentials === null || relevant.length === 0) return;
		relevant.forEach(m => {
			const holder = this.claimsSignal().get(`${planId}:${m.from}`)!;
			this.setClaim(planId, m.from, null);
			if (m.to !== null) this.setClaim(planId, m.to, holder);
		});
		await this.guard(() => this.api.moveClaims(credentials, planId, relevant));
	}

	public ngOnDestroy(): void
	{
		this.disconnect();
	}

	private setClaim(planId: string, nodeId: string, playerId: string | null): void
	{
		this.claimsSignal.update(claims => {
			const next = new Map(claims);
			if (playerId === null) {
				next.delete(`${planId}:${nodeId}`);
			} else {
				next.set(`${planId}:${nodeId}`, playerId);
			}
			return next;
		});
	}

	private enter(stored: StoredSpace, info: CoopSpaceInfo): void
	{
		this.disconnect();
		this.write(SPACE_KEY, stored);
		this.spaceSignal.set(info);
		this.credentialsSignal.set(stored);
		void this.connect(info);
	}

	private async connect(known: CoopSpaceInfo | null = null): Promise<void>
	{
		const credentials = this.credentials();
		const player = this.playerSignal();
		if (credentials === null || player === null || !this.api.configured) return;
		this.connectionSignal.set('connecting');

		let info = known;
		if (info === null) {
			try {
				info = await this.api.join(credentials, player);
				this.spaceSignal.set(info);
			} catch (error) {
				if (error instanceof CoopAccessDeniedError) {
					this.notifications.show('The co-op space link on this device is not valid any more, so you left it.', 10_000);
					this.leave();
					return;
				}
				this.connectionSignal.set('offline');
				this.retryTimer = setTimeout(() => {
					this.retryTimer = null;
					void this.connect();
				}, 10_000);
				return;
			}
		}

		this.zone.runOutsideAngular(() => {
			this.client = new RealtimeClient(`${env.coop.url}/realtime/v1`, {params: {apikey: env.coop.key}});
			const channelKey = info?.channelKey;
			if (channelKey === undefined) {
				return;
			}
			this.openChannel(channelKey, player.id);
		});
	}

	private openChannel(channelKey: string, playerId: string): void
	{
		const channel = this.client!.channel(`coop-${channelKey}`, {config: {broadcast: {self: false}, presence: {key: playerId}}});
		this.channel = channel;

		channel.on('broadcast', {event: 'change'}, message => {
			const change = (message['payload'] ?? message) as CoopChange;
			this.zone.run(() => this.onChange(change));
		});
		channel.on('presence', {event: 'sync'}, () => {
			const ids = new Set(Object.keys(channel.presenceState()));
			this.zone.run(() => this.onlineSignal.set(ids));
		});
		channel.subscribe(status => this.zone.run(() => {
			if (status === 'SUBSCRIBED') {
				void channel.track({at: Date.now()});
				this.connectionSignal.set('live');
				if (this.wasLive) {
					this.reconnectedSubject.next();
					const credentials = this.credentials();
					if (credentials !== null) {
						void this.api.space(credentials).then(info => this.spaceSignal.set(info)).catch(() => undefined);
					}
				}
				this.wasLive = true;
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
				if (this.channel === channel) {
					this.connectionSignal.set('offline');
				}
			}
		}));
	}

	private onChange(change: CoopChange): void
	{
		if (change.kind === 'claim') {
			this.setClaim(change.planId, change.nodeId, change.playerId);
		} else if (change.kind === 'player') {
			const credentials = this.credentials();
			if (credentials !== null && this.playerById(change.playerId) === null) {
				void this.api.space(credentials).then(info => this.spaceSignal.set(info)).catch(() => undefined);
			}
		}
		this.changesSubject.next(change);
	}

	private disconnect(): void
	{
		const client = this.client;
		const channel = this.channel;
		this.channel = null;
		this.client = null;
		this.wasLive = false;
		if (this.retryTimer !== null) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
		this.connectionSignal.set('off');
		if (channel !== null) {
			void channel.unsubscribe();
		}
		client?.disconnect();
	}

	/** Undefined = failed; the user has been told. */
	private async guard<T>(call: () => Promise<T>): Promise<T | undefined>
	{
		try {
			return await call();
		} catch (error) {
			console.error('Co-op request failed:', error);
			this.notifications.show(error instanceof CoopAccessDeniedError
				? error.message
				: 'Could not reach the co-op space. Check your connection and try again.', 6_000);
			return undefined;
		}
	}

	private requirePlayer(): CoopPlayer
	{
		const player = this.playerSignal();
		if (player === null) {
			throw new Error('Pick a player name first.');
		}
		return player;
	}

	private read<T>(key: string): T | null
	{
		const raw = this.storage.getItem(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	}

	private write(key: string, value: unknown): void
	{
		this.storage.setItem(key, JSON.stringify(value));
	}

}
