import { Capacitor, registerPlugin } from '@capacitor/core';

export type ReportExportSection = {
  title: string;
  rows: Array<{ label: string; value: string | number }>;
};

type NativeFileExporter = {
  saveFile(options: { fileName: string; mimeType: string; base64: string }): Promise<{ uri: string; fileName: string }>;
  savePdf(options: { fileName: string; title: string; subtitle: string; sections: ReportExportSection[] }): Promise<{ uri: string; fileName: string }>;
};

const FileExporter = registerPlugin<NativeFileExporter>('FileExporter');

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not prepare the report file.'));
    reader.readAsDataURL(blob);
  });
}

async function saveBlob(fileName: string, mimeType: string, blob: Blob): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    await FileExporter.saveFile({ fileName, mimeType, base64: await blobToBase64(blob) });
    return 'Saved to Downloads/Hupera/' + fileName;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'Download started: ' + fileName;
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

export async function exportReportCsv(fileName: string, sections: ReportExportSection[]): Promise<string> {
  const records: Array<Array<string | number>> = [['Section', 'Metric', 'Value']];
  for (const section of sections) {
    for (const row of section.rows) records.push([section.title, row.label, row.value]);
  }
  const csv = '\uFEFF' + records.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  return saveBlob(fileName, 'text/csv;charset=utf-8', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export async function exportReportPng(fileName: string, title: string, subtitle: string, sections: ReportExportSection[]): Promise<string> {
  const height = 190 + sections.reduce((sum, section) => sum + 76 + Math.max(1, section.rows.length) * 54, 0);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PNG export is not supported on this device.');
  ctx.fillStyle = '#f3f6f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#10251f';
  ctx.fillRect(0, 0, canvas.width, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px Arial, sans-serif';
  ctx.fillText(title, 72, 72);
  ctx.font = '400 23px Arial, sans-serif';
  ctx.fillStyle = '#c7ddd5';
  ctx.fillText(subtitle, 74, 116);
  let y = 190;
  for (const section of sections) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(56, y, 1488, 68 + Math.max(1, section.rows.length) * 54);
    ctx.fillStyle = '#e7f3ee';
    ctx.fillRect(56, y, 1488, 68);
    ctx.fillStyle = '#124b39';
    ctx.font = '700 27px Arial, sans-serif';
    ctx.fillText(section.title, 88, y + 43, 1400);
    y += 68;
    const numeric = section.rows.map(row => Number(String(row.value).replace(/[^0-9.-]/g, '')) || 0);
    const max = Math.max(1, ...numeric);
    for (let i = 0; i < section.rows.length; i++) {
      const row = section.rows[i];
      if (i % 2 === 1) {
        ctx.fillStyle = '#f8faf9';
        ctx.fillRect(56, y, 1488, 54);
      }
      ctx.fillStyle = '#263b35';
      ctx.font = '400 22px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(row.label), 88, y + 35, 720);
      const value = String(row.value);
      ctx.textAlign = 'right';
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillStyle = '#163f32';
      ctx.fillText(value, 1498, y + 35, 310);
      ctx.textAlign = 'left';
      const amount = numeric[i];
      if (amount > 0) {
        ctx.fillStyle = '#e4ece8';
        ctx.fillRect(850, y + 19, 390, 14);
        ctx.fillStyle = '#16a36f';
        ctx.fillRect(850, y + 19, Math.max(3, 390 * amount / max), 14);
      }
      y += 54;
    }
    y += 24;
  }
  const dataUrl = canvas.toDataURL('image/png');
  const binary = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return saveBlob(fileName, 'image/png', new Blob([bytes], { type: 'image/png' }));
}

export async function exportReportPdf(fileName: string, title: string, subtitle: string, sections: ReportExportSection[]): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    await FileExporter.savePdf({ fileName, title, subtitle, sections });
    return 'Saved to Downloads/Hupera/' + fileName;
  }
  const content = sections.map(section =>
    '<section><h2>' + escapeHtml(section.title) + '</h2><table><tbody>' +
    section.rows.map(row => '<tr><td>' + escapeHtml(row.label) + '</td><td>' + escapeHtml(row.value) + '</td></tr>').join('') +
    '</tbody></table></section>'
  ).join('');
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Allow pop-ups for this site, then try PDF export again.');
  printWindow.document.open();
  printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><style>body{font:14px Arial,sans-serif;color:#1d3029;margin:32px}h1{font-size:24px;margin-bottom:6px}p{color:#60736b;margin-top:0}section{break-inside:avoid;margin:24px 0}h2{font-size:17px;background:#e7f3ee;padding:10px}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #e4e9e6}td:last-child{text-align:right;font-weight:700}@media print{body{margin:14mm}}</style></head><body><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle) + '</p>' + content + '</body></html>');
  printWindow.document.close();
  let printed = false;
  const print = () => {
    if (printed || printWindow.closed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };
  printWindow.addEventListener('load', print, { once: true });
  window.setTimeout(print, 500);
  return 'Print dialog opened. Choose “Save as PDF”.';
}
