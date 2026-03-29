#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sass = require('sass');

const sourcePath = path.join(__dirname, 'styles', 'landing.scss');
const targetPath = path.join(__dirname, 'styles', 'landing.css');

function compileStyles() {
  try {
    const result = sass.compile(sourcePath, { style: 'expanded' });
    const css = `${result.css.trim()}\n`;
    fs.writeFileSync(targetPath, css, 'utf8');
    console.log(`\u2714 Compiled landing styles to ${path.relative(process.cwd(), targetPath)}`);
  } catch (error) {
    console.error(`\u2716 Unable to compile landing styles: ${error.message}`);
    process.exitCode = 1;
  }
}

compileStyles();
