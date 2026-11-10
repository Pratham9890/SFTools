import {Injectable} from '@angular/core';
import {env} from '@env/env';

export interface CoopPlayer
{
	readonly id: string;
	readonly name: string;
	readonly color: string;
}

export interface CoopSpaceInfo
{
	readonly id: string;
	readonly name: string;
	readonly channelKey: string;
	readonly players: CoopPlayer[];
}

export interface CoopPlanRecord
{
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly folderId: string | null;
	readonly parentPlanId: string | null;
	readonly data: string;
	readonly revision: number;
	readonly updatedBy: string | null;
}

export interface CoopFolderRecord
{
	readonly id: string;
	readonly name: string;
	readonly parentId: string | null;
	readonly data: string;
	readonly revision: number;
	readonly updatedBy: string | null;
}

export interface CoopClaimRecord
{
	readonly planId: string;
	readonly nodeId: string;
	readonly playerId: string;
}

/** ok = saved at `revision`; otherwise someone saved first (`revision`, `updatedBy`) or deleted it. */
export interface CoopSaveResult
{
	readonly ok: boolean;
	readonly revision?: number;
	readonly updatedBy?: string | null;
	readonly deleted?: boolean;
}

export interface CoopCredentials
{
	readonly spaceId: string;
	readonly token: string;
}

export class CoopAccessDeniedError extends Error
{
	public constructor()
	{
		super('This co-op invite link is not valid any more.');
	}
}

/** Plain fetch on purpose: the app's HTTP interceptors are set up for the upstream API. */
@Injectable({providedIn: 'root'})
export class CoopApi
{

	public readonly configured = !!env.coop?.url && !!env.coop?.key;

	public async createSpace(name: string, player: CoopPlayer): Promise<CoopSpaceInfo & {token: string}>
	{
		return this.rpc('coop_create_space', {p_name: name, p_player: player.id, p_player_name: player.name, p_color: player.color});
	}

	public async join(credentials: CoopCredentials, player: CoopPlayer): Promise<CoopSpaceInfo>
	{
		return this.rpc('coop_join', {...this.auth(credentials), p_player: player.id, p_player_name: player.name, p_color: player.color});
	}

	public async space(credentials: CoopCredentials): Promise<CoopSpaceInfo>
	{
		return this.rpc('coop_space', this.auth(credentials));
	}

	public async renameSpace(credentials: CoopCredentials, name: string): Promise<void>
	{
		await this.rpc('coop_rename_space', {...this.auth(credentials), p_name: name});
	}

	public async load(credentials: CoopCredentials, versionId: string): Promise<{folders: CoopFolderRecord[]; plans: CoopPlanRecord[]; claims: CoopClaimRecord[]}>
	{
		return this.rpc('coop_load', {...this.auth(credentials), p_version: versionId});
	}

	public async get(credentials: CoopCredentials, planIds: string[], folderIds: string[]): Promise<{folders: CoopFolderRecord[]; plans: CoopPlanRecord[]}>
	{
		return this.rpc('coop_get', {...this.auth(credentials), p_plan_ids: planIds, p_folder_ids: folderIds});
	}

	public async savePlan(
		credentials: CoopCredentials, playerId: string, versionId: string, baseRevision: number | null,
		plan: {id: string; name: string; description: string; folderId: string | null; parentPlanId: string | null; data: string},
	): Promise<CoopSaveResult>
	{
		return this.rpc('coop_save_plan', {
			...this.auth(credentials),
			p_player: playerId,
			p_id: plan.id,
			p_version: versionId,
			p_base_revision: baseRevision,
			p_name: plan.name,
			p_description: plan.description,
			p_folder: plan.folderId,
			p_parent: plan.parentPlanId,
			p_data: plan.data,
		});
	}

	public async deletePlan(credentials: CoopCredentials, id: string): Promise<void>
	{
		await this.rpc('coop_delete_plan', {...this.auth(credentials), p_id: id});
	}

	public async saveFolder(
		credentials: CoopCredentials, playerId: string, versionId: string, baseRevision: number | null,
		folder: {id: string; name: string; parentId: string | null; data: string},
	): Promise<CoopSaveResult>
	{
		return this.rpc('coop_save_folder', {
			...this.auth(credentials),
			p_player: playerId,
			p_id: folder.id,
			p_version: versionId,
			p_base_revision: baseRevision,
			p_name: folder.name,
			p_parent: folder.parentId,
			p_data: folder.data,
		});
	}

	public async deleteFolder(credentials: CoopCredentials, id: string): Promise<void>
	{
		await this.rpc('coop_delete_folder', {...this.auth(credentials), p_id: id});
	}

	/** Resolves to whoever holds the claim afterwards. */
	public async claim(credentials: CoopCredentials, playerId: string, planId: string, nodeId: string): Promise<string>
	{
		return this.rpc('coop_claim', {...this.auth(credentials), p_player: playerId, p_plan: planId, p_node: nodeId});
	}

	public async unclaim(credentials: CoopCredentials, planId: string, nodeId: string): Promise<void>
	{
		await this.rpc('coop_unclaim', {...this.auth(credentials), p_plan: planId, p_node: nodeId});
	}

	public async moveClaims(credentials: CoopCredentials, planId: string, moves: {from: string; to: string | null}[]): Promise<void>
	{
		await this.rpc('coop_move_claims', {...this.auth(credentials), p_plan: planId, p_moves: moves});
	}

	private auth(credentials: CoopCredentials): {p_space: string; p_token: string}
	{
		return {p_space: credentials.spaceId, p_token: credentials.token};
	}

	private async rpc<T>(name: string, args: object): Promise<T>
	{
		const response = await fetch(`${env.coop.url}/rest/v1/rpc/${name}`, {
			method: 'POST',
			headers: {
				'apikey': env.coop.key,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(args),
		});
		const text = await response.text();
		if (!response.ok) {
			let message = text;
			try {
				message = (JSON.parse(text) as {message?: string}).message ?? text;
			} catch {
				// not JSON
			}
			if (message.includes('coop: access denied')) {
				throw new CoopAccessDeniedError();
			}
			throw new Error(`Co-op request ${name} failed (${response.status}): ${message}`);
		}
		return (text === '' ? undefined : JSON.parse(text)) as T;
	}

}
