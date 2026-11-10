import {Observable, Subject, Subscription, from, of} from 'rxjs';
import {CoopApi, CoopCredentials, CoopFolderRecord, CoopPlanRecord, CoopSaveResult} from '@src/Model/Coop/CoopApi';
import {CoopChange, CoopSession} from '@src/Model/Coop/CoopSession';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {NotificationService} from '@src/Model/NotificationService';
import {Folder} from '@src/Model/Planner/Folder';
import {Plan} from '@src/Model/Planner/Plan';
import {PlanDataSerializer} from '@src/Model/Planner/PlanDataSerializer';
import {PlanRecordHydrator} from '@src/Model/Planner/PlanRecordHydrator';
import {PlanStore} from '@src/Model/Planner/PlanStore';
import {DataBackend} from '@src/Model/Sync/DataBackend';

/** What changed in the space from elsewhere; the plan manager writes it into its store without saving it back. */
export interface CoopRemoteUpdate
{
	readonly plans: Plan[];
	readonly folders: Folder[];
	readonly removedPlanIds: string[];
	readonly removedFolderIds: string[];
}

interface SyncedPlan
{
	readonly name: string;
	readonly description: string;
	readonly folderId: string | null;
	readonly parentPlanId: string | null;
	readonly data: string;
	readonly revision: number;
}

interface SyncedFolder
{
	readonly name: string;
	readonly parentId: string | null;
	readonly data: string;
	readonly revision: number;
}

const SAVE_DELAY = 800;
const FETCH_DELAY = 150;

/**
 * Saves only what changed since the last sync, one record at a time with the revision it was based on.
 * A save based on an old revision is refused by the database: the first save wins, and this side takes the saved copy.
 */
export class CoopPlanBackend implements DataBackend<PlanStore>
{

	private readonly syncedPlans = new Map<string, SyncedPlan>();
	private readonly syncedFolders = new Map<string, SyncedFolder>();
	private loadedVersionId: string | null = null;

	/** Saves and remote fetches run one after another, so neither reads the other's half-done bookkeeping. */
	private queue: Promise<void> = Promise.resolve();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private fetchTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly pendingPlanIds = new Set<string>();
	private readonly pendingFolderIds = new Set<string>();

	private readonly updatesSubject = new Subject<CoopRemoteUpdate>();
	public readonly updates: Observable<CoopRemoteUpdate> = this.updatesSubject.asObservable();

	private readonly subscription = new Subscription();

	public constructor(
		private readonly api: CoopApi,
		private readonly session: CoopSession,
		private readonly versionManager: VersionManager,
		private readonly notifications: NotificationService,
		/** The plan manager's store right now: a save scheduled earlier must not resend what a remote update replaced since. */
		private readonly currentStore: () => PlanStore,
	)
	{
		this.subscription.add(session.changes.subscribe(change => this.onChange(change)));
		// Changes made while the connection was down were never pushed.
		this.subscription.add(session.reconnected.subscribe(() => this.enqueue(() => this.refreshAll())));
	}

	public load(): Observable<PlanStore | null>
	{
		const credentials = this.session.credentials();
		const versionId = this.versionManager.activeVersion()?.id ?? null;
		if (credentials === null || versionId === null) {
			return of(null);
		}
		return from(this.enqueue(async () => {
			const result = await this.api.load(credentials, versionId);
			this.syncedPlans.clear();
			this.syncedFolders.clear();
			this.loadedVersionId = versionId;
			result.folders.forEach(record => this.rememberFolder(record));
			result.plans.forEach(record => this.rememberPlan(record));
			this.session.setClaims(result.claims);
			return this.normalize({
				folders: result.folders.map(record => this.hydrateFolder(record)),
				plans: result.plans.map(record => this.hydratePlan(record)),
			});
		}));
	}

	public save(_data: PlanStore): Observable<void>
	{
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.enqueue(() => this.sync());
		}, SAVE_DELAY);
		return of(void 0);
	}

	/** Leaving a space must not delete anything in it. */
	public clear(): Observable<void>
	{
		return of(void 0);
	}

	public dispose(): void
	{
		this.subscription.unsubscribe();
		if (this.saveTimer !== null) clearTimeout(this.saveTimer);
		if (this.fetchTimer !== null) clearTimeout(this.fetchTimer);
	}

	/** Sends what is still waiting, e.g. before the page closes. */
	public flush(): void
	{
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.enqueue(() => this.sync());
		}
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T>
	{
		const run = this.queue.then(task);
		this.queue = run.then(() => undefined, () => undefined);
		return run;
	}

	private async sync(): Promise<void>
	{
		const credentials = this.session.credentials();
		const player = this.session.player();
		const versionId = this.loadedVersionId;
		if (credentials === null || player === null || versionId === null || versionId !== this.versionManager.activeVersion()?.id) {
			return;
		}
		const store = this.currentStore();
		const conflictedPlans: string[] = [];
		const conflictedFolders: string[] = [];
		let failed = false;

		const attempt = async (call: () => Promise<void>): Promise<void> => {
			try {
				await call();
			} catch (error) {
				console.error('Co-op save failed:', error);
				failed = true;
			}
		};

		const folderIds = new Set(store.folders.map(f => f.id));
		const foldersByDepth = [...store.folders].sort((a, b) => this.folderDepth(a.id, store.folders) - this.folderDepth(b.id, store.folders));
		for (const folder of foldersByDepth) {
			const data = PlanDataSerializer.folder(folder);
			const synced = this.syncedFolders.get(folder.id);
			if (synced !== undefined && synced.name === folder.name && synced.parentId === folder.parentId && synced.data === data) {
				continue;
			}
			await attempt(async () => {
				const result = await this.api.saveFolder(credentials, player.id, versionId, synced?.revision ?? null,
					{id: folder.id, name: folder.name, parentId: folder.parentId, data});
				if (this.accepted(result)) {
					this.syncedFolders.set(folder.id, {name: folder.name, parentId: folder.parentId, data, revision: result.revision!});
				} else {
					conflictedFolders.push(folder.id);
				}
			});
		}

		const planIds = new Set(store.plans.map(p => p.id));
		const plansByDepth = [...store.plans].sort((a, b) => this.planDepth(a.id, store.plans) - this.planDepth(b.id, store.plans));
		for (const plan of plansByDepth) {
			const data = PlanDataSerializer.plan(plan);
			const synced = this.syncedPlans.get(plan.id);
			const description = plan.description ?? '';
			if (synced !== undefined && synced.name === plan.name && synced.description === description
				&& synced.folderId === plan.folderId && synced.parentPlanId === plan.parentPlanId && synced.data === data) {
				continue;
			}
			await attempt(async () => {
				const result = await this.api.savePlan(credentials, player.id, versionId, synced?.revision ?? null,
					{id: plan.id, name: plan.name, description, folderId: plan.folderId, parentPlanId: plan.parentPlanId, data});
				if (this.accepted(result)) {
					this.syncedPlans.set(plan.id, {name: plan.name, description, folderId: plan.folderId, parentPlanId: plan.parentPlanId, data, revision: result.revision!});
				} else {
					conflictedPlans.push(plan.id);
				}
			});
		}

		for (const id of [...this.syncedPlans.keys()].filter(id => !planIds.has(id))) {
			await attempt(async () => {
				await this.api.deletePlan(credentials, id);
				this.syncedPlans.delete(id);
			});
		}
		// Children first, so a folder never outlives the check that it is empty.
		const removedFolders = [...this.syncedFolders.keys()].filter(id => !folderIds.has(id)).reverse();
		for (const id of removedFolders) {
			await attempt(async () => {
				await this.api.deleteFolder(credentials, id);
				this.syncedFolders.delete(id);
			});
		}

		if (conflictedPlans.length > 0 || conflictedFolders.length > 0) {
			const names = conflictedPlans.map(id => store.plans.find(p => p.id === id)?.name || 'a plan');
			this.notifications.show(
				conflictedPlans.length > 0
					? `Someone else saved ${names.join(', ')} first, so your last change to it was replaced with their version.`
					: 'Someone else changed a folder first, so your last change to it was replaced with their version.',
				8_000,
			);
			await this.fetch(credentials, conflictedPlans, conflictedFolders, true);
		}
		if (failed) {
			this.notifications.show('Could not save to the co-op space. Your changes are kept here and are sent again with your next change.', 8_000);
		}
	}

	private accepted(result: CoopSaveResult): boolean
	{
		return result.ok && result.revision !== undefined;
	}

	private onChange(change: CoopChange): void
	{
		if (change.kind !== 'plan' && change.kind !== 'folder') {
			return;
		}
		if (this.loadedVersionId === null || change.versionId !== this.loadedVersionId) {
			return;
		}
		const known = change.kind === 'plan' ? this.syncedPlans.get(change.id) : this.syncedFolders.get(change.id);
		// Our own saves come back as an echo: the revision is already ours.
		if (!change.deleted && known !== undefined && change.revision !== null && known.revision >= change.revision) {
			return;
		}
		if (change.deleted && known === undefined) {
			return;
		}
		(change.kind === 'plan' ? this.pendingPlanIds : this.pendingFolderIds).add(change.id);
		if (this.fetchTimer === null) {
			this.fetchTimer = setTimeout(() => {
				this.fetchTimer = null;
				const credentials = this.session.credentials();
				const planIds = [...this.pendingPlanIds];
				const folderIds = [...this.pendingFolderIds];
				this.pendingPlanIds.clear();
				this.pendingFolderIds.clear();
				if (credentials !== null) {
					void this.enqueue(() => this.fetch(credentials, planIds, folderIds, false));
				}
			}, FETCH_DELAY);
		}
	}

	private async refreshAll(): Promise<void>
	{
		const credentials = this.session.credentials();
		const versionId = this.loadedVersionId;
		if (credentials === null || versionId === null) return;
		try {
			const result = await this.api.load(credentials, versionId);
			this.session.setClaims(result.claims);
			const planIds = new Set(result.plans.map(p => p.id));
			const folderIds = new Set(result.folders.map(f => f.id));
			const changedPlans = result.plans.filter(p => (this.syncedPlans.get(p.id)?.revision ?? 0) < p.revision);
			const changedFolders = result.folders.filter(f => (this.syncedFolders.get(f.id)?.revision ?? 0) < f.revision);
			this.apply(
				changedPlans, changedFolders,
				[...this.syncedPlans.keys()].filter(id => !planIds.has(id)),
				[...this.syncedFolders.keys()].filter(id => !folderIds.has(id)),
				false,
			);
		} catch (error) {
			console.error('Co-op refresh failed:', error);
		}
	}

	/** `afterConflict`: this side already said what happened. */
	private async fetch(credentials: CoopCredentials, planIds: string[], folderIds: string[], afterConflict: boolean): Promise<void>
	{
		if (planIds.length === 0 && folderIds.length === 0) return;
		try {
			const result = await this.api.get(credentials, planIds, folderIds);
			const foundPlans = new Set(result.plans.map(p => p.id));
			const foundFolders = new Set(result.folders.map(f => f.id));
			this.apply(
				result.plans, result.folders,
				planIds.filter(id => !foundPlans.has(id)),
				folderIds.filter(id => !foundFolders.has(id)),
				!afterConflict,
			);
		} catch (error) {
			console.error('Co-op fetch failed:', error);
		}
	}

	private apply(plans: CoopPlanRecord[], folders: CoopFolderRecord[], removedPlanIds: string[], removedFolderIds: string[], warnUnsaved: boolean): void
	{
		const freshPlans = plans.filter(record => !this.syncedPlans.has(record.id) || this.syncedPlans.get(record.id)!.revision < record.revision);
		const freshFolders = folders.filter(record => !this.syncedFolders.has(record.id) || this.syncedFolders.get(record.id)!.revision < record.revision);

		if (warnUnsaved) {
			// A local edit not yet sent to a plan that just changed elsewhere: theirs was saved first, so it wins.
			const current = this.currentStore();
			const me = this.session.player()?.id ?? null;
			const theirs = freshPlans.filter(record => record.updatedBy !== me);
			const overwritten = theirs
				.map(record => current.plans.find(p => p.id === record.id))
				.filter((plan): plan is Plan => plan !== undefined && this.isDirty(plan));
			if (overwritten.length > 0) {
				const who = this.session.playerById(theirs[0].updatedBy)?.name ?? 'Someone';
				this.notifications.show(`${who} saved ${overwritten.map(p => p.name || 'a plan').join(', ')} at the same time, so your last change to it was replaced.`, 8_000);
			}
		}

		freshPlans.forEach(record => this.rememberPlan(record));
		freshFolders.forEach(record => this.rememberFolder(record));
		removedPlanIds.forEach(id => this.syncedPlans.delete(id));
		removedFolderIds.forEach(id => this.syncedFolders.delete(id));

		if (freshPlans.length === 0 && freshFolders.length === 0 && removedPlanIds.length === 0 && removedFolderIds.length === 0) {
			return;
		}
		this.updatesSubject.next({
			plans: freshPlans.map(record => this.hydratePlan(record)),
			folders: freshFolders.map(record => this.hydrateFolder(record)),
			removedPlanIds,
			removedFolderIds,
		});
	}

	private isDirty(plan: Plan): boolean
	{
		const synced = this.syncedPlans.get(plan.id);
		return synced === undefined || synced.data !== PlanDataSerializer.plan(plan) || synced.name !== plan.name;
	}

	private rememberPlan(record: CoopPlanRecord): void
	{
		// Stored the way this side would serialize it, so an untouched plan never looks changed.
		const plan = this.hydratePlan(record);
		this.syncedPlans.set(record.id, {
			name: plan.name,
			description: plan.description ?? '',
			folderId: plan.folderId,
			parentPlanId: plan.parentPlanId,
			data: PlanDataSerializer.plan(plan),
			revision: record.revision,
		});
	}

	private rememberFolder(record: CoopFolderRecord): void
	{
		const folder = this.hydrateFolder(record);
		this.syncedFolders.set(record.id, {name: folder.name, parentId: folder.parentId, data: PlanDataSerializer.folder(folder), revision: record.revision});
	}

	private hydratePlan(record: CoopPlanRecord): Plan
	{
		return PlanRecordHydrator.plan({
			id: record.id,
			name: record.name,
			description: record.description,
			folderId: record.folderId,
			parentPlanId: record.parentPlanId,
			revision: record.revision,
		}, record.data);
	}

	private hydrateFolder(record: CoopFolderRecord): Folder
	{
		return PlanRecordHydrator.folder({id: record.id, name: record.name, parentId: record.parentId, revision: record.revision}, record.data);
	}

	/** A folder or parent removed by the other player leaves its children at the top instead of hidden. */
	private normalize(store: PlanStore): PlanStore
	{
		const folderIds = new Set(store.folders.map(f => f.id));
		const planIds = new Set(store.plans.map(p => p.id));
		return {
			folders: store.folders.map(f => f.parentId !== null && !folderIds.has(f.parentId) ? {...f, parentId: null} : f),
			plans: store.plans.map(p => {
				const folderGone = p.folderId !== null && !folderIds.has(p.folderId);
				const parentGone = p.parentPlanId !== null && !planIds.has(p.parentPlanId);
				return folderGone || parentGone
					? {...p, folderId: folderGone ? null : p.folderId, parentPlanId: parentGone ? null : p.parentPlanId}
					: p;
			}),
		};
	}

	private folderDepth(id: string, folders: Folder[]): number
	{
		const folder = folders.find(f => f.id === id);
		if (!folder || folder.parentId === null) return 0;
		return 1 + this.folderDepth(folder.parentId, folders);
	}

	private planDepth(id: string, plans: Plan[]): number
	{
		const plan = plans.find(p => p.id === id);
		if (!plan || plan.parentPlanId === null) return 0;
		return 1 + this.planDepth(plan.parentPlanId, plans);
	}

}
