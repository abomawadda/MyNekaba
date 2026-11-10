-- anon may no longer execute the role helpers, so anon policies must not reference them.
alter policy events_read_public on public.events to authenticated;
alter policy events_read_public on public.events rename to events_read_auth;
create policy events_read_anon on public.events for select to anon using (is_public);
alter policy news_read on public.site_news to authenticated;
alter policy news_read on public.site_news rename to news_read_auth;
create policy news_read_anon on public.site_news for select to anon using (active);
