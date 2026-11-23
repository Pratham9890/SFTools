-- "Send a copy": plan files stored behind a link. The id is random, so only people with the link can read the copy.

create table public.plan_copies (
	id text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
	name text not null check (char_length(name) between 1 and 200),
	content text not null check (char_length(content) between 1 and 2000000),
	created_at timestamptz not null default now()
);

alter table public.plan_copies enable row level security;
revoke all on public.plan_copies from anon, authenticated;

create function public.coop_save_copy(p_name text, p_content text) returns text
language plpgsql security definer set search_path = '' as $$
declare
	v_id text;
begin
	insert into public.plan_copies (name, content) values (left(trim(p_name), 200), p_content) returning id into v_id;
	return v_id;
end;
$$;

create function public.coop_get_copy(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
	select jsonb_build_object('name', name, 'content', content) from public.plan_copies where id = p_id;
$$;

revoke execute on function public.coop_save_copy(text, text), public.coop_get_copy(text) from public, anon, authenticated;
grant execute on function public.coop_save_copy(text, text), public.coop_get_copy(text) to anon, authenticated;
