// Writes sample-syllabus.pdf (text-based) that you can upload on the Syllabus page.
import fs from 'node:fs';
import { makePdf } from '../tests/helpers/makePdf.js';

const year = new Date().getFullYear() + (new Date().getMonth() > 9 ? 1 : 0);
const lines = [
  'Introduction to Biology - Course Syllabus',
  'Instructor: Dr. Rivera',
  '',
  'Weekly schedule',
  'Week 1: Cell structure and function',
  `Week 2 (Sep 14, ${year}): Photosynthesis and respiration`,
  'Week 3: Genetics and heredity',
  'Week 4: Evolution and natural selection',
  '',
  'Assessments',
  `Lab report 1 due Oct 5, ${year}`,
  `Quiz 1 - Oct 12, ${year}`,
  `Midterm Exam - Oct 26, ${year}`,
  `Lab report 2 due Nov 16, ${year}`,
  `Final project due ${year}-12-04`,
  `Final exam - Dec 15, ${year}`,
];
fs.writeFileSync('sample-syllabus.pdf', makePdf(lines));
console.log('Wrote sample-syllabus.pdf');
