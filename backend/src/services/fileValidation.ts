import fs from 'fs/promises';

const imageSignatures: Record<string, (bytes: Buffer) => boolean> = {
  png: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  gif: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)),
  bmp: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d,
  avif: (b) => b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(b.toString('ascii', 8, 32)),
};

/** Check file signatures before storage; DGN and other specialist formats still need vendor-aware validation/scanning. */
export const validatePreviewFilePrefix = (fileName: string, bytes: Buffer): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (extension === 'pdf') return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  const imageCheck = imageSignatures[extension];
  if (imageCheck) return imageCheck(bytes);

  const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const isOle = bytes.length >= 8 && bytes.subarray(0, 8).equals(oleHeader);
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const ascii = bytes.toString('ascii');
  if (extension === 'dwg') return /^AC10\d\d/.test(ascii);
  if (extension === 'dxf') return ascii.startsWith('AutoCAD Binary DXF') || /^\s*0\s*[\r\n]+SECTION\b/i.test(ascii);
  if (extension === 'ifc') return /^\s*ISO-10303-21\s*;/i.test(ascii);
  if (extension === 'rvt' || extension === 'doc') return isOle;
  if (extension === 'docx' || extension === 'xlsx') return isZip;
  return true;
};

export const validateLocalPreviewFile = async (filePath: string, fileName: string): Promise<boolean> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(32);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return validatePreviewFilePrefix(fileName, bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};

export const expectedUploadContentType = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const known: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
    csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf',
  };
  return known[ext] || 'application/octet-stream';
};
