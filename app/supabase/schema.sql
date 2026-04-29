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
  id                    uuid primary key default gen_random_uuid(),
  site_id               uuid references sites on delete cascade not null,
  source_kind           text,
  source_artifact_id    text,
  source_run_id         text,
  source_payload_hash   text,
  profile               text,
  status                text not null check (status in ('running','pass','warn','fail')),
  pages_tested          int default 0 check (pages_tested >= 0),
  total_tests           int check (total_tests is null or total_tests >= 0),
  total_tests_planned   int check (total_tests_planned is null or total_tests_planned >= 0),
  status_counts         jsonb default '{}' check (jsonb_typeof(status_counts) = 'object'),
  suites_run            text[] default '{}'
    check (suites_run <@ array['functionality','accessibility','responsive','visual']::text[]),
  report_relative_path  text,
  started_at            timestamptz default now(),
  completed_at          timestamptz,
  check (completed_at is null or started_at is null or completed_at >= started_at)
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

create unique index runs_site_source_artifact_unique
  on runs (site_id, source_kind, source_artifact_id)
  where source_kind is not null and source_artifact_id is not null;

-- run_suites: per-suite scores within a run
create table run_suites (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid references runs on delete cascade not null,
  suite          text not null check (suite in ('functionality','accessibility','responsive','visual')),
  score          int check (score is null or (score >= 0 and score <= 100)),
  status         text not null check (status in ('pass','warn','fail')),
  summary_types  text[] default '{}',
  summary        jsonb default '{}' check (jsonb_typeof(summary) = 'object'),
  unique (run_id, suite)
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

-- findings: issues discovered in a run
create table findings (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references runs on delete cascade not null,
  suite         text not null check (suite in ('functionality','accessibility','responsive','visual')),
  summary_type  text,
  rule          text not null,
  severity      text not null check (severity in ('blocker','warning','passed')),
  page          text,
  viewport      text,
  source_key    text,
  page_count    int default 1 check (page_count >= 0),
  details       jsonb default '{}' check (jsonb_typeof(details) = 'object')
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

create unique index findings_run_source_key_unique
  on findings (run_id, source_key)
  where source_key is not null;
