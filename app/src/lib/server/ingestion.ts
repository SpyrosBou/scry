import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, RunStatus, Severity, SuiteSlug, SuiteStatus } from '$lib/db';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

type RunInsert = Database['public']['Tables']['runs']['Insert'];
type RunSuiteInsert = Database['public']['Tables']['run_suites']['Insert'];
type FindingInsert = Database['public']['Tables']['findings']['Insert'];

export interface NormalizedRunImport {
	import_id?: string;
	payload_hash?: string;
	records: {
		runs: RunInsert[];
		run_suites: RunSuiteInsert[];
		findings: FindingInsert[];
	};
}

const RUN_STATUSES = new Set<RunStatus>(['running', 'pass', 'warn', 'fail']);
const SUITE_STATUSES = new Set<SuiteStatus>(['pass', 'warn', 'fail']);
const SUITES = new Set<SuiteSlug>(['functionality', 'accessibility', 'responsive', 'visual']);
const SEVERITIES = new Set<Severity>(['blocker', 'warning', 'passed']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordArray(value: unknown, fieldName: string): ValidationResult<Record<string, unknown>[]> {
	if (!Array.isArray(value)) return { ok: false, error: `${fieldName} must be an array` };
	if (!value.every(isRecord)) return { ok: false, error: `${fieldName} must contain objects` };
	return { ok: true, value };
}

function hasString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export function isAuthorizedIngestRequest(
	authorizationHeader: string | null,
	expectedToken: string | undefined
): boolean {
	if (!expectedToken || !authorizationHeader) return false;

	const [scheme, token] = authorizationHeader.split(/\s+/, 2);
	if (scheme !== 'Bearer' || !token) return false;

	const expected = Buffer.from(expectedToken);
	const received = Buffer.from(token);
	if (expected.length !== received.length) return false;

	return timingSafeEqual(expected, received);
}

export function validateNormalizedRunImport(payload: unknown): ValidationResult<NormalizedRunImport> {
	if (!isRecord(payload)) return { ok: false, error: 'Request body must be an object' };
	if (!isRecord(payload.records)) return { ok: false, error: 'records must be an object' };

	const runs = readRecordArray(payload.records.runs, 'records.runs');
	if (!runs.ok) return runs;
	const runSuites = readRecordArray(payload.records.run_suites, 'records.run_suites');
	if (!runSuites.ok) return runSuites;
	const findings = readRecordArray(payload.records.findings, 'records.findings');
	if (!findings.ok) return findings;

	if (runs.value.length !== 1) return { ok: false, error: 'Exactly one run is required' };

	const run = runs.value[0];
	if (!hasString(run.id)) return { ok: false, error: 'Run id is required' };
	if (!hasString(run.site_id)) return { ok: false, error: 'Run site_id is required' };
	if (!hasString(run.source_kind)) return { ok: false, error: 'Run source_kind is required' };
	if (!hasString(run.source_artifact_id)) {
		return { ok: false, error: 'Run source_artifact_id is required' };
	}
	if (!hasString(run.source_payload_hash)) {
		return { ok: false, error: 'Run source_payload_hash is required' };
	}
	if (!RUN_STATUSES.has(run.status as RunStatus)) return { ok: false, error: 'Run status is invalid' };

	for (const suite of runSuites.value) {
		if (suite.run_id !== run.id) return { ok: false, error: 'run_suites must reference the run id' };
		if (!SUITES.has(suite.suite as SuiteSlug)) return { ok: false, error: 'run_suites suite is invalid' };
		if (!SUITE_STATUSES.has(suite.status as SuiteStatus)) {
			return { ok: false, error: 'run_suites status is invalid' };
		}
	}

	for (const finding of findings.value) {
		if (finding.run_id !== run.id) return { ok: false, error: 'findings must reference the run id' };
		if (!SUITES.has(finding.suite as SuiteSlug)) return { ok: false, error: 'findings suite is invalid' };
		if (!hasString(finding.rule)) return { ok: false, error: 'findings rule is required' };
		if (!SEVERITIES.has(finding.severity as Severity)) {
			return { ok: false, error: 'findings severity is invalid' };
		}
	}

	return {
		ok: true,
		value: {
			import_id: hasString(payload.import_id) ? payload.import_id : undefined,
			payload_hash: hasString(payload.payload_hash) ? payload.payload_hash : undefined,
			records: {
				runs: runs.value as RunInsert[],
				run_suites: runSuites.value as RunSuiteInsert[],
				findings: findings.value as FindingInsert[]
			}
		}
	};
}

async function upsertRuns(supabase: SupabaseClient<Database>, rows: RunInsert[]) {
	if (rows.length === 0) return;

	const { error } = await supabase.from('runs').upsert(rows, { onConflict: 'id' });
	if (error) throw error;
}

async function upsertRunSuites(supabase: SupabaseClient<Database>, rows: RunSuiteInsert[]) {
	if (rows.length === 0) return;

	const { error } = await supabase.from('run_suites').upsert(rows, { onConflict: 'id' });
	if (error) throw error;
}

async function upsertFindings(supabase: SupabaseClient<Database>, rows: FindingInsert[]) {
	if (rows.length === 0) return;

	const { error } = await supabase.from('findings').upsert(rows, { onConflict: 'id' });
	if (error) throw error;
}

export async function writeNormalizedRunImport(
	supabase: SupabaseClient<Database>,
	payload: NormalizedRunImport
) {
	const { runs, run_suites, findings } = payload.records;

	await upsertRuns(supabase, runs);
	await upsertRunSuites(supabase, run_suites);
	await upsertFindings(supabase, findings);

	return {
		run_id: runs[0].id,
		run_suites: run_suites.length,
		findings: findings.length
	};
}
