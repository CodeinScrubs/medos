import { describe, expect, it, jest } from '@jest/globals';
import { ClipPath, TSpan } from 'react-native-svg';
import { act, create } from 'react-test-renderer';

import { initialImageDocument } from '@/lib/image-edit';

import { AnnotatedImage } from './annotated-image';

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  ClipPath: 'ClipPath',
  Defs: 'Defs',
  G: 'G',
  Image: 'SvgImage',
  Path: 'Path',
  Polygon: 'Polygon',
  Rect: 'Rect',
  Text: 'SvgText',
  TSpan: 'TSpan',
}));

describe('shared native image scene contract', () => {
  it('sets paragraph wrapping on the actual TSpan and clips photo plus marks to the crop', async () => {
    const doc = initialImageDocument('media/synthetic/grid.jpg', 1000, 1000);
    doc.crop = { x: 250, y: 250, width: 500, height: 500 };
    doc.marks = [
      {
        id: 'mixed',
        kind: 'text',
        color: 'red',
        x: 270,
        y: 300,
        size: 25,
        width: 400,
        text: '  ضایعه ECG 12.5\nدست چپ  ',
      },
    ];
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<AnnotatedImage document={doc} uri="file:///synthetic.jpg" width={400} height={800} />);
    });
    expect(tree.root.findByType(TSpan).props.inlineSize).toBe(400);
    expect(tree.root.findByType(TSpan).props.children).toBe(doc.marks[0]!.kind === 'text' ? doc.marks[0]!.text : '');
    expect(tree.root.findByType(ClipPath).props.children.props).toMatchObject({ width: 500, height: 500 });
    await act(async () => tree.unmount());
  });
});
