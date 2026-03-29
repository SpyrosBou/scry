const test = require('node:test');
const assert = require('node:assert/strict');

const { __test__ } = require('../../utils/report-templates');

test('keyboard page card surfaces focus sequence details after extraction', () => {
  const html = __test__.renderKeyboardPageCard({
    page: '/contact',
    projectName: 'Chrome',
    viewport: 'desktop',
    focusableCount: 5,
    visitedCount: 4,
    gatingIssues: ['Keyboard trap detected'],
    warnings: ['Execution stalled after modal open'],
    advisories: ['Skip navigation link not detected near top of document.'],
    focusSequence: [
      { summary: 'Skip to content', hasIndicator: true },
      { summary: 'Primary navigation', hasIndicator: false },
    ],
    notes: ['Focus moved into navigation before main content'],
  });

  assert.match(html, /Keyboard trap detected/);
  assert.match(html, /Focus sequence \(2 stops\)/);
  assert.match(html, /Skip to content/);
  assert.match(html, /Primary navigation/);
});

test('structure page card surfaces heading outline after extraction', () => {
  const html = __test__.renderStructurePageCard({
    page: '/pricing',
    h1Count: 1,
    hasMainLandmark: true,
    navigationLandmarks: 1,
    headerLandmarks: 1,
    footerLandmarks: 1,
    gatingIssues: ['Main landmark missing on fallback template'],
    warnings: ['Heading levels skip from H2 to H4'],
    advisories: [],
    headingSkips: [{ summary: 'Heading level sequence issue', sample: 'H2 to H4' }],
    headingOutline: [
      { text: 'Pricing', level: 1 },
      { text: 'Starter', level: 2 },
    ],
  });

  assert.match(html, /Main landmark missing on fallback template/);
  assert.match(html, /Heading outline \(2 headings\)/);
  assert.match(html, /Pricing/);
  assert.match(html, /Starter/);
});
