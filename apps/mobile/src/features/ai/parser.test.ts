import { describe, expect, it } from '@jest/globals';

import { parseAiPlan } from './parser';

describe('parseAiPlan', () => {
  it('parses valid YAML inside ```medos-plan block', () => {
    const response = `
Based on the clinical trajectory, the patient is on POD #1 post exploratory laparotomy.
Here is the recommended management plan:

\`\`\`medos-plan
assessment: |
  Post-operative Day 1 status post emergency exploratory laparotomy for ruptured ovarian cyst.
  Hemodynamically stable with expected post-op anemia (Hb 10.2).
note: |
  Patient seen and examined on POD #1. Afebrile. Surgical wound clean and intact.
  No active bleeding noted. Bowel sounds present. Tolerating clear liquids.
medications:
  - drug: Cefazolin
    dose: 1g
    route: IV
    frequency: Q8H
    duration_days: 2
    instructions: Complete 48-hour surgical prophylaxis
  - drug: Acetaminophen
    dose: 1g
    route: IV
    frequency: PRN
    instructions: For pain score > 4
labs:
  - analyte: CBC, diff
    timing: Tomorrow 06:00
  - analyte: Electrolytes (Na, K, BUN, Cr)
    timing: Tomorrow 06:00
consults:
  - specialty: Obstetrics and Gynecology
    reason: Outpatient follow-up for ovarian cyst residue
tasks:
  - text: Check surgical wound dressing at 18:00
    due: 18:00
  - text: Ambulate patient in corridor
    due: Evening
\`\`\`

Let me know if you need any other adjustments.
`;

    const plan = parseAiPlan(response);

    expect(plan.assessment).toContain('Post-operative Day 1');
    expect(plan.note).toContain('Patient seen and examined on POD #1');

    expect(plan.medications).toHaveLength(2);
    expect(plan.medications[0]?.drug).toBe('Cefazolin');
    expect(plan.medications[0]?.dose).toBe('1g');
    expect(plan.medications[0]?.route).toBe('IV');
    expect(plan.medications[0]?.frequency).toBe('Q8H');
    expect(plan.medications[0]?.duration).toBe('2 days');
    expect(plan.medications[0]?.selected).toBe(true);

    expect(plan.labs).toHaveLength(2);
    expect(plan.labs[0]?.analyte).toBe('CBC, diff');
    expect(plan.labs[0]?.timing).toBe('Tomorrow 06:00');

    expect(plan.consults).toHaveLength(1);
    expect(plan.consults[0]?.specialty).toBe('Obstetrics and Gynecology');
    expect(plan.consults[0]?.reason).toContain('Outpatient follow-up');

    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]?.text).toBe('Check surgical wound dressing at 18:00');
    expect(plan.tasks[0]?.due).toBe('18:00');
  });

  it('parses valid JSON response inside codeblock', () => {
    const jsonInput = `
\`\`\`json
{
  "assessment": "Acute appendicitis ruled out",
  "note": "Wound is clean",
  "medications": [
    { "drug": "Metronidazole", "dose": "500mg", "route": "PO", "frequency": "TID" }
  ],
  "labs": [
    { "analyte": "CRP", "timing": "Daily" }
  ],
  "tasks": [
    { "text": "Dressing change", "due": "Morning" }
  ]
}
\`\`\`
`;

    const plan = parseAiPlan(jsonInput);
    expect(plan.assessment).toBe('Acute appendicitis ruled out');
    expect(plan.medications[0]?.drug).toBe('Metronidazole');
    expect(plan.medications[0]?.dose).toBe('500mg');
    expect(plan.labs[0]?.analyte).toBe('CRP');
    expect(plan.tasks[0]?.text).toBe('Dressing change');
  });

  it('converts Persian digits in doses and schedules to Latin digits', () => {
    const persianInput = `
\`\`\`medos-plan
medications:
  - drug: Cefazolin
    dose: ۱g
    frequency: Q۸H
    duration_days: ۲
tasks:
  - text: Check vitals at ۱۸:۰۰
    due: ۱۸:۰۰
\`\`\`
`;

    const plan = parseAiPlan(persianInput);
    expect(plan.medications[0]?.dose).toBe('1g');
    expect(plan.medications[0]?.frequency).toBe('Q8H');
    expect(plan.medications[0]?.duration).toBe('2 days');
    expect(plan.tasks[0]?.text).toBe('Check vitals at 18:00');
    expect(plan.tasks[0]?.due).toBe('18:00');
  });

  it('falls back to markdown headings when no codeblock is provided', () => {
    const markdownInput = `
### Assessment
Acute Bronchitis with mild wheezing.

### Note
Patient is breathing comfortably on room air.

### Medications
- Albuterol Inhaler 2 puffs Q4H PRN
- Prednisone 40mg PO Daily for 5 days

### Labs
- Sputum culture

### Tasks
- Follow up peak flow rate at 20:00
`;

    const plan = parseAiPlan(markdownInput);
    expect(plan.assessment).toContain('Acute Bronchitis');
    expect(plan.note).toContain('Patient is breathing comfortably');
    expect(plan.medications).toHaveLength(2);
    expect(plan.medications[0]?.drug).toContain('Albuterol');
    expect(plan.labs).toHaveLength(1);
    expect(plan.labs[0]?.analyte).toContain('Sputum culture');
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.text).toContain('peak flow rate');
  });
});
