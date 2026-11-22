import {computed, Signal, signal} from '@angular/core';
import {FolderRecalculationProgress} from '@src/Components/Planner/FolderRecalculationProgress';
import {FolderRecalculationService} from '@src/Components/Planner/FolderRecalculationService';
import {NotificationService} from '@src/Model/NotificationService';
import {Folder} from '@src/Model/Planner/Folder';
import {FolderGroupMode} from '@src/Model/Planner/FolderGroupMode';
import {Plan} from '@src/Model/Planner/Plan';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlanNameResolver} from '@src/Model/Planner/PlanNameResolver';
import {PlanSettings} from '@src/Model/Planner/PlanSettings';
import {SettingsGroup} from '@src/Model/Planner/SettingsGroup';
import {SettingsGroups} from '@src/Model/Planner/SettingsGroups';

/**
 * The plan- and folder-level settings actions, shared by the plan panel and the old full calculator, so the
 * confirmations, the parent label and the load-from-save dialog cannot drift apart between the two.
 */
export class PlanSettingsActions
{

	public readonly fixedFolder: Signal<Folder | null>;

	public readonly fixedGroups: Signal<readonly SettingsGroup[]>;

	public readonly allGroupsFixed: Signal<boolean>;

	public readonly customSettingsBlocker: Signal<string | null>;

	public readonly fixGroupsBlocker: Signal<string | null>;

	public readonly innerPlans: Signal<Plan[]>;

	public readonly outdatedPlans: Signal<Plan[]>;

	public readonly skippedOutdatedPlans: Signal<Plan[]>;

	public readonly recalculationProgress: Signal<FolderRecalculationProgress | null>;

	public readonly folderHasCustomSettings: Signal<boolean>;

	public readonly parentLabel: Signal<string>;

	private readonly loadFromSaveSignal = signal<{name: string} | null>(null);
	public readonly loadFromSave: Signal<{name: string} | null> = this.loadFromSaveSignal.asReadonly();

	public constructor(
		private readonly planManager: PlanManager,
		private readonly planNames: PlanNameResolver,
		private readonly notifications: NotificationService,
		private readonly folderRecalculation: FolderRecalculationService,
	)
	{
		this.fixedFolder = computed(() => {
			const plan = this.planManager.activePlan();
			return plan && !this.planManager.activePlanReadOnly() ? this.planManager.fixedFolderOf(plan) : null;
		});
		this.fixedGroups = computed(() => this.fixedFolder()?.fixedGroups ?? []);
		this.allGroupsFixed = computed(() => SettingsGroups.all.every(group => this.fixedGroups().includes(group)));
		this.customSettingsBlocker = computed(() => {
			const folder = this.planManager.activeFolder();
			return folder ? this.planManager.customSettingsBlocker(folder.id) : null;
		});
		this.fixGroupsBlocker = computed(() => {
			const folder = this.planManager.activeFolder();
			return folder ? this.planManager.fixGroupsBlocker(folder.id) : null;
		});
		this.innerPlans = computed(() => {
			const folder = this.planManager.activeFolder();
			return folder ? this.planManager.innerPlans(folder.id) : [];
		});
		this.outdatedPlans = computed(() => {
			const folder = this.planManager.activeFolder();
			return folder ? this.folderRecalculation.outdatedPlans(folder.id) : [];
		});
		this.skippedOutdatedPlans = computed(() => {
			const folder = this.planManager.activeFolder();
			return folder ? this.folderRecalculation.skippedOutdatedPlans(folder.id) : [];
		});
		this.recalculationProgress = this.folderRecalculation.progress;
		this.folderHasCustomSettings = computed(() => (this.planManager.activeFolder()?.settings ?? null) !== null);
		this.parentLabel = computed(() => {
			const plan = this.planManager.activePlan();
			if (plan?.parentPlanId) {
				const parent = this.planManager.plans().find(candidate => candidate.id === plan.parentPlanId);
				if (parent) {
					return `"${parent.name}"`;
				}
			}
			const folderId = plan ? plan.folderId : this.planManager.activeFolder()?.parentId ?? null;
			const folder = this.planManager.folders().find(candidate => candidate.id === folderId);
			return folder ? `"${folder.name}"` : 'the defaults';
		});
	}

	public resetSettings(): void
	{
		if (!confirm('Set all settings back to the defaults?')) {
			return;
		}
		this.planManager.updateActiveSettings(this.planManager.defaultSettings());
	}

	public inheritSettings(): void
	{
		if (!confirm(`Replace all settings with those of ${this.parentLabel()}?`)) {
			return;
		}
		this.planManager.updateActiveSettings(this.parentSettings());
	}

	public enableFolderSettings(): void
	{
		const folder = this.planManager.activeFolder();
		if (folder) {
			this.planManager.enableFolderSettings(folder.id);
		}
	}

	public disableFolderSettings(): void
	{
		const folder = this.planManager.activeFolder();
		if (!folder || !confirm('Remove this folder\'s own settings? It will use its parent\'s settings again.')) {
			return;
		}
		this.planManager.setFolderSettings(folder.id, null);
	}

	public openLoadFromSave(): void
	{
		const plan = this.planManager.activePlan();
		const folder = this.planManager.activeFolder();
		if (plan) {
			this.loadFromSaveSignal.set({name: this.planNames.displayName(plan)});
		} else if (folder) {
			this.loadFromSaveSignal.set({name: folder.name});
		}
	}

	/** Applied to the settings as they are now: loading the map's part may have just counted a resource area again. */
	public onLoadFromSaveApply(patch: Partial<PlanSettings> | null): void
	{
		const target = this.loadFromSaveSignal();
		const plan = this.planManager.activePlan();
		const folder = this.planManager.activeFolder();
		if (target) {
			if (patch === null) {
				this.notifications.showSuccess('Loaded your game from the save file.');
			} else if (plan) {
				this.planManager.updateActiveSettings({...plan.settings, ...patch});
				this.notifications.showSuccess(`Loaded settings from the save file into "${target.name}".`);
			} else if (folder) {
				// effectiveFolderSettings covers a folder still inheriting; applying the save then gives it custom settings.
				this.planManager.setFolderSettings(folder.id, {...this.planManager.effectiveFolderSettings(folder.id), ...patch});
				this.notifications.showSuccess(`Loaded settings from the save file into "${target.name}".`);
			}
		}
		this.loadFromSaveSignal.set(null);
	}

	public closeLoadFromSave(): void
	{
		this.loadFromSaveSignal.set(null);
	}

	public groupLabel(group: SettingsGroup): string
	{
		return SettingsGroups.labelOf(group);
	}

	public groupMode(group: SettingsGroup): FolderGroupMode
	{
		const folder = this.planManager.activeFolder();
		return folder ? this.planManager.folderGroupMode(folder, group) : 'default';
	}

	public setGroupMode(group: SettingsGroup, mode: FolderGroupMode): void
	{
		const folder = this.planManager.activeFolder();
		if (!folder || this.groupMode(group) === mode) {
			return;
		}
		if (mode !== 'default' && this.fixGroupsBlocker() !== null) {
			return;
		}
		if (this.groupMode(group) === 'default') {
			const count = this.innerPlans().length;
			if (count > 0 && !confirm(`Apply the folder's ${this.groupLabel(group)} settings to the ${count} plan${count === 1 ? '' : 's'} inside "${folder.name}"? `
				+ `Their own ${this.groupLabel(group)} settings are replaced.`)) {
				return;
			}
		}
		this.planManager.setFolderGroupMode(folder.id, group, mode);
	}

	public fixedGroupsSummary(): string
	{
		const folder = this.planManager.activeFolder();
		if (!folder) {
			return '';
		}
		return folder.fixedGroups
			.map(group => group === 'resources' && folder.resourcePool ? 'Resources (shared pool)' : this.groupLabel(group))
			.join(', ');
	}

	public openFixedFolder(): void
	{
		const folder = this.fixedFolder();
		if (folder) {
			this.planManager.setActiveFolder(folder.id);
		}
	}

	public recalculateFolder(): void
	{
		const folder = this.planManager.activeFolder();
		if (folder) {
			void this.folderRecalculation.run(folder.id);
		}
	}

	public cancelFolderRecalculation(): void
	{
		this.folderRecalculation.cancel();
	}

	private parentSettings(): PlanSettings
	{
		const plan = this.planManager.activePlan();
		if (plan?.parentPlanId) {
			const parent = this.planManager.plans().find(candidate => candidate.id === plan.parentPlanId);
			if (parent) {
				return this.planManager.cloneSettings(parent.settings);
			}
		}
		const folderId = plan ? plan.folderId : this.planManager.activeFolder()?.parentId ?? null;
		return this.planManager.effectiveFolderSettings(folderId);
	}

}
