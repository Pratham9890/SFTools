-- Co-op spaces: plans shared live between players, with no accounts.
-- Access is a secret token from the invite link. The tables are closed to the API;
-- every read and write goes through the SECURITY DEFINER functions below, which check the token.

create extension if not exists pgcrypto with schema extensions;

create table public.coop_spaces (
	id uuid primary key default gen_random_uuid(),
	name text not null check (char_length(name) between 1 and 100),
	token_hash text not null,
	-- Names the public realtime topic; only members learn it.
	channel_key text not null,
	created_at timestamptz not null default now()
);

create table public.coop_players (
	space_id uuid not null references public.coop_spaces (id) on delete cascade,
	player_id uuid not null,
	name text not null check (char_length(name) between 1 and 40),
	color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
	joined_at timestamptz not null default now(),
	primary key (space_id, player_id)
);

create table public.coop_folders (
	space_id uuid not null references public.coop_spaces (id) on delete cascade,
	id uuid not null,
	version_id text not null,
	name text not null,
	parent_id uuid,
	data text not null,
	revision integer not null default 1,
	updated_by uuid,
	updated_at timestamptz not null default now(),
	primary key (space_id, id)
);
create index coop_folders_version on public.coop_folders (space_id, version_id);

create table public.coop_plans (
	space_id uuid not null references public.coop_spaces (id) on delete cascade,
	id uuid not null,
	version_id text not null,
	name text not null,
	description text not null default '',
	folder_id uuid,
	parent_plan_id uuid,
	data text not null,
	revision integer not null default 1,
	updated_by uuid,
	updated_at timestamptz not null default now(),
	primary key (space_id, id)
);
create index coop_plans_version on public.coop_plans (space_id, version_id);

create table public.coop_claims (
	space_id uuid not null references public.coop_spaces (id) on delete cascade,
	plan_id uuid not null,
	node_id text not null,
	player_id uuid not null,
	claimed_at timestamptz not null default now(),
	primary key (space_id, plan_id, node_id)
);

alter table public.coop_spaces enable row level security;
alter table public.coop_players enable row level security;
alter table public.coop_folders enable row level security;
alter table public.coop_plans enable row level security;
alter table public.coop_claims enable row level security;
revoke all on public.coop_spaces, public.coop_players, public.coop_folders, public.coop_plans, public.coop_claims from anon, authenticated;

-- Access check ---------------------------------------------------------------

create function public.coop_check(p_space uuid, p_token text) returns public.coop_spaces
language plpgsql stable security definer set search_path = '' as $$
declare
	v_space public.coop_spaces;
begin
	select * into v_space from public.coop_spaces
	where id = p_space and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
	if not found then
		raise exception 'coop: access denied' using errcode = '28000';
	end if;
	return v_space;
end;
$$;

-- Live updates ---------------------------------------------------------------

create function public.coop_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
	v_row record;
	v_kind text := tg_argv[0];
	v_key text;
	v_payload jsonb;
begin
	if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
	select channel_key into v_key from public.coop_spaces where id = v_row.space_id;
	if v_key is null then
		return null;
	end if;
	if v_kind = 'claim' then
		v_payload := jsonb_build_object('kind', 'claim', 'planId', v_row.plan_id, 'nodeId', v_row.node_id,
			'playerId', case when tg_op = 'DELETE' then null else v_row.player_id end);
	elsif v_kind = 'player' then
		v_payload := jsonb_build_object('kind', 'player', 'playerId', v_row.player_id);
	else
		v_payload := jsonb_build_object('kind', v_kind, 'id', v_row.id, 'versionId', v_row.version_id,
			'revision', case when tg_op = 'DELETE' then null else v_row.revision end,
			'by', case when tg_op = 'DELETE' then null else v_row.updated_by end,
			'deleted', tg_op = 'DELETE');
	end if;
	perform realtime.send(v_payload, 'change', 'coop-' || v_key, false);
	return null;
end;
$$;

create trigger coop_plans_notify after insert or update or delete on public.coop_plans
	for each row execute function public.coop_notify('plan');
create trigger coop_folders_notify after insert or update or delete on public.coop_folders
	for each row execute function public.coop_notify('folder');
create trigger coop_claims_notify after insert or update or delete on public.coop_claims
	for each row execute function public.coop_notify('claim');
create trigger coop_players_notify after insert or update on public.coop_players
	for each row execute function public.coop_notify('player');

-- Spaces and players -----------------------------------------------------------

create function public.coop_space_json(p_space public.coop_spaces) returns jsonb
language sql stable security definer set search_path = '' as $$
	select jsonb_build_object(
		'id', p_space.id,
		'name', p_space.name,
		'channelKey', p_space.channel_key,
		'players', coalesce((
			select jsonb_agg(jsonb_build_object('id', p.player_id, 'name', p.name, 'color', p.color) order by p.joined_at)
			from public.coop_players p where p.space_id = p_space.id
		), '[]'::jsonb)
	);
$$;

create function public.coop_create_space(p_name text, p_player uuid, p_player_name text, p_color text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	v_token text := encode(extensions.gen_random_bytes(32), 'hex');
	v_space public.coop_spaces;
begin
	insert into public.coop_spaces (name, token_hash, channel_key)
	values (trim(p_name), encode(extensions.digest(v_token, 'sha256'), 'hex'), encode(extensions.gen_random_bytes(24), 'hex'))
	returning * into v_space;
	insert into public.coop_players (space_id, player_id, name, color) values (v_space.id, p_player, trim(p_player_name), p_color);
	return public.coop_space_json(v_space) || jsonb_build_object('token', v_token);
end;
$$;

create function public.coop_join(p_space uuid, p_token text, p_player uuid, p_player_name text, p_color text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	v_space public.coop_spaces := public.coop_check(p_space, p_token);
begin
	insert into public.coop_players (space_id, player_id, name, color) values (p_space, p_player, trim(p_player_name), p_color)
	on conflict (space_id, player_id) do update set name = excluded.name, color = excluded.color;
	return public.coop_space_json(v_space);
end;
$$;

create function public.coop_space(p_space uuid, p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
	return public.coop_space_json(public.coop_check(p_space, p_token));
end;
$$;

create function public.coop_rename_space(p_space uuid, p_token text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
	perform public.coop_check(p_space, p_token);
	update public.coop_spaces set name = trim(p_name) where id = p_space;
end;
$$;

-- Plans and folders ------------------------------------------------------------

create function public.coop_plan_json(p public.coop_plans) returns jsonb
language sql immutable set search_path = '' as $$
	select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'folderId', p.folder_id,
		'parentPlanId', p.parent_plan_id, 'data', p.data, 'revision', p.revision, 'updatedBy', p.updated_by);
$$;

create function public.coop_folder_json(f public.coop_folders) returns jsonb
language sql immutable set search_path = '' as $$
	select jsonb_build_object('id', f.id, 'name', f.name, 'parentId', f.parent_id, 'data', f.data,
		'revision', f.revision, 'updatedBy', f.updated_by);
$$;

create function public.coop_load(p_space uuid, p_token text, p_version text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
	perform public.coop_check(p_space, p_token);
	return jsonb_build_object(
		'folders', coalesce((select jsonb_agg(public.coop_folder_json(f)) from public.coop_folders f
			where f.space_id = p_space and f.version_id = p_version), '[]'::jsonb),
		'plans', coalesce((select jsonb_agg(public.coop_plan_json(p)) from public.coop_plans p
			where p.space_id = p_space and p.version_id = p_version), '[]'::jsonb),
		'claims', coalesce((select jsonb_agg(jsonb_build_object('planId', c.plan_id, 'nodeId', c.node_id, 'playerId', c.player_id))
			from public.coop_claims c join public.coop_plans p on p.space_id = c.space_id and p.id = c.plan_id
			where c.space_id = p_space and p.version_id = p_version), '[]'::jsonb)
	);
end;
$$;

create function public.coop_get(p_space uuid, p_token text, p_plan_ids uuid[], p_folder_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
	perform public.coop_check(p_space, p_token);
	return jsonb_build_object(
		'folders', coalesce((select jsonb_agg(public.coop_folder_json(f)) from public.coop_folders f
			where f.space_id = p_space and f.id = any(coalesce(p_folder_ids, '{}'))), '[]'::jsonb),
		'plans', coalesce((select jsonb_agg(public.coop_plan_json(p)) from public.coop_plans p
			where p.space_id = p_space and p.id = any(coalesce(p_plan_ids, '{}'))), '[]'::jsonb)
	);
end;
$$;

-- p_base_revision null = a new plan. A stale base revision is refused, so the first save wins.
create function public.coop_save_plan(
	p_space uuid, p_token text, p_player uuid, p_id uuid, p_version text, p_base_revision integer,
	p_name text, p_description text, p_folder uuid, p_parent uuid, p_data text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	v_current public.coop_plans;
begin
	perform public.coop_check(p_space, p_token);
	if char_length(p_data) > 10000000 then
		raise exception 'coop: plan too large' using errcode = '54000';
	end if;
	select * into v_current from public.coop_plans where space_id = p_space and id = p_id for update;
	if not found then
		if p_base_revision is not null then
			return jsonb_build_object('ok', false, 'deleted', true);
		end if;
		insert into public.coop_plans (space_id, id, version_id, name, description, folder_id, parent_plan_id, data, updated_by)
		values (p_space, p_id, p_version, p_name, coalesce(p_description, ''), p_folder, p_parent, p_data, p_player);
		return jsonb_build_object('ok', true, 'revision', 1);
	end if;
	if p_base_revision is null or v_current.revision <> p_base_revision then
		return jsonb_build_object('ok', false, 'revision', v_current.revision, 'updatedBy', v_current.updated_by);
	end if;
	update public.coop_plans set name = p_name, description = coalesce(p_description, ''), folder_id = p_folder,
		parent_plan_id = p_parent, data = p_data, revision = v_current.revision + 1, updated_by = p_player, updated_at = now()
	where space_id = p_space and id = p_id;
	return jsonb_build_object('ok', true, 'revision', v_current.revision + 1);
end;
$$;

create function public.coop_delete_plan(p_space uuid, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
	perform public.coop_check(p_space, p_token);
	delete from public.coop_claims where space_id = p_space and plan_id = p_id;
	delete from public.coop_plans where space_id = p_space and id = p_id;
end;
$$;

create function public.coop_save_folder(
	p_space uuid, p_token text, p_player uuid, p_id uuid, p_version text, p_base_revision integer,
	p_name text, p_parent uuid, p_data text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
	v_current public.coop_folders;
begin
	perform public.coop_check(p_space, p_token);
	select * into v_current from public.coop_folders where space_id = p_space and id = p_id for update;
	if not found then
		if p_base_revision is not null then
			return jsonb_build_object('ok', false, 'deleted', true);
		end if;
		insert into public.coop_folders (space_id, id, version_id, name, parent_id, data, updated_by)
		values (p_space, p_id, p_version, p_name, p_parent, p_data, p_player);
		return jsonb_build_object('ok', true, 'revision', 1);
	end if;
	if p_base_revision is null or v_current.revision <> p_base_revision then
		return jsonb_build_object('ok', false, 'revision', v_current.revision, 'updatedBy', v_current.updated_by);
	end if;
	update public.coop_folders set name = p_name, parent_id = p_parent, data = p_data,
		revision = v_current.revision + 1, updated_by = p_player, updated_at = now()
	where space_id = p_space and id = p_id;
	return jsonb_build_object('ok', true, 'revision', v_current.revision + 1);
end;
$$;

create function public.coop_delete_folder(p_space uuid, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
	perform public.coop_check(p_space, p_token);
	delete from public.coop_folders where space_id = p_space and id = p_id;
end;
$$;

-- Claims -------------------------------------------------------------------------

-- Returns who holds the claim afterwards: the caller, or whoever got there first.
create function public.coop_claim(p_space uuid, p_token text, p_player uuid, p_plan uuid, p_node text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
	v_holder uuid;
begin
	perform public.coop_check(p_space, p_token);
	insert into public.coop_claims (space_id, plan_id, node_id, player_id) values (p_space, p_plan, p_node, p_player)
	on conflict do nothing;
	select player_id into v_holder from public.coop_claims where space_id = p_space and plan_id = p_plan and node_id = p_node;
	return v_holder;
end;
$$;

create function public.coop_unclaim(p_space uuid, p_token text, p_plan uuid, p_node text) returns void
language plpgsql security definer set search_path = '' as $$
begin
	perform public.coop_check(p_space, p_token);
	delete from public.coop_claims where space_id = p_space and plan_id = p_plan and node_id = p_node;
end;
$$;

-- Moves claims onto new node ids, e.g. after a split; null drops the claim.
create function public.coop_move_claims(p_space uuid, p_token text, p_plan uuid, p_moves jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
	v_move jsonb;
begin
	perform public.coop_check(p_space, p_token);
	for v_move in select * from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
		if v_move->>'to' is null then
			delete from public.coop_claims where space_id = p_space and plan_id = p_plan and node_id = v_move->>'from';
		else
			update public.coop_claims set node_id = v_move->>'to'
			where space_id = p_space and plan_id = p_plan and node_id = v_move->>'from'
				and not exists (select 1 from public.coop_claims c where c.space_id = p_space and c.plan_id = p_plan and c.node_id = v_move->>'to');
		end if;
	end loop;
end;
$$;

-- Only the functions are reachable from the app ------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
	public.coop_create_space(text, uuid, text, text),
	public.coop_join(uuid, text, uuid, text, text),
	public.coop_space(uuid, text),
	public.coop_rename_space(uuid, text, text),
	public.coop_load(uuid, text, text),
	public.coop_get(uuid, text, uuid[], uuid[]),
	public.coop_save_plan(uuid, text, uuid, uuid, text, integer, text, text, uuid, uuid, text),
	public.coop_delete_plan(uuid, text, uuid),
	public.coop_save_folder(uuid, text, uuid, uuid, text, integer, text, uuid, text),
	public.coop_delete_folder(uuid, text, uuid),
	public.coop_claim(uuid, text, uuid, uuid, text),
	public.coop_unclaim(uuid, text, uuid, text),
	public.coop_move_claims(uuid, text, uuid, jsonb)
to anon, authenticated;
