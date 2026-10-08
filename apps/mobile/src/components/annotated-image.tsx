import { memo, useId, type Ref } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Image as SvgImage,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';

import { imageMatrix, imageDisplaySize, type ImageDocument, type ImageMark } from '@/lib/image-edit';
import { fonts, imageInk } from '@/theme';

function pathFor(mark: Extract<ImageMark, { kind: 'pen' | 'highlight' }>) {
  return mark.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}
const Mark = memo(function Mark({ mark }: { mark: ImageMark }) {
  const ink = imageInk[mark.color];
  if (mark.kind === 'text')
    return (
      <SvgText x={mark.x} y={mark.y + mark.size} fontSize={mark.size} fontFamily={fonts.regular} fill={ink}>
        <TSpan inlineSize={mark.width}>{mark.text}</TSpan>
      </SvgText>
    );
  if (mark.kind === 'arrow') {
    const { start: a, end: b } = mark;
    const angle = Math.atan2(b.y - a.y, b.x - a.x),
      head = mark.width * 4;
    const left = { x: b.x - head * Math.cos(angle - Math.PI / 6), y: b.y - head * Math.sin(angle - Math.PI / 6) };
    const right = { x: b.x - head * Math.cos(angle + Math.PI / 6), y: b.y - head * Math.sin(angle + Math.PI / 6) };
    return (
      <G>
        <Path d={`M${a.x},${a.y} L${b.x},${b.y}`} stroke={ink} strokeWidth={mark.width} strokeLinecap="round" />
        <Polygon points={`${b.x},${b.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={ink} />
      </G>
    );
  }
  const opacity = mark.kind === 'highlight' ? 0.32 : 1;
  if (mark.points.length === 1)
    return <Circle cx={mark.points[0]!.x} cy={mark.points[0]!.y} r={mark.width / 2} fill={ink} opacity={opacity} />;
  return (
    <Path
      d={pathFor(mark)}
      fill="none"
      stroke={ink}
      strokeWidth={mark.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
});

/** The viewer, editor and PNG export use this exact scene, including crop/rotation. */
export const AnnotatedImage = memo(function AnnotatedImage({
  document,
  uri,
  width,
  height,
  svgRef,
  onLoad,
  preview,
}: {
  document: ImageDocument;
  uri: string;
  width: number;
  height: number;
  svgRef?: Ref<Svg>;
  onLoad?: () => void;
  preview?: ImageMark | null;
}) {
  const size = imageDisplaySize(document);
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '_');
  return (
    <Svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={size.width} height={size.height} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <G transform={imageMatrix(document)}>
          <SvgImage href={{ uri }} x={0} y={0} width={document.width} height={document.height} onLoad={onLoad} />
          {document.marks.map((mark) => (
            <Mark key={mark.id} mark={mark} />
          ))}
          {preview ? <Mark mark={preview} /> : null}
        </G>
      </G>
    </Svg>
  );
});
