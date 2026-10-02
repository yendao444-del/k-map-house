-- Keep free-form notes separate from reasons used by debt permission policies.
alter table public.debt_entries
  add column if not exists note text not null default '';

notify pgrst, 'reload schema';
