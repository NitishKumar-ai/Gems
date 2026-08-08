export function normalizeAgy(record, index) {
  if (!record || typeof record !== 'object') return null;

  // Normalize Antigravity CLI format
  if (record.type === 'PLANNER_RESPONSE' && record.source === 'MODEL') {
    record.type = 'assistant';
    record.message = {
      model: 'antigravity-agent',
      id: `agy_msg_${index}`,
      content: record.tool_calls ? record.tool_calls.map(tc => ({
        type: 'tool_use',
        id: Math.random().toString(36).substring(7),
        name: tc.name,
        input: tc.args
      })) : []
    };
    record.timestamp = record.created_at;
  } else if (record.type === 'USER_INPUT') {
    record.type = 'user';
    record.message = { content: record.content };
    record.timestamp = record.created_at;
  } else if (record.source === 'MODEL' && record.type !== 'PLANNER_RESPONSE') {
    record.type = 'user'; // Treat tool results as user returns to harness
    record.message = {
      content: [{ type: 'tool_result', tool_use_id: 'unknown' }]
    };
    record.timestamp = record.created_at;
    if (record.status === 'ERROR') {
      record.error = true;
    }
  }

  return record;
}
