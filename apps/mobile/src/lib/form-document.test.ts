import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { formBasis, formCodec, formScope, UnsupportedFormDraft } from './form-document';

const fields = z
  .object({ title: z.string(), body: z.string(), tags: z.array(z.string()), flagged: z.boolean() })
  .strict();
const codec = formCodec('idea', fields);
const raw = { title: '  عنوان ', body: ' \nfirst\n\nsecond\n ', tags: ['الف', 'ب'], flagged: false };
const document = () => codec.create({ recordId: null, basis: null, fields: raw });

describe('versioned workspace form documents', () => {
  it('retains exact partial text, whitespace and ordered arrays independently of publication', () => {
    const value = document();
    expect(codec.decode(codec.encode(value))).toEqual(value);
    expect(codec.decode(codec.encode(value)).fields).toEqual(raw);
    const partial = codec.create({ recordId: null, basis: null, fields: { ...raw, title: '' } });
    expect(codec.decode(codec.encode(partial)).fields.title).toBe('');
  });

  it('keeps original null context apart from literal imported sentinel-like IDs', () => {
    expect(formScope(null)).not.toBe(formScope('new'));
    expect(formScope('a', 'b')).not.toBe(formScope('b', 'a'));
    expect(formScope('a:b', 'c')).not.toBe(formScope('b', 'c:a'));
    expect(document()).toMatchObject({ parentId: null, recordId: null, scope: '[null,null]', basis: null });
  });

  it('defaults an omitted or explicitly undefined creation parent without weakening decoding', () => {
    expect(codec.create({ parentId: undefined, recordId: null, basis: null, fields: raw })).toEqual(document());
  });

  it('canonicalizes object keys and exact timestamp milliseconds without changing content', () => {
    const at = new Date('2026-01-01T10:00:00.123Z');
    expect(formBasis({ body: raw.body, at })).toBe(formBasis({ at: at.getTime(), body: raw.body }));
    expect(formBasis({ at })).not.toBe(formBasis({ at: new Date(at.getTime() + 1) }));
    expect(formBasis({ tags: ['a', 'b'] })).not.toBe(formBasis({ tags: ['b', 'a'] }));
    expect(formBasis({ body: ' x ' })).not.toBe(formBasis({ body: 'x' }));
  });

  it('allows only an explicit existing-record basis', () => {
    const basis = formBasis({ id: 'record', title: 'Older title' });
    const value = codec.create({ recordId: 'record', basis, fields: raw });
    expect(codec.decode(codec.encode(value)).basis).toBe(basis);
    expect(() => codec.create({ recordId: 'record', basis: null, fields: raw })).toThrow(UnsupportedFormDraft);
    expect(() => codec.create({ recordId: null, basis, fields: raw })).toThrow(UnsupportedFormDraft);
  });

  it.each([
    ['future version', { version: 2 }],
    ['foreign kind', { kind: 'topic' }],
    ['foreign scope', { scope: '[null,"another"]' }],
    ['missing owner context', { parentId: undefined }],
    ['invented metadata', { ignoredField: 'must not disappear' }],
    ['extra field', { fields: { ...raw, unknown: 'must not disappear' } }],
    ['wrong raw type', { fields: { ...raw, title: 4 } }],
    ['empty record identifier', { recordId: '' }],
  ])('refuses %s instead of silently stripping or rebasing it', (_label, patch) => {
    expect(() => codec.decode(JSON.stringify({ ...document(), ...patch }))).toThrow(UnsupportedFormDraft);
  });

  it('does not put malformed raw content into its failure message', () => {
    const privateMarker = 'synthetic-private-draft-marker';
    try {
      codec.decode(`{${privateMarker}`);
      throw new Error('Expected decoder refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedFormDraft);
      expect((error as Error).message).not.toContain(privateMarker);
    }
  });

  it.each([undefined, NaN, Infinity, new Date(NaN), () => {}, BigInt(1)])(
    'refuses non-JSON or invalid basis values instead of replacing them with null',
    (value) => expect(() => formBasis({ value })).toThrow(UnsupportedFormDraft),
  );
});
