import { Image } from 'expo-image';
import { View } from 'react-native';

import { AnnotatedImage } from '@/components/annotated-image';
import { Text } from '@/components/ui';
import type { Attachment } from '@/db/schema';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { attachmentImageDocument } from './image-edit-queries';

/** Small source bitmap + vector marks; never decode every original in a gallery. */
export function ImageThumbnail({
  attachment,
  width,
  height,
  radius,
}: {
  attachment: Attachment;
  width: number;
  height: number;
  radius: number;
}) {
  const { colors } = useTheme();
  const uri = mediaUri(attachment.thumbnailPath ?? attachment.relativePath);
  let document = null,
    invalid = false;
  if (attachment.imageEditBody) {
    try {
      document = attachmentImageDocument(attachment);
    } catch {
      invalid = true;
    }
  }
  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      {document && uri ? (
        <AnnotatedImage document={document} uri={uri} width={width} height={height} />
      ) : (
        <Image
          source={{ uri: uri ?? undefined }}
          style={{ width, height }}
          contentFit="cover"
          recyclingKey={attachment.id}
        />
      )}
      {invalid ? (
        <Text variant="tiny" color="danger">
          ویرایش خوانده نشد
        </Text>
      ) : null}
    </View>
  );
}
