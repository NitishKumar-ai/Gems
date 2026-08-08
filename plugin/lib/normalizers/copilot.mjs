export function normalizeCopilot(record, index) {
  if (!record || typeof record !== 'object') return null;

  if (record.source === 'copilot') {
    if (record.role === 'user') {
      record.type = 'user';
      record.message = { content: record.content };
    } else if (record.role === 'assistant') {
      record.type = 'assistant';
      record.message = {
        model: record.model || 'copilot-agent',
        id: record.id || `copilot_msg_${index}`,
        content: [] 
      };
    }
    record.timestamp = record.timestamp || new Date().toISOString();
  }

  return record;
}
