import { describe, expect, it } from 'vitest';
import { isAuthorizedIngestRequest, validateNormalizedRunImport } from './ingestion';

const normalizedPayload = {
	import_id: 'import-1',
	payload_hash: 'hash-1',
	records: {
		runs: [
			{
				id: '11111111-1111-5111-8111-111111111111',
				site_id: '22222222-2222-4222-8222-222222222222',
				source_kind: 'local-report',
				source_artifact_id: 'artifact-1',
				source_payload_hash: 'hash-1',
				status: 'warn',
				pages_tested: 1,
				suites_run: ['functionality']
			}
		],
		run_suites: [
			{
				id: '33333333-3333-5333-8333-333333333333',
				run_id: '11111111-1111-5111-8111-111111111111',
				suite: 'functionality',
				score: null,
				status: 'warn',
				summary_types: ['internal-links']
			}
		],
		findings: [
			{
				id: '44444444-4444-5444-8444-444444444444',
				run_id: '11111111-1111-5111-8111-111111111111',
				suite: 'functionality',
				rule: 'internal-links',
				severity: 'warning',
				page_count: 1,
				details: {}
			}
		]
	}
};

describe('audit ingestion validation', () => {
	it('accepts bearer tokens using constant-time comparison semantics', () => {
		expect(isAuthorizedIngestRequest('Bearer secret-token', 'secret-token')).toBe(true);
		expect(isAuthorizedIngestRequest('Bearer wrong-token', 'secret-token')).toBe(false);
		expect(isAuthorizedIngestRequest('Basic secret-token', 'secret-token')).toBe(false);
		expect(isAuthorizedIngestRequest(null, 'secret-token')).toBe(false);
		expect(isAuthorizedIngestRequest('Bearer secret-token', undefined)).toBe(false);
	});

	it('accepts normalized run import payloads', () => {
		const result = validateNormalizedRunImport(normalizedPayload);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.records.runs[0].source_artifact_id).toBe('artifact-1');
			expect(result.value.records.findings).toHaveLength(1);
		}
	});

	it('rejects child records that do not reference the imported run', () => {
		const result = validateNormalizedRunImport({
			...normalizedPayload,
			records: {
				...normalizedPayload.records,
				findings: [
					{
						...normalizedPayload.records.findings[0],
						run_id: '55555555-5555-5555-8555-555555555555'
					}
				]
			}
		});

		expect(result.ok).toBe(false);
	});
});
