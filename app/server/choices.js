// Optional suggestions only. Reject the entire offer rather than inventing or
// repairing model output (especially its recommendation).
export function validateChoices(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return undefined;
  const labels = new Set();
  const choices = [];
  for (const option of value) {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return undefined;
    const { label, detail, recommended } = option;
    if (typeof label !== 'string' || !label.trim() || label.length > 120
      || label.trim().split(/\s+/u).length > 8 || /[\r\n\x00-\x1f]/u.test(label)
      || typeof recommended !== 'boolean') return undefined;
    if (detail !== undefined && (typeof detail !== 'string' || !detail.trim()
      || detail.length > 240 || detail.trim().split(/\s+/u).length > 20
      || /[\r\n\x00-\x1f]/u.test(detail))) return undefined;
    const normalized = label.trim();
    if (labels.has(normalized)) return undefined;
    labels.add(normalized);
    choices.push({ label: normalized, ...(detail === undefined ? {} : { detail: detail.trim() }), recommended });
  }
  return choices.filter(option => option.recommended).length === 1 ? choices : undefined;
}

export const OFFER_CHOICES_TOOL = {
  name: 'offer_choices',
  description: 'Optionally offer answers to the one question in this reply. Suggestions only, never map changes or approval.',
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      choices: {
        type: 'array', minItems: 1, maxItems: 4,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 120, description: 'Plain sentence case, at most 8 words.' },
            detail: { type: 'string', minLength: 1, maxLength: 240, description: 'Optional short sentence, at most 20 words.' },
            recommended: { type: 'boolean', description: 'True for exactly one choice in the offer.' },
          },
          required: ['label', 'recommended'],
        },
      },
    },
    required: ['choices'],
  },
};

// Accept exactly one tool call. Invalid JSON is optional-output failure, not a
// failed conversational turn. Anthropic supplies input, OpenAI supplies arguments.
export function choicesFromTools(calls) {
  const offers = calls.filter(call => call.name === OFFER_CHOICES_TOOL.name);
  if (offers.length !== 1) return undefined;
  try {
    const call = offers[0];
    const input = call.arguments === undefined ? call.input : JSON.parse(call.arguments);
    return validateChoices(input?.choices);
  } catch { return undefined; }
}

export function pickedChoice(transcript, message, choiceLabel) {
  const previous = transcript.at(-1);
  if (previous?.actor !== 'Wayfinder') return undefined;
  const offered = validateChoices(previous.choices);
  // Metadata can describe a chip plus edited free text, but cannot forge an
  // unoffered choice. Exact matching is whitespace-trimmed and case-sensitive.
  const explicit = typeof choiceLabel === 'string' ? choiceLabel.trim() : undefined;
  return offered?.find(option => option.label === explicit)?.label
    ?? offered?.find(option => option.label === message.trim())?.label;
}
