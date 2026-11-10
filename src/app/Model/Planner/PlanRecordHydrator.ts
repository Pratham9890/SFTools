import {Folder} from '@src/Model/Planner/Folder';
import {Plan} from '@src/Model/Planner/Plan';
import {PlanSettingsNormalizer} from '@src/Model/Planner/PlanSettingsNormalizer';

/** The columns a stored plan keeps outside its data JSON (see PlanDataSerializer). */
export interface PlanRecordFields
{
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly folderId: string | null;
	readonly parentPlanId: string | null;
	readonly revision: number;
	readonly linkAccess?: boolean;
}

export interface FolderRecordFields
{
	readonly id: string;
	readonly name: string;
	readonly parentId: string | null;
	readonly revision: number;
}

/** Turns a stored record back into a plan or folder; shared by the account and co-op backends. */
export class PlanRecordHydrator
{

	public static folder(fields: FolderRecordFields, rawData: string): Folder
	{
		let data: {settings?: Folder['settings']; fixedGroups?: Folder['fixedGroups']; resourcePool?: boolean; order?: number} = {};
		try {
			data = JSON.parse(rawData) as typeof data;
		} catch {
			// malformed data - treat as inheriting
		}
		return {
			id: fields.id,
			name: fields.name,
			parentId: fields.parentId,
			settings: data.settings ? PlanSettingsNormalizer.normalize(data.settings) : null,
			fixedGroups: data.settings ? data.fixedGroups ?? [] : [],
			resourcePool: data.resourcePool ?? false,
			order: data.order,
			revision: fields.revision,
		};
	}

	public static plan(fields: PlanRecordFields, rawData: string): Plan
	{
		let data: {settings?: Plan['settings']; requests?: Plan['requests']; inputs?: Plan['inputs']; graph?: Plan['graph']; metadata?: Plan['metadata']; iconClassName?: Plan['iconClassName']; autoName?: boolean; autoIcon?: boolean; order?: number} = {};
		try {
			data = JSON.parse(rawData) as typeof data;
		} catch {
			// malformed data - use defaults
		}

		return {
			id: fields.id,
			name: fields.name,
			description: fields.description ?? '',
			folderId: fields.folderId,
			parentPlanId: fields.parentPlanId,
			settings: PlanSettingsNormalizer.normalize({
				...data.settings,
				calculationMode: data.settings?.calculationMode ?? 'automatic',
			}),
			requests: data.requests ?? [],
			inputs: data.inputs ?? [],
			graph: data.graph ?? null,
			metadata: {
				graphDirty: data.metadata?.graphDirty ?? false,
				achievedMaximums: data.metadata?.achievedMaximums,
				recalculationNeeded: data.metadata?.recalculationNeeded,
			},
			iconClassName: data.iconClassName,
			autoName: data.autoName,
			autoIcon: data.autoIcon,
			order: data.order,
			// Plans stored before the column existed come back without it - those are open.
			linkAccess: fields.linkAccess ?? true,
			revision: fields.revision,
		};
	}

}
