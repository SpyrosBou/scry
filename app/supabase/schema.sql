-- Scry database schema
-- Full Postgres schema with Row Level Security policies

-- projects: top-level client grouping (owned by user)
create table projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  slug        text not null,
  created_at  timestamptz default now(),
  unique (user_id, slug)
);

alter table projects enable row level security;

create policy "Users can view own projects"
  on projects for select
  using (auth.uid() = user_id);

create policy "Users can create own projects"
  on projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on projects for delete
  using (auth.uid() = user_id);

-- sites: one WordPress site per project
create table sites (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects on delete cascade not null,
  url         text not null,
  slug        text not null,
  name        text not null,
  created_at  timestamptz default now(),
  unique (project_id, slug)
);

alter table sites enable row level security;

create policy "Users can view sites in own projects"
  on sites for select
  using (
    exists (
      select 1 from projects
      where projects.id = sites.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create sites in own projects"
  on sites for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = sites.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update sites in own projects"
  on sites for update
  using (
    exists (
      select 1 from projects
      where projects.id = sites.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete sites in own projects"
  on sites for delete
  using (
    exists (
      select 1 from projects
      where projects.id = sites.project_id
        and projects.user_id = auth.uid()
    )
  );

-- runs: one audit execution per site
create table runs (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references sites on delete cascade not null,
  status        text not null check (status in ('running','pass','warn','fail')),
  pages_tested  int default 0,
  suites_run    text[] default '{}',
  started_at    timestamptz default now(),
  completed_at  timestamptz
);

alter table runs enable row level security;

create policy "Users can view runs for own sites"
  on runs for select
  using (
    exists (
      select 1 from sites
        join projects on projects.id = sites.project_id
      where sites.id = runs.site_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create runs for own sites"
  on runs for insert
  with check (
    exists (
      select 1 from sites
        join projects on projects.id = sites.project_id
      where sites.id = runs.site_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update runs for own sites"
  on runs for update
  using (
    exists (
      select 1 from sites
        join projects on projects.id = sites.project_id
      where sites.id = runs.site_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete runs for own sites"
  on runs for delete
  using (
    exists (
      select 1 from sites
        join projects on projects.id = sites.project_id
      where sites.id = runs.site_id
        and projects.user_id = auth.uid()
    )
  );

-- run_suites: per-suite scores within a run
create table run_suites (
  id       uuid primary key default gen_random_uuid(),
  run_id   uuid references runs on delete cascade not null,
  suite    text not null check (suite in ('functionality','accessibility','responsive','visual')),
  score    int,
  status   text not null check (status in ('pass','warn','fail'))
);

alter table run_suites enable row level security;

create policy "Users can view run_suites for own runs"
  on run_suites for select
  using (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = run_suites.run_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create run_suites for own runs"
  on run_suites for insert
  with check (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = run_suites.run_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update run_suites for own runs"
  on run_suites for update
  using (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = run_suites.run_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete run_suites for own runs"
  on run_suites for delete
  using (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = run_suites.run_id
        and projects.user_id = auth.uid()
    )
  );

-- findings: issues discovered in a run
create table findings (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references runs on delete cascade not null,
  suite       text not null,
  rule        text not null,
  severity    text not null check (severity in ('blocker','warning','passed')),
  page_count  int default 1,
  details     jsonb default '{}'
);

alter table findings enable row level security;

create policy "Users can view findings for own runs"
  on findings for select
  using (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = findings.run_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create findings for own runs"
  on findings for insert
  with check (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = findings.run_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update findings for own runs"
  on findings for update
  using (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = findings.run_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete findings for own runs"
  on findings for delete
  using (
    exists (
      select 1 from runs
        join sites on sites.id = runs.site_id
        join projects on projects.id = sites.project_id
      where runs.id = findings.run_id
        and projects.user_id = auth.uid()
    )
  );
