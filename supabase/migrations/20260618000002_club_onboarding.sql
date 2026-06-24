-- Talyn — club onboarding
-- Lets an authenticated user with no club either create a club (becoming its
-- club_admin) or join an existing one with a share code. Both run as
-- SECURITY DEFINER RPCs so they can write across RLS without exposing a way to
-- enumerate clubs (RLS still hides clubs the caller doesn't belong to).

-- Short, shareable code a club admin gives out so others can join.
alter table public.clubs add column join_code text unique;

-- Create a club and make the caller its admin.
create or replace function public.create_club(p_name text)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Club name is required';
  end if;

  -- 6-char code from a fresh uuid; retry on the (unlikely) collision.
  loop
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') for 6));
    exit when not exists (select 1 from public.clubs where join_code = v_code);
  end loop;

  insert into public.clubs (name, join_code)
    values (trim(p_name), v_code)
    returning * into v_club;

  update public.profiles
    set club_id = v_club.id, role = 'club_admin'
    where id = auth.uid();

  return v_club;
end;
$$;

-- Join an existing club by its share code. Role is left as-is (defaults to parent).
create or replace function public.join_club(p_code text)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_club
  from public.clubs
  where join_code = upper(trim(p_code));

  if not found then
    raise exception 'No club found for that code';
  end if;

  update public.profiles
    set club_id = v_club.id
    where id = auth.uid();

  return v_club;
end;
$$;

grant execute on function public.create_club(text) to authenticated;
grant execute on function public.join_club(text)  to authenticated;
