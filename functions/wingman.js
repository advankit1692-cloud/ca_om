export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const command = String(body.command || "").trim();
    const appContext =
      body.context && typeof body.context === "object"
        ? body.context
        : {};

    if (!command) {
      return Response.json(
        { error: "Command is required." },
        { status: 400 }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: env.OPENAI_WINGMAN_MODEL || "gpt-5.6-mini",
          input: [
            {
              role: "system",
              content: [{
                type: "input_text",
                text: "You are C&A Om Wingman, a construction-management assistant. Understand Hindi/Hinglish and normal-language contractor commands. Be concise, practical, and never invent app data."
              }]
            },
            {
              role: "user",
              content: [{
                type: "input_text",
                text: JSON.stringify({
                  command,
                  context: appContext
                })
              }]
            }
          ],
          max_output_tokens: 700
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: data?.error?.message || "OpenAI request failed." },
        { status: response.status }
      );
    }

    const text =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap(item => item.content || [])
            .map(item => item.text || "")
            .filter(Boolean)
            .join("\n")
        : "");

    return Response.json({
      text,
      response_id: data.id || null
    });
  } catch (error) {
    return Response.json(
      { error: "Wingman request failed." },
      { status: 500 }
    );
  }
      }
