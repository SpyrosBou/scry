#!/usr/bin/env node
'use strict';

/**
 * Normalize a generated Scry report artifact for database ingestion.
 *
 * Default behavior is read-only: prints normalized JSON for a report run directory
 * or `data/run.json` file. With `--write`, the script upserts into Supabase or
 * posts to the trusted Scry ingestion endpoint using deterministic IDs derived
 * from the artifact folder and payload hash.
 *
 * Side effects: `--write` mutates `runs`, `run_suites`, and `findings`; without it,
 * no network or database writes are attempted.
 *
 * Env vars for direct Supabase `--write`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (or SUPABASE_SERVICE_KEY), and SCRY_SITE_ID (or SUPABASE_SITE_ID). Env vars for
 * endpoint `--write`: SCRY_INGEST_URL, SCRY_INGEST_TOKEN, and SCRY_SITE_ID.
 * Optional: SUPABASE_SCHEMA defaults to `public`.
 */

const path = require('path');
const minimist = require('minimist');

const { normalizeRunArtifact, readRunArtifact } = require('../../utils/report-ingestion/normalize');

const logPrefix = '[import-run]';

const usage = () => {
  console.log(`Usage: node scripts/reporting/import-run.js <run-dir|run.json> [--write] [--site-id <uuid>]

Options:
  --write            Send normalized records to Supabase or the ingestion endpoint.
  --site-id <uuid>   Site ID for the runs.site_id foreign key. Defaults to SCRY_SITE_ID.
  --endpoint <url>   Trusted Scry ingestion endpoint. Defaults to SCRY_INGEST_URL.
  --pretty           Pretty-print JSON output. Enabled by default unless --write is used.
  --help             Show this help.`);
};

const loadSupabaseClient = () => {
  const candidates = [
    '@supabase/supabase-js',
    path.resolve(process.cwd(), 'app/node_modules/@supabase/supabase-js'),
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  throw new Error('Unable to load @supabase/supabase-js. Run app install before using --write.');
};

const requireWriteConfig = (argv) => {
  const endpoint = argv.endpoint || process.env.SCRY_INGEST_URL;
  if (endpoint) {
    const token = process.env.SCRY_INGEST_TOKEN;
    const siteId = argv['site-id'] || process.env.SCRY_SITE_ID || process.env.SUPABASE_SITE_ID;

    if (!token) throw new Error('SCRY_INGEST_TOKEN is required when using --endpoint');
    if (!siteId)
      throw new Error('SCRY_SITE_ID, SUPABASE_SITE_ID, or --site-id is required for --write');

    return {
      mode: 'endpoint',
      endpoint,
      token,
      siteId,
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const siteId = argv['site-id'] || process.env.SCRY_SITE_ID || process.env.SUPABASE_SITE_ID;

  if (!supabaseUrl) throw new Error('SUPABASE_URL is required for --write');
  if (!serviceKey)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY is required for --write');
  if (!siteId)
    throw new Error('SCRY_SITE_ID, SUPABASE_SITE_ID, or --site-id is required for --write');

  return {
    mode: 'supabase',
    supabaseUrl,
    serviceKey,
    siteId,
    schema: process.env.SUPABASE_SCHEMA || 'public',
  };
};

const upsertTable = async (supabase, table, rows) => {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
};

const writeNormalizedRun = async (normalized, config) => {
  const { createClient } = loadSupabaseClient();
  const supabase = createClient(config.supabaseUrl, config.serviceKey, {
    db: { schema: config.schema },
    auth: { persistSession: false },
  });

  const { runs, run_suites, findings } = normalized.records;
  await upsertTable(supabase, 'runs', runs);
  await upsertTable(supabase, 'run_suites', run_suites);
  await upsertTable(supabase, 'findings', findings);
};

const postNormalizedRun = async (normalized, config) => {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(normalized),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ingestion endpoint failed with ${response.status}: ${body}`);
  }
};

const main = async (argv = process.argv.slice(2)) => {
  const args = minimist(argv, {
    boolean: ['write', 'pretty', 'help'],
    string: ['site-id', 'endpoint'],
    default: { pretty: true },
    alias: { h: 'help' },
  });

  if (args.help) {
    usage();
    return;
  }

  const inputPath = args._[0];
  if (!inputPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const writeConfig = args.write ? requireWriteConfig(args) : null;
  const artifact = readRunArtifact(inputPath);
  const normalized = normalizeRunArtifact({
    runData: artifact.runData,
    artifactDir: artifact.artifactDir,
    artifactPath: artifact.artifactPath,
    siteId: writeConfig?.siteId || args['site-id'] || null,
  });

  if (args.write) {
    if (writeConfig.mode === 'endpoint') {
      await postNormalizedRun(normalized, writeConfig);
    } else {
      await writeNormalizedRun(normalized, writeConfig);
    }
    console.error(
      `${logPrefix} upserted run ${normalized.records.runs[0].id} (${normalized.records.findings.length} findings)`
    );
    return;
  }

  console.log(JSON.stringify(normalized, null, args.pretty ? 2 : 0));
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`${logPrefix} ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  postNormalizedRun,
  writeNormalizedRun,
};
