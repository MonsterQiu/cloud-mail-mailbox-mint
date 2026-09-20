function cell(value) {
  let text = String(value ?? '');
  // Spreadsheet formula protection. JSON export preserves byte-for-byte credentials.
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCsv(records) {
  const columns = ['email', 'password', 'loginUrl', 'createdAt', 'status'];
  return '\uFEFF' + [columns.map(cell).join(','), ...records.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
}
export function credentialText(record) {
  return `邮箱：${record.email}\n密码：${record.password ?? '未保存'}\n登录：${record.loginUrl}/`;
}
