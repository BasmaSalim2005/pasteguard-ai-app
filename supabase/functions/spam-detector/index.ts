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
      // Few-shot learning with real spam/ham examples
      const classifyPayload = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert spam detection system trained on thousands of real messages. Analyze text carefully for spam indicators.

SPAM INDICATORS:
- Urgent calls to action (WIN, FREE, URGENT, ACT NOW, LIMITED TIME)
- Requests for personal/financial information
- Prize/lottery claims you didn't enter
- Suspicious URLs or phone numbers with premium rates
- Pressure tactics (claim within X hours, expiring soon)
- Too-good-to-be-true offers (free money, guaranteed wins)
- Poor grammar/spelling with marketing intent
- Requests to call/text premium numbers (e.g., 87121, 85555)
- Unknown sender offering rewards

SAFE INDICATORS:
- Normal conversational language
- Personal references and context
- No monetary solicitation
- Genuine dialogue between known parties
- Proper grammar in casual context
- No urgency or pressure tactics

EXAMPLES:

SPAM: "Free entry in 2 a wkly comp to win FA Cup final tkts 21st May 2005. Text FA to 87121 to receive entry question(std txt rate)T&C's apply 08452810075over18's"
SAFE: "Go until jurong point, crazy.. Available only in bugis n great world la e buffet... Cine there got amore wat..."

SPAM: "WINNER!! As a valued network customer you have been selected to receivea £900 prize reward! To claim call 09061701461. Claim code KL341. Valid 12 hours only."
SAFE: "Ok lar... Joking wif u oni..."

SPAM: "FreeMsg Hey there darling it's been 3 week's now and no word back! I'd like some fun you up for it still? Tb ok! XxX std chgs to send, £1.50 to rcv"
SAFE: "Nah I don't think he goes to usf, he lives around here though"

SPAM: "URGENT! You have won a 1 week FREE membership in our £100,000 Prize Jackpot! Txt the word: CLAIM to No: 81010 T&C www.dbuk.net LCCLTD POBOX 4403LDNW1A7RW18"
SAFE: "Even my brother is not like to speak with me. They treat me like aids patent."

Be precise with confidence based on the number and strength of spam indicators present.`
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
