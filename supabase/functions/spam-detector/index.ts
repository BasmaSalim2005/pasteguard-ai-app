import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, action } = await req.json();
    
    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Text is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action || !["classify", "explain"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Action must be 'classify' or 'explain'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${action} request for text of length ${text.length}`);

    if (action === "classify") {
      // Classification request with tool calling for structured output
      const classifyPayload = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a spam detection expert. Analyze text and classify it as spam or safe with a confidence percentage."
          },
          {
            role: "user",
            content: `Analyze this text and determine if it's spam or safe:\n\n${text}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_spam",
              description: "Classify text as spam or safe with confidence percentage",
              parameters: {
                type: "object",
                properties: {
                  classification: {
                    type: "string",
                    enum: ["spam", "safe"],
                    description: "Whether the text is spam or safe"
                  },
                  confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 100,
                    description: "Confidence percentage (0-100)"
                  }
                },
                required: ["classification", "confidence"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_spam" } }
      };

      const classifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(classifyPayload),
      });

      if (!classifyResponse.ok) {
        const errorText = await classifyResponse.text();
        console.error("AI Gateway error:", classifyResponse.status, errorText);
        
        if (classifyResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (classifyResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "AI service error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const classifyData = await classifyResponse.json();
      console.log("Classification response received");
      
      const toolCall = classifyData.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        console.error("No tool call in response");
        return new Response(
          JSON.stringify({ error: "Invalid AI response format" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = JSON.parse(toolCall.function.arguments);
      
      return new Response(
        JSON.stringify({
          classification: result.classification,
          confidence: result.confidence
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // Explanation request
      const explainPayload = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a spam detection expert. Provide clear, concise explanations for why text is classified as spam or safe. Keep explanations under 100 words and focus on specific indicators."
          },
          {
            role: "user",
            content: `Explain why this text was classified as spam or safe. Be specific about the indicators:\n\n${text}`
          }
        ]
      };

      const explainResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(explainPayload),
      });

      if (!explainResponse.ok) {
        const errorText = await explainResponse.text();
        console.error("AI Gateway error:", explainResponse.status, errorText);
        
        if (explainResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (explainResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "AI service error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const explainData = await explainResponse.json();
      console.log("Explanation response received");
      
      const explanation = explainData.choices[0]?.message?.content;
      if (!explanation) {
        console.error("No explanation in response");
        return new Response(
          JSON.stringify({ error: "Invalid AI response format" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ explanation }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in spam-detector function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
