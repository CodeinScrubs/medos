import { newId } from '@/lib/ids';
import { toLatinDigits } from '@/lib/persian';

export interface ParsedMedication {
  id: string;
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  duration?: string;
  instructions?: string;
  selected: boolean;
}

export interface ParsedLab {
  id: string;
  analyte: string;
  timing?: string;
  selected: boolean;
}

export interface ParsedConsult {
  id: string;
  specialty: string;
  reason: string;
  selected: boolean;
}

export interface ParsedTask {
  id: string;
  text: string;
  due?: string;
  selected: boolean;
}

export interface ParsedAiPlan {
  assessment: string;
  note: string;
  medications: ParsedMedication[];
  labs: ParsedLab[];
  consults: ParsedConsult[];
  tasks: ParsedTask[];
  rawBlock?: string;
  warnings: string[];
}

/**
 * Extracts code block content from markdown text.
 * Prefers ```medos-plan ... ```, then ```yaml or ```json, then generic ```.
 */
function extractCodeBlock(text: string): { block: string; lang?: string } | null {
  const medosMatch = /```medos-plan\s*([\s\S]*?)```/i.exec(text);
  if (medosMatch?.[1]) return { block: medosMatch[1].trim(), lang: 'medos-plan' };

  const jsonMatch = /```json\s*([\s\S]*?)```/i.exec(text);
  if (jsonMatch?.[1]) return { block: jsonMatch[1].trim(), lang: 'json' };

  const yamlMatch = /```(?:yaml|yml)\s*([\s\S]*?)```/i.exec(text);
  if (yamlMatch?.[1]) return { block: yamlMatch[1].trim(), lang: 'yaml' };

  const genericMatch = /```\s*([\s\S]*?)```/.exec(text);
  if (genericMatch?.[1]) return { block: genericMatch[1].trim() };

  return null;
}

/**
 * Lightweight, fault-tolerant YAML line parser for key-value and list-of-objects.
 */
function parseSimpleYaml(yamlText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlText.split(/\r?\n/);
  let currentKey = '';
  let currentList: Record<string, unknown>[] | null = null;
  let currentItem: Record<string, unknown> | null = null;
  let multilineKey = '';
  let multilineBuffer: string[] = [];

  function commitMultiline() {
    if (multilineKey) {
      result[multilineKey] = multilineBuffer.join('\n').trim();
      multilineKey = '';
      multilineBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Check if continuing multiline block
    if (multilineKey) {
      if (rawLine.startsWith('  ') || rawLine.startsWith('\t')) {
        multilineBuffer.push(rawLine.trim());
        continue;
      } else {
        commitMultiline();
      }
    }

    // Top-level key: e.g. "medications:" or "assessment: |"
    const topKeyMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:(?:\s*([|>])|\s*(.*))?$/.exec(line);
    if (topKeyMatch?.[1] && !line.startsWith(' ') && !line.startsWith('\t')) {
      commitMultiline();
      const key = topKeyMatch[1].toLowerCase();
      const modifier = topKeyMatch[2];
      const val = topKeyMatch[3]?.trim();

      currentKey = key;
      currentList = null;
      currentItem = null;

      if (modifier === '|' || modifier === '>') {
        multilineKey = key;
        multilineBuffer = [];
      } else if (val) {
        // Strip quotes if present
        result[key] = val.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // List item start: e.g. "  - drug: Cefazolin" or "  - text: Something"
    const listItemMatch = /^\s*-\s+(?:([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)|(.*))$/.exec(line);
    if (listItemMatch && currentKey) {
      if (!currentList) {
        currentList = [];
        result[currentKey] = currentList;
      }
      currentItem = {};
      currentList.push(currentItem);

      const propKey = listItemMatch[1];
      const propVal = listItemMatch[2] ?? listItemMatch[3];
      if (propKey) {
        currentItem[propKey.toLowerCase()] = propVal?.trim().replace(/^["']|["']$/g, '') ?? '';
      } else if (propVal) {
        currentItem['name'] = propVal.trim().replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // Property within current list item: e.g. "    dose: 1g"
    const itemPropMatch = /^\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (itemPropMatch?.[1] && currentItem) {
      const propKey = itemPropMatch[1].toLowerCase();
      const propVal = (itemPropMatch[2] ?? '').trim().replace(/^["']|["']$/g, '');
      currentItem[propKey] = propVal;
      continue;
    }
  }

  commitMultiline();
  return result;
}

/**
 * Fallback regex-based extraction from unstructured markdown or clinical notes.
 */
function parseNaturalMarkdown(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Extract Assessment
  const assessMatch = /(?:###?\s*(?:Assessment|ارزیابی|تشخیص|Impression)[\s:]*)([\s\S]*?)(?=###?|\n\n[A-Z]|$)/i.exec(
    text,
  );
  if (assessMatch?.[1]) result['assessment'] = assessMatch[1].trim();

  // Extract Progress Note
  const noteMatch = /(?:###?\s*(?:Note|Progress Note|شرح حال|نوت|SOAP)[\s:]*)([\s\S]*?)(?=###?|\n\n[A-Z]|$)/i.exec(
    text,
  );
  if (noteMatch?.[1]) result['note'] = noteMatch[1].trim();

  // Extract Medications
  const medsMatch = /(?:###?\s*(?:Medications|Drugs|Orders|داروها|کاردکس)[\s:]*)([\s\S]*?)(?=###?|\n\n[A-Z]|$)/i.exec(
    text,
  );
  if (medsMatch?.[1]) {
    const medLines = medsMatch[1].split(/\r?\n/).filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    result['medications'] = medLines.map((l) => {
      const cleaned = l.replace(/^[-*]\s*/, '').trim();
      return { drug: cleaned };
    });
  }

  // Extract Labs
  const labsMatch = /(?:###?\s*(?:Labs|Laboratory|آزمایش‌ها|آزمایشات)[\s:]*)([\s\S]*?)(?=###?|\n\n[A-Z]|$)/i.exec(text);
  if (labsMatch?.[1]) {
    const labLines = labsMatch[1].split(/\r?\n/).filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    result['labs'] = labLines.map((l) => {
      const cleaned = l.replace(/^[-*]\s*/, '').trim();
      return { analyte: cleaned };
    });
  }

  // Extract Tasks
  const tasksMatch = /(?:###?\s*(?:Tasks|Punch List|تسک‌ها|اقدامات|کارها)[\s:]*)([\s\S]*?)(?=###?|\n\n[A-Z]|$)/i.exec(
    text,
  );
  if (tasksMatch?.[1]) {
    const taskLines = tasksMatch[1].split(/\r?\n/).filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    result['tasks'] = taskLines.map((l) => {
      const cleaned = l.replace(/^[-*]\s*(?:\[[ x]\]\s*)?/, '').trim();
      return { text: cleaned };
    });
  }

  return result;
}

/**
 * Parses structured AI clinical plan output from LLMs (GPT-4o, Claude 3.5, Gemini).
 * Handles Persian digits, missing keys, typos, and markdown wrapping.
 */
export function parseAiPlan(rawInput: string): ParsedAiPlan {
  const normalized = toLatinDigits(rawInput.trim());
  const warnings: string[] = [];

  let payload: Record<string, unknown> | null = null;
  let rawBlock: string | undefined;

  const extracted = extractCodeBlock(normalized);
  if (extracted) {
    rawBlock = extracted.block;
    // Attempt JSON parse
    try {
      payload = JSON.parse(extracted.block) as Record<string, unknown>;
    } catch {
      // Attempt YAML parse
      try {
        payload = parseSimpleYaml(extracted.block);
      } catch {
        warnings.push('بلوک ساختاریافته به صورت مستقیم خوانده نشد؛ از استخراج متنی استفاده شد.');
      }
    }
  }

  // If still not parsed, try parsing raw text as JSON or YAML
  if (!payload || Object.keys(payload).length === 0) {
    try {
      payload = JSON.parse(normalized) as Record<string, unknown>;
    } catch {
      payload = parseSimpleYaml(normalized);
    }
  }

  // Fallback to natural markdown headings if no structured keys found
  const hasStructuredKeys =
    payload &&
    ('medications' in payload ||
      'meds' in payload ||
      'drugs' in payload ||
      'orders' in payload ||
      'labs' in payload ||
      'tasks' in payload ||
      'assessment' in payload ||
      'note' in payload);

  if (!hasStructuredKeys) {
    payload = parseNaturalMarkdown(normalized);
    if (Object.keys(payload).length === 0) {
      warnings.push('هیچ بخش ساختاریافته یا دستور بالینی مشخصی یافت نشد.');
    }
  }

  const result: ParsedAiPlan = {
    assessment: typeof payload['assessment'] === 'string' ? payload['assessment'].trim() : '',
    note:
      typeof payload['note'] === 'string'
        ? payload['note'].trim()
        : typeof payload['progress_note'] === 'string'
          ? payload['progress_note'].trim()
          : '',
    medications: [],
    labs: [],
    consults: [],
    tasks: [],
    rawBlock,
    warnings,
  };

  // Normalize Medications
  const rawMeds = (payload['medications'] || payload['meds'] || payload['drugs'] || payload['orders']) as unknown;
  if (Array.isArray(rawMeds)) {
    for (const item of rawMeds) {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const drug = String(obj['drug'] || obj['name'] || obj['medication'] || '').trim();
        if (drug) {
          result.medications.push({
            id: newId(),
            drug,
            dose: String(obj['dose'] || obj['dosage'] || '').trim(),
            route: String(obj['route'] || '')
              .trim()
              .toUpperCase(),
            frequency: String(obj['frequency'] || obj['freq'] || '')
              .trim()
              .toUpperCase(),
            duration: obj['duration']
              ? String(obj['duration']).trim()
              : obj['duration_days']
                ? `${obj['duration_days']} days`
                : undefined,
            instructions: obj['instructions']
              ? String(obj['instructions']).trim()
              : obj['notes']
                ? String(obj['notes']).trim()
                : undefined,
            selected: true,
          });
        }
      } else if (typeof item === 'string' && item.trim()) {
        result.medications.push({
          id: newId(),
          drug: item.trim(),
          dose: '',
          route: '',
          frequency: '',
          selected: true,
        });
      }
    }
  }

  // Normalize Labs
  const rawLabs = (payload['labs'] ||
    payload['laboratory'] ||
    payload['tests'] ||
    payload['investigations']) as unknown;
  if (Array.isArray(rawLabs)) {
    for (const item of rawLabs) {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const analyte = String(obj['analyte'] || obj['name'] || obj['test'] || '').trim();
        if (analyte) {
          result.labs.push({
            id: newId(),
            analyte,
            timing: obj['timing'] ? String(obj['timing']).trim() : obj['time'] ? String(obj['time']).trim() : undefined,
            selected: true,
          });
        }
      } else if (typeof item === 'string' && item.trim()) {
        result.labs.push({
          id: newId(),
          analyte: item.trim(),
          selected: true,
        });
      }
    }
  }

  // Normalize Consults
  const rawConsults = (payload['consults'] || payload['consultations'] || payload['referrals']) as unknown;
  if (Array.isArray(rawConsults)) {
    for (const item of rawConsults) {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const specialty = String(obj['specialty'] || obj['service'] || 'مشاوره').trim();
        const reason = String(obj['reason'] || obj['question'] || obj['indication'] || '').trim();
        if (reason || specialty) {
          result.consults.push({
            id: newId(),
            specialty,
            reason: reason || specialty,
            selected: true,
          });
        }
      } else if (typeof item === 'string' && item.trim()) {
        result.consults.push({
          id: newId(),
          specialty: 'مشاوره',
          reason: item.trim(),
          selected: true,
        });
      }
    }
  }

  // Normalize Tasks
  const rawTasks = (payload['tasks'] || payload['punch_list'] || payload['punchlist'] || payload['todos']) as unknown;
  if (Array.isArray(rawTasks)) {
    for (const item of rawTasks) {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const text = String(obj['text'] || obj['title'] || obj['task'] || '').trim();
        if (text) {
          result.tasks.push({
            id: newId(),
            text,
            due: obj['due'] ? String(obj['due']).trim() : obj['due_at'] ? String(obj['due_at']).trim() : undefined,
            selected: true,
          });
        }
      } else if (typeof item === 'string' && item.trim()) {
        result.tasks.push({
          id: newId(),
          text: item.trim(),
          selected: true,
        });
      }
    }
  }

  return result;
}
