-- RLS smoke test. Runs inside one DO block and ends with RAISE EXCEPTION so every change rolls back;
-- the "error" message carries the results. Expected: every line says blocked / matches its (expect N).
do $$
declare r text := ''; n int; s text;
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  e1 uuid := '00000000-0000-0000-0000-0000000000e1'; u1 uuid := '00000000-0000-0000-0000-0000000000b1';
begin
  insert into public.members (id, job_id, name, membership_status) values (a1,'TJ1','test one','عضو جمعية عمومية'),(a2,'TJ2','test two','عضو جمعية عمومية');
  insert into public.events (id,title,event_date) values (e1,'public trip', current_date+5);
  insert into public.events (title,event_date,is_public) values ('internal', current_date+5,false);
  insert into public.site_news (title,body,active) values ('n1','b',true),('n2','b',false);
  insert into auth.users (id, email, instance_id, aud, role) values (u1,'t@x.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
  update public.profiles set account_status='active', member_id=a1 where id=u1;

  perform set_config('request.jwt.claims', json_build_object('sub',u1,'role','authenticated')::text, true);
  perform set_config('role','authenticated',true);
  select count(*) into n from public.members; r := r || 'member sees members (expect 1): ' || n || E'\n';
  select count(*) into n from public.events;  r := r || 'member sees events (expect 1): ' || n || E'\n';
  insert into public.booking_requests (kind,event_id,member_id,requested_by) values ('event',e1,a1,u1);
  select count(*) into n from public.booking_requests; r := r || 'own request created (expect 1): ' || n || E'\n';
  begin insert into public.booking_requests (kind,event_id,member_id,requested_by) values ('event',e1,a2,u1); r := r || 'book for other member: BAD allowed' || E'\n';
  exception when others then r := r || 'book for other member: blocked' || E'\n'; end;
  begin update public.profiles set role='admin' where id=u1; r := r || 'self role escalation: BAD allowed' || E'\n';
  exception when others then r := r || 'self role escalation: blocked' || E'\n'; end;
  begin update public.booking_requests set status='approved' where member_id=a1; r := r || 'self approve: BAD allowed' || E'\n';
  exception when others then r := r || 'self approve: blocked' || E'\n'; end;
  begin insert into public.event_bookings (event_id, member_id) values (e1,a1); r := r || 'direct booking insert: BAD allowed' || E'\n';
  exception when others then r := r || 'direct booking insert: blocked' || E'\n'; end;
  update public.booking_requests set status='cancelled' where member_id=a1;
  select status::text into s from public.booking_requests where member_id=a1; r := r || 'cancel own pending (expect cancelled): ' || s || E'\n';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role','anon',true);
  select count(*) into n from public.events;    r := r || 'anon sees events (expect 1): ' || n || E'\n';
  select count(*) into n from public.site_news; r := r || 'anon sees news (expect 1): ' || n || E'\n';
  select count(*) into n from public.members;   r := r || 'anon sees members (expect 0): ' || n || E'\n';
  r := r || 'anon public_stats: ' || public.public_stats()::text;
  perform set_config('role','postgres',true);
  raise exception E'TEST RESULTS (all changes rolled back)\n%', r;
end $$;
