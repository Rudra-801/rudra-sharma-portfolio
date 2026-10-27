import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('Frontend/academics.html');
const css = read('Frontend/css/academics-curriculum-v235.css');
const js = read('Frontend/js/academics-controller.js');
const curriculum = JSON.parse(read('Frontend/data/mriirs-cse-2023-27.json'));

const tests = [
  ['curriculum coverage', () => {
    assert.ok(curriculum.courses.length >= 150);
    assert.deepEqual([...new Set(curriculum.courses.map(x => x.semesterSuggested))].sort(), [1,2,3,4,5,6,7,8]);
    assert.ok(curriculum.courses.filter(x => x.units.length).length >= 90);
    const keys = curriculum.courses.map(x => `${x.semesterSuggested}:${x.code}`);
    assert.equal(new Set(keys).size, keys.length);
  }],
  ['detailed syllabus sample', () => {
    const cn = curriculum.courses.find(x => x.code === 'BCS-DS-405');
    assert.ok(cn);
    assert.equal(cn.title, 'Computer Networks');
    assert.ok(cn.units.length >= 6);
    assert.ok(cn.units.some(x => x.topics.join(' ').includes('Transmission Control Protocol')));
  }],
  ['academics interface contracts', () => {
    for (const id of ['mySubjectGrid','curriculumGrid','curriculumManager','courseWorkspace','academicToolModal']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /academics-curriculum-v235\.css/);
    assert.match(html, /academics-controller\.js\?v=20261010-evaluation2/);
  }],
  ['working integrations', () => {
    assert.match(js, /NEXZOTaskStore/);
    assert.match(js, /nexzo\.ai\.launch/);
    assert.match(js, /NEXZOBackendStore\.putState\('academics'/);
    assert.doesNotMatch(js, /google\.com\/search/);
  }],
  ['scoped black-gold design', () => {
    assert.match(css, /\.academics-page/);
    assert.match(css, /#e1b52f/i);
    assert.match(css, /nxAcadShimmer/);
    assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
  }]
];

let passed=0;
for (const [name,fn] of tests){try{fn();passed++;console.log(`PASS ${name}`)}catch(error){console.error(`FAIL ${name}: ${error.message}`);process.exitCode=1}}
console.log(`Academics v235: ${passed}/${tests.length} checks passed.`);
