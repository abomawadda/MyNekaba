create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
revoke execute on function public.my_role() from anon, public;
revoke execute on function public.my_member_id() from anon, public;
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_staff() from anon, public;
revoke execute on function public.is_staff_writer() from anon, public;
revoke execute on function public.is_finance() from anon, public;
grant execute on function public.my_role(), public.my_member_id(), public.is_admin(), public.is_staff(), public.is_staff_writer(), public.is_finance() to authenticated;
