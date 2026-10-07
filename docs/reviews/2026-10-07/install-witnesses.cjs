/* Review-only helper. It never installs a production feature or changes app data. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const source = path.join(root, 'apps/mobile/src/features');
const required = [
  'ai/ai-consult-modal.tsx',
  'ai/plan-staging-modal.tsx',
  'consults/consult-share-modal.tsx',
  'diagnoses/suggestions.ts',
];
for (const relative of required) {
  if (!fs.existsSync(path.join(source, relative))) {
    throw new Error(`Missing proposed PR feature: ${relative}. Use an isolated integration checkout.`);
  }
}
const roundFile = path.join(source, 'shifts/round-screen.test.tsx');
const diagnosisFile = path.join(source, 'diagnoses/diagnoses-section.test.tsx');
const round = fs.readFileSync(roundFile, 'utf8');
const diagnosis = fs.readFileSync(diagnosisFile, 'utf8');
if (!fs.readFileSync(path.join(source, 'shifts/round-screen.tsx'), 'utf8').includes('patientLabValuesQuery')) {
  throw new Error('PR 3 round read model is absent. Integrate the proposed features first.');
}
const aiFile = path.join(source, 'ai/review-witness.test.tsx');
const referralFile = path.join(source, 'consults/share-review-witness.test.tsx');
if (
  fs.existsSync(aiFile) ||
  fs.existsSync(referralFile) ||
  round.includes('PR3 review witnesses') ||
  diagnosis.includes('PR5 review witnesses')
) {
  throw new Error('Review witnesses are already present. Refusing to overwrite or append duplicates.');
}
const fixture = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
function addNamedImport(text, module, names) {
  const escaped = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escaped}['"];`, 'm');
  const existing = pattern.exec(text);
  const members = existing
    ? existing[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  for (const name of names) if (!members.includes(name)) members.push(name);
  const statement = `import { ${members.join(', ')} } from '${module}';`;
  return existing ? text.replace(pattern, statement) : `${statement}\n${text}`;
}
let roundWithImports = round;
for (const [module, members] of [
  ['@/components/ui', ['Card']],
  ['@/features/kardex/labels', ['ORDER_STATUS_LABELS']],
  ['@/features/kardex/queries', ['createOrder', 'setOrderStatus']],
  ['@/features/labs/queries', ['createLabPanel']],
])
  roundWithImports = addNamedImport(roundWithImports, module, members);
let diagnosisWithImports = addNamedImport(diagnosis, './suggestions', ['matchImpressions']);
diagnosisWithImports = addNamedImport(diagnosisWithImports, '@/components/ui', ['Text']);
diagnosisWithImports = addNamedImport(diagnosisWithImports, 'react-native', ['Pressable']);
const writes = [
  [aiFile, fixture('ai.test.tsx.fixture')],
  [referralFile, fixture('referral.test.tsx.fixture')],
  [roundFile, `${roundWithImports}\n${fixture('round.cases.tsx.fixture')}`],
  [diagnosisFile, `${diagnosisWithImports}\n${fixture('diagnosis.cases.tsx.fixture')}`],
];
for (const [file, text] of writes) fs.writeFileSync(file, text, 'utf8');
process.stdout.write('Installed four synthetic PR review suites. Run the selected command in README.md.\n');
