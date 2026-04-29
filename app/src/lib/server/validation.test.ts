import { describe, expect, it } from 'vitest';
import {
	generateSlug,
	sanitizeAppRedirect,
	validateProjectPayload,
	validateSitePayload,
	validateUrl
} from './validation';

describe('server validation', () => {
	it('validates URLs every time and only allows http or https', () => {
		expect(validateUrl('https://example.test/path').ok).toBe(true);
		expect(validateUrl('ftp://example.test').ok).toBe(false);
		expect(validateUrl('not a url').ok).toBe(false);
	});

	it('rejects site payloads with invalid URLs even when a name is supplied', () => {
		const result = validateSitePayload({
			project_id: '11111111-1111-4111-8111-111111111111',
			url: 'not a url',
			name: 'Example'
		});

		expect(result.ok).toBe(false);
	});

	it('rejects names that cannot produce a usable slug', () => {
		expect(generateSlug('!!!')).toBe('');
		expect(validateProjectPayload({ name: '!!!' }).ok).toBe(false);
		expect(validateProjectPayload({ name: 'Valid Name', slug: 'Invalid Slug' }).ok).toBe(false);
	});

	it('sanitizes auth redirects to app-relative paths', () => {
		expect(sanitizeAppRedirect('/sites/example')).toBe('/sites/example');
		expect(sanitizeAppRedirect('//evil.test')).toBe('/dashboard');
		expect(sanitizeAppRedirect('https://evil.test')).toBe('/dashboard');
		expect(sanitizeAppRedirect('/safe\nbad')).toBe('/dashboard');
		expect(sanitizeAppRedirect(null)).toBe('/dashboard');
	});
});
