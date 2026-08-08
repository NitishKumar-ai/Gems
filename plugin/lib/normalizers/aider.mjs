export function normalizeAider(record, index) {
  if (!record || typeof record !== 'object') return null;

  // Best effort stub: if aider logs are jsonl, map basic fields
  if (record.role === 'user') {
    record.type = 'user';
    record.message = { content: record.content };
    record.timestamp = record.timestamp || new Date().toISOString();
  } else if (record.role === 'assistant' || record.role === 'model') {
    record.type = 'assistant';
    record.message = {
      model: record.model || 'aider-agent',
      id: record.id || `aider_msg_${index}`,
      content: [] // Populate tool calls if Aider provides them
    };
    record.timestamp = record.timestamp || new Date().toISOString();
  }

  return record;
}
