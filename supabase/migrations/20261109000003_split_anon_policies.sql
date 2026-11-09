-- anon may no longer execute the role helpers, so anon policies must not reference them.
drop policy events_read_public on public.events;
create policy events_read_anon on public.events for select to anon using (is_public);
create policy events_read_auth on public.events for select to authenticated using (is_public or public.is_staff());
drop policy news_read on public.site_news;
create policy news_read_anon on public.site_news for select to anon using (active);
create policy news_read_auth on public.site_news for select to authenticated using (active or public.is_staff());
