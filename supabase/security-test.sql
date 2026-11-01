-- Run after schema.sql in Supabase SQL Editor on your new project.
-- Creates two synthetic users inside a transaction, then ROLLS BACK all test data.
-- Expected result: Success. If any check fails, do NOT enter personal records.
begin;
insert into auth.users(id,email) values
 ('95776bc3-d12c-4a88-9d93-884e16d05801','mood-test-a@example.invalid'),
 ('95776bc3-d12c-4a88-9d93-884e16d05802','mood-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','95776bc3-d12c-4a88-9d93-884e16d05801',true);
select set_config('request.jwt.claims','{"sub":"95776bc3-d12c-4a88-9d93-884e16d05801","role":"authenticated"}',true);
insert into public.entries(date,low,activation,energy,anxiety,irritability,sleep,notes) values('2026-01-01',1,2,3,0,0,8,'synthetic A');
insert into public.profiles(name) values('Synthetic A');
insert into public.reports(title,snapshot) values('Synthetic A','{"version":1,"entries":[]}');
do $$ begin
 if (select count(*) from public.entries)<>1 then raise exception 'Owner SELECT failed';end if;
 update public.entries set notes='synthetic A updated';
 if not exists(select 1 from public.entries where notes='synthetic A updated') then raise exception 'Owner UPDATE failed';end if;
 begin
  update public.reports set title='must fail';
  raise exception 'Snapshot UPDATE was allowed';
 exception when insufficient_privilege then null;end;
 -- The first import row is valid; the second is invalid. Neither may persist.
 begin
  perform public.import_my_data('{"entries":[{"date":"2026-01-02","low":1,"activation":1,"energy":1,"anxiety":1,"irritability":1,"sleep":8},{"date":"2026-01-03","low":99,"activation":1,"energy":1,"anxiety":1,"irritability":1,"sleep":8}],"reports":[]}');
  raise exception 'Invalid import was allowed';
 exception when check_violation then null;end;
 if exists(select 1 from public.entries where date='2026-01-02') then raise exception 'Import was not atomic';end if;
end $$;
select set_config('request.jwt.claim.sub','95776bc3-d12c-4a88-9d93-884e16d05802',true);
select set_config('request.jwt.claims','{"sub":"95776bc3-d12c-4a88-9d93-884e16d05802","role":"authenticated"}',true);
do $$ declare changed integer;begin
 if exists(select 1 from public.entries) or exists(select 1 from public.profiles) or exists(select 1 from public.reports) then raise exception 'Cross-user SELECT leak';end if;
 if jsonb_array_length(public.export_my_data()->'entries')<>0 then raise exception 'Export leaked records';end if;
 update public.entries set notes='must not change A';get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Cross-user UPDATE allowed';end if;
 delete from public.entries;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Cross-user DELETE allowed';end if;
 delete from public.reports;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Cross-user report DELETE allowed';end if;
 begin
  insert into public.entries(user_id,date,low,activation,energy,anxiety,irritability,sleep) values('95776bc3-d12c-4a88-9d93-884e16d05801','2026-01-04',0,0,0,0,0,8);
  raise exception 'Cross-user INSERT allowed';
 exception when insufficient_privilege then null;end;
end $$;
select public.import_my_data('{"entries":[{"date":"2026-01-05","low":0,"activation":1,"energy":2,"anxiety":0,"irritability":0,"sleep":8}],"reports":[]}');
do $$ begin
 if (select count(*) from public.entries)<>1 then raise exception 'Valid import failed';end if;
 delete from public.entries;
 if exists(select 1 from public.entries) then raise exception 'Owner DELETE failed';end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.entries;raise exception 'Anon SELECT allowed';exception when insufficient_privilege then null;end;
 begin perform public.delete_my_account();raise exception 'Anon account delete allowed';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','95776bc3-d12c-4a88-9d93-884e16d05801',true);
select set_config('request.jwt.claims','{"sub":"95776bc3-d12c-4a88-9d93-884e16d05801","role":"authenticated"}',true);
select public.delete_my_account();
reset role;
do $$ begin
 if exists(select 1 from auth.users where id='95776bc3-d12c-4a88-9d93-884e16d05801') then raise exception 'Account delete failed';end if;
 if not exists(select 1 from auth.users where id='95776bc3-d12c-4a88-9d93-884e16d05802') then raise exception 'Account delete affected another user';end if;
 if exists(select 1 from public.entries where user_id='95776bc3-d12c-4a88-9d93-884e16d05801') or exists(select 1 from public.reports where user_id='95776bc3-d12c-4a88-9d93-884e16d05801') or exists(select 1 from public.profiles where user_id='95776bc3-d12c-4a88-9d93-884e16d05801') then raise exception 'Cascade deletion failed';end if;
end $$;
rollback;
