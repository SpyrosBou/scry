const test = require('node:test');
const assert = require('node:assert/strict');

const createBucketedSuiteRenderer = require('../../utils/report-templates/groups/helpers/bucketed-suite');

const noop = () => {
  throw new Error('Should not be called');
};

test('renderBucketedSuite exits early when no schema buckets exist', () => {
  const renderBucketedSuite = createBucketedSuiteRenderer({
    collectSchemaProjects: () => [],
    renderSuiteFindingsBlock: noop,
    renderProjectBlockSection: noop,
    renderSchemaGroupContainer: noop,
  });

  assert.equal(renderBucketedSuite({ title: 'Empty' }, () => ({})), '');
});

test('renderBucketedSuite uses inline content for single-bucket groups', () => {
  const renderBucketedSuite = createBucketedSuiteRenderer({
    collectSchemaProjects: () => [{ projectName: 'Chrome' }],
    renderSuiteFindingsBlock: () => {
      throw new Error('Should not build suite block');
    },
    renderProjectBlockSection: () => {
      throw new Error('Should not wrap single bucket');
    },
    renderSchemaGroupContainer: ({ sections, element, heading }) => {
      assert.equal(element, 'article');
      assert.equal(heading, null);
      return `<${element}>${sections.join('')}</${element}>`;
    },
  });

  const html = renderBucketedSuite(
    { title: 'Internal links' },
    () => ({ content: '   <p>Rendered inline</p>   ' })
  );

  assert.equal(html, '<article>   <p>Rendered inline</p>   </article>');
});

test('renderBucketedSuite builds findings blocks and wraps multi-bucket output', () => {
  const buckets = [{ projectName: 'Chrome' }, { projectName: 'Firefox' }];
  const suiteCalls = [];
  const projectSections = [];

  const renderBucketedSuite = createBucketedSuiteRenderer({
    collectSchemaProjects: () => buckets,
    renderSuiteFindingsBlock: (payload) => {
      suiteCalls.push(payload);
      return `FINDINGS-${suiteCalls.length}`;
    },
    renderProjectBlockSection: ({ projectLabel, content }) => {
      projectSections.push({ projectLabel, content });
      return `<section data-project="${projectLabel}">${content}</section>`;
    },
    renderSchemaGroupContainer: ({ sections, heading, element }) =>
      `container:${heading}:${element}:${sections.join('|')}`,
  });

  const html = renderBucketedSuite(
    { title: 'Site quality' },
    (bucket, { multiBucket }) => {
      if (bucket.projectName === 'Chrome') {
        return {
          projectLabel: 'Chrome stable',
          gatingIssues: [{ id: 'g1' }],
          perPageEntries: [{ page: '/home' }],
          gatingOptions: { title: 'Blocking' },
          perPageOptions: { heading: 'Per page' },
          multiBucketFlag: multiBucket,
        };
      }
      return {
        projectLabel: 'Firefox beta',
        content: '<p>custom</p>',
      };
    }
  );

  assert.equal(suiteCalls.length, 1);
  assert.deepEqual(suiteCalls[0].gatingIssues, [{ id: 'g1' }]);
  assert.deepEqual(suiteCalls[0].advisoryIssues, []);
  assert.deepEqual(suiteCalls[0].perPageEntries, [{ page: '/home' }]);
  assert.deepEqual(suiteCalls[0].gatingOptions, { title: 'Blocking' });
  assert.deepEqual(suiteCalls[0].perPageOptions, { heading: 'Per page' });
  assert.deepEqual(suiteCalls[0].advisoryOptions, {});

  assert.equal(projectSections.length, 2);
  assert.equal(projectSections[0].projectLabel, 'Chrome stable');
  assert.match(projectSections[0].content, /FINDINGS-1/);
  assert.equal(projectSections[1].projectLabel, 'Firefox beta');
  assert.equal(projectSections[1].content, '<p>custom</p>');

  assert.equal(html, 'container:Site quality:article:<section data-project="Chrome stable">FINDINGS-1</section>|<section data-project="Firefox beta"><p>custom</p></section>');
});
