/**
 * Export Excel (.xlsx) côté navigateur. exceljs est chargé à la demande
 * (remplace `xlsx@0.18`, abandonné sur npm et vulnérable).
 *
 * @param {Record<string, unknown>[]} rows   lignes à plat ; les clés de la 1re ligne deviennent les en-têtes
 * @param {string} sheetName
 * @param {string} filename                 nom du fichier téléchargé (avec .xlsx)
 */
export async function exportRowsToXlsx(rows, sheetName, filename) {
	const { default: ExcelJS } = await import('exceljs');
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

	const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	sheet.columns = headers.map((key) => ({
		header: key,
		key,
		width: Math.min(
			60,
			Math.max(10, key.length + 2, ...rows.map((r) => String(r[key] ?? '').length + 2))
		)
	}));
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	sheet.addRows(rows);

	const buffer = await workbook.xlsx.writeBuffer();
	const blob = new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
	const url = URL.createObjectURL(blob);
	const a = Object.assign(document.createElement('a'), { href: url, download: filename });
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
