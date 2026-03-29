const { escapeHtml } = require('../report-template-helpers');

const assembleSuiteSections = (parts = []) =>
  parts.filter((fragment) => typeof fragment === 'string' && fragment.trim()).join('\n');

const renderProjectBlockSection = ({ projectLabel, content }) => {
  const safeContent = assembleSuiteSections([content]);
  if (!safeContent) return '';
  return `
    <section class="schema-group__project-block">
      <header class="schema-group__project"><h3>${escapeHtml(projectLabel || 'Project')}</h3></header>
      ${safeContent}
    </section>
  `;
};

const renderSchemaGroupContainer = ({ sections, heading = null, element = 'article' } = {}) => {
  const safeSections = Array.isArray(sections) ? sections.filter(Boolean) : [];
  const content = assembleSuiteSections(safeSections);
  if (!content) return '';
  const header = heading ? `<header><h2>${escapeHtml(heading)}</h2></header>` : '';
  return `
    <${element} class="schema-group">
      ${header}
      ${content}
    </${element}>
  `;
};

module.exports = {
  assembleSuiteSections,
  renderProjectBlockSection,
  renderSchemaGroupContainer,
};
