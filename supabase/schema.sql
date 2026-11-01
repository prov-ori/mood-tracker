-- Mood Atlas v1. Run ONCE in a NEW Supabase project's SQL Editor.
begin;
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  name text not null default '' check (length(name)<=80),
  timezone text not null default 'UTC' check (length(timezone)<=80)
);
create table public.entries (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null check (date between '1900-01-01' and '2200-12-31'),
  low smallint not null check(low between 0 and 4),
  activation smallint not null check(activation between 0 and 4),
  energy smallint not null check(energy between 0 and 4),
  anxiety smallint not null check(anxiety between 0 and 4),
  irritability smallint not null check(irritability between 0 and 4),
  sleep numeric(4,2) not null check(sleep between 0 and 24 and mod(sleep,0.25)=0),
  medication text not null default '' check(length(medication)<=5000),
  events text not null default '' check(length(events)<=5000),
  notes text not null default '' check(length(notes)<=5000),
  primary key(user_id,date)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check(length(title) between 1 and 120),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=20000000),
  created_at timestamptz not null default now()
);
create index reports_user_created on public.reports(user_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.reports enable row level security;
revoke all on public.profiles,public.entries,public.reports from anon,authenticated;
grant select,insert,update,delete on public.profiles,public.entries to authenticated;
grant select,insert,delete on public.reports to authenticated;
create policy profiles_owner on public.profiles to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy entries_owner on public.entries to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy reports_read on public.reports for select to authenticated using(user_id=(select auth.uid()));
create policy reports_insert on public.reports for insert to authenticated with check(user_id=(select auth.uid()));
create policy reports_delete on public.reports for delete to authenticated using(user_id=(select auth.uid()));
-- There is no UPDATE grant or policy on reports: snapshots are immutable.
create function public.export_my_data() returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
   'entries',coalesce((select jsonb_agg(to_jsonb(e)-'user_id' order by e.date) from public.entries e),'[]'::jsonb),
   'reports',coalesce((select jsonb_agg(to_jsonb(r)-'user_id' order by r.created_at) from public.reports r),'[]'::jsonb),
   'profile',(select to_jsonb(p)-'user_id' from public.profiles p)
 );
$$;
-- One transaction: invalid data rolls back the entire import.
create function public.import_my_data(payload jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare row_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if jsonb_typeof(payload->'entries') is distinct from 'array' or jsonb_typeof(payload->'reports') is distinct from 'array' then raise exception 'Invalid backup';end if;
 if jsonb_array_length(payload->'entries')>20000 or jsonb_array_length(payload->'reports')>500 then raise exception 'Backup too large';end if;
 insert into public.entries(user_id,date,low,activation,energy,anxiety,irritability,sleep,medication,events,notes)
 select auth.uid(),x.date,x.low,x.activation,x.energy,x.anxiety,x.irritability,x.sleep,coalesce(x.medication,''),coalesce(x.events,''),coalesce(x.notes,'')
 from jsonb_to_recordset(payload->'entries') as x(date date,low smallint,activation smallint,energy smallint,anxiety smallint,irritability smallint,sleep numeric,medication text,events text,notes text)
 on conflict(user_id,date) do update set low=excluded.low,activation=excluded.activation,energy=excluded.energy,anxiety=excluded.anxiety,irritability=excluded.irritability,sleep=excluded.sleep,medication=excluded.medication,events=excluded.events,notes=excluded.notes;
 for row_data in select value from jsonb_array_elements(payload->'reports') loop
   insert into public.reports(user_id,title,snapshot) values(auth.uid(),row_data->>'title',row_data->'snapshot');
 end loop;
end;
$$;
-- The only security-definer function. No user id parameter; only caller can be deleted.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 delete from auth.users where id=auth.uid();
end;
$$;
revoke all on function public.export_my_data() from public,anon;
revoke all on function public.import_my_data(jsonb) from public,anon;
revoke all on function public.delete_my_account() from public,anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.import_my_data(jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
commit;
