import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();
export function directionalRuns(text, direction = 'ltr') {
  // Keep dates, IDs and embedded English phrases together as LTR isolates.
  text = text.replace(/[A-Za-z0-9][\x20-\x7e]*/g, (value) => `\u2066${value}\u2069`);
  const { levels } = bidi.getEmbeddingLevels(text, direction),
    runs = [];
  for (let start = 0; start < text.length;) {
    let end = start + 1;
    while (end < text.length && levels[end] === levels[start]) end++;
    runs.push({
      text: text.slice(start, end).replace(/[\u2066\u2069]/g, ''),
      level: levels[start],
      direction: levels[start] % 2 ? 'rtl' : 'ltr',
    });
    start = end;
  }
  const odd = runs.filter((r) => r.level % 2).map((r) => r.level);
  if (odd.length)
    for (let level = Math.max(...runs.map((r) => r.level)); level >= Math.min(...odd); level--) {
      for (let start = 0; start < runs.length;) {
        if (runs[start].level < level) {
          start++;
          continue;
        }
        let end = start + 1;
        while (end < runs.length && runs[end].level >= level) end++;
        runs.splice(start, end - start, ...runs.slice(start, end).reverse());
        start = end;
      }
    }
  return runs.filter((run) => run.text);
}

function writeParagraph(doc, text, direction) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lineHeight = doc.currentLineHeight(true),
    lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.match(/\S+\s*/gu) || ['']) {
      if (line && doc.widthOfString(line + word) > width) {
        lines.push(line.trimEnd());
        line = '';
      }
      for (const character of Array.from(word)) {
        if (line && doc.widthOfString(line + character) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  for (const line of lines) {
    if (doc.y + lineHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const runs = directionalRuns(line, direction),
      sizes = runs.map((run) => doc.widthOfString(run.text));
    let x =
      doc.page.margins.left +
      (direction === 'rtl' ? width - sizes.reduce((sum, size) => sum + size, 0) : 0);
    const y = doc.y;
    for (let index = 0; index < runs.length; index++) {
      doc.text(runs[index].text, x, y, { lineBreak: false, features: ['rtla'] });
      x += sizes[index];
    }
    doc.x = doc.page.margins.left;
    doc.y = y + lineHeight;
  }
}

export const REPORT_FONT_PATH = fileURLToPath(
  new URL('../../../assets/NotoSansArabic.ttf', import.meta.url),
);
export function exportReport(report, businessName, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'NUVIA feedback report' } });
  doc.registerFont('Report', REPORT_FONT_PATH);
  res
    .set('Content-Type', 'application/pdf')
    .set('Content-Disposition', `attachment; filename="nuvia-report-${report._id}.pdf"`);
  doc.pipe(res);
  const ar = report.locale === 'ar';
  const write = (text, size = 11) => {
    doc.font('Report').fontSize(size);
    writeParagraph(doc, text, ar ? 'rtl' : 'ltr');
    doc.moveDown(0.5);
  };
  write(ar ? 'تقرير آراء العملاء' : 'Customer feedback report', 20);
  write(businessName, 14);
  const statusLabels = {
    queued: ar ? 'قيد الانتظار' : 'Queued',
    running: ar ? 'جار التحليل' : 'Processing',
    waiting_for_model: ar ? 'في انتظار نموذج التحليل' : 'Waiting for an analysis model',
    succeeded: ar ? 'جاهز' : 'Ready',
    failed: ar ? 'تعذر التحليل' : 'Analysis failed',
    insufficient_evidence: ar ? 'لا توجد ردود كافية' : 'Not enough feedback',
  };
  write(`${ar ? 'الحالة' : 'Status'}: ${statusLabels[report.status] || report.status}`);
  write(`${ar ? 'الردود' : 'Responses'}: ${report.metrics.totalResponses}`);
  write(`${ar ? 'الردود المحللة' : 'Analyzed responses'}: ${report.metrics.analyzedResponses}`);
  if (report.snapshot)
    write(
      `${ar ? 'الأدلة في هذا التقرير' : 'Evidence included'}: ${report.snapshot.evidenceCount}/${report.snapshot.totalTextResponses}`,
    );
  write(`${ar ? 'تاريخ التقرير' : 'Created'}: ${report.createdAt.toISOString()}`);
  if (!report.content)
    write(
      ar
        ? 'التقرير التحليلي في انتظار نموذج متوافق. البيانات أدناه ردود محفوظة وليست نتائج مولدة.'
        : 'The insight report is waiting for a compatible model. Evidence below contains saved responses.',
    );
  if (report.content) {
    write(report.content.title, 16);
    write(report.content.summary);
    for (const section of report.content.sections) {
      write(section.title, 14);
      write(section.text);
      write(section.evidenceIds.join(', '), 8);
    }
  }
  write(ar ? 'الأدلة المحفوظة' : 'Saved evidence', 16);
  for (const evidence of report.evidence) {
    write(evidence.id, 8);
    write(evidence.text);
  }
  doc.end();
}
