const isArray = (value) => (Array.isArray(value) ? value : []);
const normaliseOptions = (value) => (value && typeof value === 'object' ? value : {});

module.exports = function createBucketedSuiteRenderer({
  collectSchemaProjects,
  renderSuiteFindingsBlock,
  renderProjectBlockSection,
  renderSchemaGroupContainer,
}) {
  if (typeof collectSchemaProjects !== 'function') {
    throw new TypeError('collectSchemaProjects must be a function.');
  }
  if (typeof renderSuiteFindingsBlock !== 'function') {
    throw new TypeError('renderSuiteFindingsBlock must be a function.');
  }
  if (typeof renderProjectBlockSection !== 'function') {
    throw new TypeError('renderProjectBlockSection must be a function.');
  }
  if (typeof renderSchemaGroupContainer !== 'function') {
    throw new TypeError('renderSchemaGroupContainer must be a function.');
  }

  return function renderBucketedSuite(group, bucketBuilder, { element = 'article' } = {}) {
    const buckets = collectSchemaProjects(group);
    if (!Array.isArray(buckets) || buckets.length === 0) return '';
    if (typeof bucketBuilder !== 'function') return '';

    const multiBucket = buckets.length > 1;
    const sections = buckets
      .map((bucket) => {
        const result = bucketBuilder(bucket, { multiBucket });
        if (!result) return '';
        const projectLabel = result.projectLabel || bucket.projectName || 'Chrome';
        const content =
          typeof result.content === 'string' && result.content.trim()
            ? result.content
            : renderSuiteFindingsBlock({
                gatingIssues: isArray(result.gatingIssues),
                advisoryIssues: isArray(result.advisoryIssues),
                perPageEntries: isArray(result.perPageEntries),
                gatingOptions: normaliseOptions(result.gatingOptions),
                advisoryOptions: normaliseOptions(result.advisoryOptions),
                perPageOptions: normaliseOptions(result.perPageOptions),
              });

        if (!content) return '';

        if (multiBucket) {
          return renderProjectBlockSection({ projectLabel, content });
        }

        return content;
      })
      .filter(Boolean);

    if (sections.length === 0) return '';

    return renderSchemaGroupContainer({
      sections,
      heading: multiBucket && group.title ? group.title : null,
      element,
    });
  };
};
