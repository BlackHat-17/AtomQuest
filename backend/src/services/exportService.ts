import ExcelJS from 'exceljs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AchievementReportRow {
  employee: string;
  department: string;
  title: string;
  thrustArea: string;
  uomType: string;
  target: string;
  weightage: number | string;
  achievements: {
    Q1?: string;
    Q2?: string;
    Q3?: string;
    Q4?: string;
    Q4Score?: string;
  };
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  'Employee',
  'Department',
  'Goal Title',
  'Thrust Area',
  'UoM Type',
  'Target',
  'Weightage (%)',
  'Q1 Actual',
  'Q2 Actual',
  'Q3 Actual',
  'Q4 Actual',
  'Q4 Score (%)',
] as const;

// ─── generateAchievementExcel ─────────────────────────────────────────────────

/**
 * Produces an Excel workbook buffer from achievement report data.
 * Columns: Employee, Department, Goal Title, Thrust Area, UoM Type, Target,
 *          Weightage (%), Q1 Actual, Q2 Actual, Q3 Actual, Q4 Actual, Q4 Score (%)
 */
export async function generateAchievementExcel(
  data: AchievementReportRow[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Goal Tracking Portal';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Achievement Report');

  // Define columns with widths
  sheet.columns = [
    { header: 'Employee', key: 'employee', width: 25 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Goal Title', key: 'title', width: 35 },
    { header: 'Thrust Area', key: 'thrustArea', width: 20 },
    { header: 'UoM Type', key: 'uomType', width: 15 },
    { header: 'Target', key: 'target', width: 15 },
    { header: 'Weightage (%)', key: 'weightage', width: 15 },
    { header: 'Q1 Actual', key: 'q1', width: 12 },
    { header: 'Q2 Actual', key: 'q2', width: 12 },
    { header: 'Q3 Actual', key: 'q3', width: 12 },
    { header: 'Q4 Actual', key: 'q4', width: 12 },
    { header: 'Q4 Score (%)', key: 'score', width: 14 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2EFDA' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Add data rows
  for (const row of data) {
    sheet.addRow({
      employee: row.employee,
      department: row.department,
      title: row.title,
      thrustArea: row.thrustArea,
      uomType: row.uomType,
      target: row.target,
      weightage: row.weightage,
      q1: row.achievements.Q1 ?? '-',
      q2: row.achievements.Q2 ?? '-',
      q3: row.achievements.Q3 ?? '-',
      q4: row.achievements.Q4 ?? '-',
      score: row.achievements.Q4Score ?? '-',
    });
  }

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── generateAchievementCsv ───────────────────────────────────────────────────

/**
 * Produces a CSV string from achievement report data.
 * Same columns as the Excel export.
 */
export function generateAchievementCsv(data: AchievementReportRow[]): string {
  const escape = (value: string | number): string => {
    const str = String(value);
    // Wrap in quotes if the value contains commas, quotes, or newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = COLUMNS.map(escape).join(',');

  const rows = data.map((row) =>
    [
      row.employee,
      row.department,
      row.title,
      row.thrustArea,
      row.uomType,
      row.target,
      row.weightage,
      row.achievements.Q1 ?? '-',
      row.achievements.Q2 ?? '-',
      row.achievements.Q3 ?? '-',
      row.achievements.Q4 ?? '-',
      row.achievements.Q4Score ?? '-',
    ]
      .map(escape)
      .join(',')
  );

  return [header, ...rows].join('\r\n');
}
