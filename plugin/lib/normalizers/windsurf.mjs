export function normalizeWindsurf(record, index) {
  if (!record || typeof record !== 'object') return null;

  if (record.source === 'windsurf') {
    if (record.role === 'user') {
      record.type = 'user';
      record.message = { content: record.content };
    } else if (record.role === 'assistant') {
      record.type = 'assistant';
      record.message = {
        model: record.model || 'windsurf-agent',
        id: record.id || `windsurf_msg_${index}`,
        content: [] // Tool usage formatting to be defined by actual log shape
      };
    }
    record.timestamp = record.timestamp || new Date().toISOString();
  }

  return record;
}
