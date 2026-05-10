import * as sharp from 'sharp';

/** 알리고 MMS·nginx 한도 회피용 목표 용량(KB) — 업로드 저장분과 발송 바이트를 맞추기 위한 기준 */
export const MMS_IMAGE_TARGET_SIZE_KB = 70;

/**
 * 모바일·MMS용 이미지 정규화: EXIF 기준 회전, 긴 변 기준 리사이즈, JPEG(mozjpeg), 목표 용량 근접.
 * 업로드 시 저장하는 버퍼와 동일 파이프라인을 알리고 발송 전에도 사용해 "보이는 것 = 보내는 것"에 가깝게 맞춤.
 */
export async function compressImageForMms(
  imageBuffer: Buffer,
  targetSizeKB: number = MMS_IMAGE_TARGET_SIZE_KB,
): Promise<Buffer> {
  const targetSizeBytes = targetSizeKB * 1024;

  const encode = (maxEdge: number, quality: number) =>
    sharp(imageBuffer)
      .rotate()
      .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).rotate().metadata();
  } catch (e) {
    throw new Error(
      `이미지를 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const w = metadata.width || 0;
  const h = metadata.height || 0;
  const longEdge = Math.max(w, h);
  const isJpeg = metadata.format === 'jpeg' || metadata.format === 'jpg';

  if (imageBuffer.length <= targetSizeBytes && isJpeg && longEdge > 0 && longEdge <= 800) {
    return imageBuffer;
  }

  let maxEdge = 800;
  let quality = 70;
  let attempts = 0;

  let compressedBuffer: Buffer;
  try {
    compressedBuffer = await encode(maxEdge, quality);
  } catch (e) {
    throw new Error(
      `이미지 변환에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  while (compressedBuffer.length > targetSizeBytes && quality > 20 && attempts < 15) {
    quality -= 5;
    attempts++;
    compressedBuffer = await encode(maxEdge, quality);
  }

  if (compressedBuffer.length > targetSizeBytes && maxEdge > 600) {
    maxEdge = 600;
    quality = Math.max(quality, 30);
    compressedBuffer = await encode(maxEdge, quality);
    while (compressedBuffer.length > targetSizeBytes && quality > 20 && attempts < 28) {
      quality -= 5;
      attempts++;
      compressedBuffer = await encode(maxEdge, quality);
    }
  }

  if (compressedBuffer.length > targetSizeBytes && maxEdge > 400) {
    maxEdge = 400;
    quality = Math.max(quality, 25);
    compressedBuffer = await encode(maxEdge, quality);
    while (compressedBuffer.length > targetSizeBytes && quality > 15 && attempts < 40) {
      quality -= 3;
      attempts++;
      compressedBuffer = await encode(maxEdge, quality);
    }
  }

  if (compressedBuffer.length > targetSizeBytes && maxEdge > 320) {
    maxEdge = 320;
    compressedBuffer = await encode(maxEdge, 18);
  }

  return compressedBuffer;
}
