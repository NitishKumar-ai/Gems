export function normalizeClaudeCode(record, index) {
  // Claude Code logs are already mostly native to Gems
  // But we ensure required fields exist
  if (!record || typeof record !== 'object') return null;
  return record;
}
