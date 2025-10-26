import { useState } from "react";
import { Shield, AlertTriangle, CheckCircle, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AnalysisResult {
  classification: "spam" | "safe";
  confidence: number;
  explanation?: string;
}

export const SpamAnalyzer = () => {
  const [text, setText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!text.trim()) {
      toast({
        title: "No text to analyze",
        description: "Please paste some text first.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("spam-detector", {
        body: { text, action: "classify" },
      });

      if (error) throw error;

      setResult({
        classification: data.classification,
        confidence: data.confidence,
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze text. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExplain = async () => {
    if (!result) return;

    setIsExplaining(true);

    try {
      const { data, error } = await supabase.functions.invoke("spam-detector", {
        body: { text, action: "explain" },
      });

      if (error) throw error;

      setResult({
        ...result,
        explanation: data.explanation,
      });
    } catch (error: any) {
      console.error("Explanation error:", error);
      toast({
        title: "Explanation failed",
        description: error.message || "Failed to generate explanation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExplaining(false);
    }
  };

  const isSpam = result?.classification === "spam";
  const confidence = result?.confidence || 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-secondary to-background">
      <div className="w-full max-w-3xl space-y-6 animate-in fade-in duration-700">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary shadow-glow mb-2">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            SpamGuard AI
          </h1>
          <p className="text-lg text-muted-foreground">
            Advanced spam detection powered by AI
          </p>
        </div>

        {/* Input Card */}
        <Card className="p-6 shadow-lg border-2 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Paste your message, email, or link
              </label>
              <Textarea
                placeholder="Example: Congratulations! You've won $1,000,000. Click here to claim your prize..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[200px] resize-none text-base"
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !text.trim()}
              className="w-full bg-gradient-primary hover:opacity-90 transition-all shadow-md"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5 mr-2" />
                  Analyze Text
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Results Card */}
        {result && (
          <Card
            className={`p-6 shadow-xl border-2 backdrop-blur-sm animate-in slide-in-from-bottom duration-500 ${
              isSpam
                ? "border-destructive/50 bg-destructive/5"
                : "border-success/50 bg-success/5"
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {isSpam ? (
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-danger">
                      <AlertTriangle className="w-6 h-6 text-destructive-foreground" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-success">
                      <CheckCircle className="w-6 h-6 text-success-foreground" />
                    </div>
                  )}
                  <div>
                    <Badge
                      variant={isSpam ? "destructive" : "default"}
                      className={`text-base px-4 py-1 ${
                        isSpam ? "" : "bg-success text-success-foreground"
                      }`}
                    >
                      {isSpam ? "SPAM DETECTED" : "SAFE"}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Confidence: {confidence.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {!result.explanation && (
                <Button
                  onClick={handleExplain}
                  disabled={isExplaining}
                  variant="outline"
                  className="w-full"
                >
                  {isExplaining ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating explanation...
                    </>
                  ) : (
                    <>
                      <Info className="w-4 h-4 mr-2" />
                      Explain Why
                    </>
                  )}
                </Button>
              )}

              {result.explanation && (
                <div className="p-4 rounded-lg bg-card border animate-in slide-in-from-bottom duration-300">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Analysis Details
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {result.explanation}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
