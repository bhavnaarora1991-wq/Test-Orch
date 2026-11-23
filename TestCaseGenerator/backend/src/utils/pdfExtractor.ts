/**
 * Utility to extract text from a PDF buffer safely across pdf-parse v1 and v2
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParseModule = require('pdf-parse');
  // pdf-parse v2 exports an object with PDFParse class
  if (pdfParseModule?.PDFParse) {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      if (result && Array.isArray(result.pages)) {
        return result.pages.map((p: any) => p.text || '').join('\n');
      }
      return (result as any).text || '';
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy().catch(() => {});
      }
    }
  }
  // pdf-parse v1: callable function
  if (typeof pdfParseModule === 'function') {
    const data = await pdfParseModule(buffer);
    return data.text || '';
  }
  if (typeof pdfParseModule?.default === 'function') {
    const data = await pdfParseModule.default(buffer);
    return data.text || '';
  }
  throw new Error('Unsupported pdf-parse module format');
}
