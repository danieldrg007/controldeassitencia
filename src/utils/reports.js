// Generación de reportes de pase de lista (PDF y Excel).
// jsPDF y xlsx se cargan bajo demanda (import dinámico) para no engordar el
// bundle de la página: solo se descargan al pulsar "PDF" o "Excel".

const ESTADO_LABEL = { present: 'Presente', late: 'Tarde', absent: 'Ausente' };

const fmtFecha = (yyyymmdd) =>
  new Date(yyyymmdd + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// rows: [{ n, alumno, estado ('present'|'late'|'absent'|''), registradaPor }]
const buildRows = (students, statuses) =>
  students.map((s, i) => ({
    n: i + 1,
    alumno: `${s.lastName} ${s.name}`,
    estado: ESTADO_LABEL[statuses[s.id]] || 'Sin registrar',
    raw: statuses[s.id] || '',
  }));

const resumen = (students, statuses) => {
  const c = { present: 0, late: 0, absent: 0, none: 0 };
  students.forEach(s => { const st = statuses[s.id]; if (st) c[st] += 1; else c.none += 1; });
  return c;
};

export async function attendancePDF({ students, statuses, classLabel, date, teacherName }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const rows = buildRows(students, statuses);
  const c = resumen(students, statuses);

  // Encabezado institucional (vino #9B243E)
  doc.setFillColor(155, 36, 62);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Colegio Oliverio Cromwell', 14, 11);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte de pase de lista', 14, 19);

  doc.setTextColor(60, 40, 45);
  doc.setFontSize(11);
  doc.text(`Grupo: ${classLabel}`, 14, 36);
  doc.text(`Fecha: ${fmtFecha(date)}`, 14, 43);
  if (teacherName) doc.text(`Profesor(a): ${teacherName}`, 14, 50);
  doc.text(`Presentes: ${c.present}   Tarde: ${c.late}   Ausentes: ${c.absent}   Sin registrar: ${c.none}`, 14, 57);

  autoTable(doc, {
    startY: 63,
    head: [['#', 'Alumno', 'Estado']],
    body: rows.map(r => [r.n, r.alumno, r.estado]),
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [155, 36, 62], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 250, 236] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const raw = rows[data.row.index]?.raw;
        if (raw === 'present') data.cell.styles.textColor = [22, 163, 74];
        else if (raw === 'late') data.cell.styles.textColor = [217, 119, 6];
        else if (raw === 'absent') data.cell.styles.textColor = [220, 38, 38];
        else data.cell.styles.textColor = [140, 106, 112];
      }
    },
  });

  const ts = new Date().toLocaleString('es-MX');
  doc.setFontSize(8);
  doc.setTextColor(140, 106, 112);
  doc.text(`Generado el ${ts}`, 14, doc.internal.pageSize.height - 8);

  doc.save(`pase-lista_${date}_${classLabel.replace(/[^a-zA-Z0-9°]+/g, '-')}.pdf`);
}

export async function attendanceExcel({ students, statuses, classLabel, date, teacherName }) {
  const XLSX = await import('xlsx');
  const rows = buildRows(students, statuses);
  const c = resumen(students, statuses);

  const data = [
    ['Colegio Oliverio Cromwell — Reporte de pase de lista'],
    [`Grupo: ${classLabel}`],
    [`Fecha: ${fmtFecha(date)}`],
    teacherName ? [`Profesor(a): ${teacherName}`] : [],
    [`Presentes: ${c.present}`, `Tarde: ${c.late}`, `Ausentes: ${c.absent}`, `Sin registrar: ${c.none}`],
    [],
    ['#', 'Alumno', 'Estado'],
    ...rows.map(r => [r.n, r.alumno, r.estado]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pase de lista');
  XLSX.writeFile(wb, `pase-lista_${date}_${classLabel.replace(/[^a-zA-Z0-9°]+/g, '-')}.xlsx`);
}

// Reporte mensual: attendanceByDate = { 'YYYY-MM-DD': { studentId: status } }
export async function attendanceMonthExcel({ students, attendanceByDate, classLabel, monthLabel }) {
  const XLSX = await import('xlsx');
  const dates = Object.keys(attendanceByDate).sort();
  const header = ['Alumno', ...dates.map(d => d.slice(8)), 'Presentes', 'Tardes', 'Ausencias'];
  const short = { present: 'P', late: 'T', absent: 'A' };

  const body = students.map(s => {
    let p = 0, t = 0, a = 0;
    const cells = dates.map(d => {
      const st = attendanceByDate[d]?.[s.id];
      if (st === 'present') p++; else if (st === 'late') t++; else if (st === 'absent') a++;
      return short[st] || '';
    });
    return [`${s.lastName} ${s.name}`, ...cells, p, t, a];
  });

  const data = [
    [`Colegio Oliverio Cromwell — Asistencia mensual (${monthLabel})`],
    [`Grupo: ${classLabel}`, '', 'P = presente, T = tarde, A = ausente'],
    [],
    header,
    ...body,
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 36 }, ...dates.map(() => ({ wch: 4 })), { wch: 10 }, { wch: 8 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  XLSX.writeFile(wb, `asistencia-mensual_${monthLabel}_${classLabel.replace(/[^a-zA-Z0-9°]+/g, '-')}.xlsx`);
}
