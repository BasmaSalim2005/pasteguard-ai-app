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
  try {
    const response = await fetch("http://127.0.0.1:5000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Flask API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Model service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({
        classification: result.classification,
        confidence: result.confidence,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error contacting Flask API:", err);
    return new Response(
      JSON.stringify({ error: "Backend connection failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}



    } else {
      // Explanation request
      const explainPayload = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a spam detection expert trained on real-world spam patterns. Provide clear, specific explanations citing actual indicators found in the text.

Focus on identifying:
- Urgent/pressure language (WIN, FREE, URGENT, LIMITED)
- Financial solicitations or prize claims
- Premium rate numbers or suspicious links
- Grammar issues combined with marketing
- Personalization level (generic vs specific)
- Sender legitimacy cues

Keep explanations under 100 words. Be specific about WHICH indicators you found, not just general patterns.`
          },
          {
            role: "user",
            content: `Explain why this text was classified as spam or safe. Be specific about the indicators found:\n\n${text}`
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
