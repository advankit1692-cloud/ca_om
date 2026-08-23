// C&A Om Wingman — secure OpenAI proxy for Vercel
// The OpenAI API key must be provided by the deployment environment as OPENAI_API_KEY.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const command = String(body.command || '').trim();
    const context = body.context && typeof body.context === 'object' ? body.context : {};

    if (!command) return res.status(400).json({ error: 'Command is required.' });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_WINGMAN_MODEL || 'gpt-5.4-mini',
        input: [
          {
            role: 'system',
            content: [{
              type: 'input_text',
              text: 'You are C&A Om Wingman, a construction-management assistant. Understand Hindi/Hinglish and normal-language contractor commands. Be concise, practical, and never invent app data. If a command needs an app action that the client has not exposed, explain that clearly rather than pretending it was executed.'
            }]
          },
          {
            role: 'user',
            content: [{
              type: 'input_text',
              text: JSON.stringify({ command, context })
            }]
          }
        ],
        max_output_tokens: 700
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'OpenAI request failed.' });
    }

    const text = data.output_text || (Array.isArray(data.output)
      ? data.output.flatMap(item => item.content || []).map(item => item.text || '').filter(Boolean).join('\n')
      : '');

    return res.status(200).json({ text, response_id: data.id || null });
  } catch (error) {
    console.error('Wingman proxy error:', error);
    return res.status(500).json({ error: 'Wingman request failed.' });
  }
}
