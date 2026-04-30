'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Code, Copy, CheckCircle, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export default function SmsTemplateGenerator() {
  const trpc = useTRPC()
  const [smsText, setSmsText] = useState('');
  const [debouncedSmsText, setDebouncedSmsText] = useState('');
  const [showImprove, setShowImprove] = useState(false);
  const [userFeedback, setUserFeedback] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);

  // Proper debounce implementation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (smsText.trim()) {
        setDebouncedSmsText(smsText.trim());
      }
    }, 500); // Reduced to 500ms for faster response
    return () => clearTimeout(timer);
  }, [smsText]);

  // tRPC query for generating template
  const { data, isLoading, refetch } = useQuery({
    ...trpc.utils.generateSmsTemplate.queryOptions({
      smsText: debouncedSmsText.trim(),
    }),
    enabled: !!debouncedSmsText.trim(),
    refetchOnWindowFocus: false,
  })

  const template = data?.template || ''
  const extractedOtp = data?.otp || ''

  // Improve template mutation
  const { mutate: improveTemplate, isPending: isImproving } = useMutation({
    ...trpc.utils.improveTemplateWithChat.mutationOptions(),
    onSuccess: (result: any) => {
      if (result.success && result.template) {
        setSmsText(result.template); // Update to show improved template
        setConversationHistory(result.conversation || []);
        toast.success(`✅ Template improved! OTP: ${result.otp || 'N/A'}`);
      } else {
        toast.error(result.message || 'Failed to improve template');
      }
      setUserFeedback('');
    },
    onError: (error: any) => {
      toast.error('Error improving template: ' + (error.message || 'Unknown error'));
    }
  });

  const exampleMessages = [
    {
      text: "Your OTP is 123456",
      description: "Simple OTP message"
    },
    {
      text: "<#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs. Do not share with anyone. If this was not you click i.airtel.in/Contact N9BWuqauU1y",
      description: "Airtel OTP example"
    },
    {
      text: "Your verification code is 789012. Expires in 5 minutes.",
      description: "Verification code with expiry"
    }
  ];

  const loadExample = (exampleText: string) => {
    setSmsText(exampleText);
    setDebouncedSmsText(exampleText);
  };

  const handleGenerateTemplate = async () => {
    if (!smsText.trim()) {
      toast.error('Please enter SMS text');
      return;
    }

    // Force immediate generation
    setDebouncedSmsText(smsText.trim());
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(template);
    toast.success("Template copied to clipboard!");
  };

  const handleImproveTemplate = () => {
    if (!userFeedback.trim()) {
      toast.error('Please enter your feedback');
      return;
    }

    improveTemplate({
      originalSms: smsText,
      previousTemplate: template,
      userFeedback: userFeedback,
      conversationHistory
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 md:h-8 md:w-8" />
            SMS Template Generator
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Convert SMS messages into regex using AI
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Input SMS
            </CardTitle>
            <CardDescription>
              Paste your SMS message here..
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste SMS message here..."
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              rows={6}
              className="resize-none"
            />

            {/* Example Messages */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Try these examples:</p>
              <div className="grid grid-cols-1 gap-2">
                {exampleMessages.map((example, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto py-2"
                    onClick={() => loadExample(example.text)}
                  >
                    <div className="text-xs truncate">
                      <div className="font-medium">{example.description}</div>
                      <div className="text-muted-foreground truncate">{example.text}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerateTemplate}
              disabled={isLoading || !smsText.trim()}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Template'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Output Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Generated Template
              {extractedOtp && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
            </CardTitle>
            <CardDescription>
              AI-generated template compatible with your regex builder
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {template ? (
              <>
                {extractedOtp && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm">
                      OTP extracted: <code className="font-mono font-semibold">{extractedOtp}</code>
                    </span>
                  </div>
                )}
                <div className="p-3 bg-muted rounded-md border">
                  <code className="text-sm whitespace-pre-wrap break-words">
                    {template}
                  </code>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyTemplate}
                    variant="outline"
                    className="flex-1"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    onClick={() => setShowImprove(!showImprove)}
                    variant="outline"
                    className="flex-1"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Improve
                  </Button>
                </div>

                {/* Improve Section */}
                {showImprove && (
                  <div className="space-y-3 pt-3 border-t">
                    <p className="text-sm font-medium">Not perfect? Ask AI to improve:</p>
                    <Textarea
                      placeholder="E.g., 'Make the template more flexible', 'Add support for 6-digit OTP', 'The OTP is not being captured correctly'"
                      value={userFeedback}
                      onChange={(e) => setUserFeedback(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />
                    <Button
                      onClick={handleImproveTemplate}
                      disabled={isImproving || !userFeedback.trim()}
                      className="w-full"
                      size="sm"
                    >
                      {isImproving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Improving...
                        </>
                      ) : (
                        'Send Feedback'
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : isLoading ? (
              <div className="text-muted-foreground text-sm text-center py-8 space-y-2">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p>AI is analyzing your SMS...</p>
                <p className="text-xs">This takes 2-3 seconds using DeepSeek AI</p>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm text-center py-8">
                Template will appear here after generation
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      <Card>
        <CardHeader>
          <CardTitle>Template Rules</CardTitle>
          <CardDescription>
            Special placeholders and their meanings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="font-semibold">Placeholders:</div>
              <div><code className="bg-muted px-1 rounded">{"{otp}"}</code> → OTP (3-12 alphanumeric)</div>
              <div><code className="bg-muted px-1 rounded">{"{date}"}</code> → Date values (e.g., "28 Apr 2025")</div>
              <div><code className="bg-muted px-1 rounded">{"{datetime}"}</code> → DateTime values</div>
              <div><code className="bg-muted px-1 rounded">{"{time}"}</code> → Durations (e.g., "100 secs")</div>
              <div><code className="bg-muted px-1 rounded">{"{random}"}</code> → Random strings</div>
              <div><code className="bg-muted px-1 rounded">{"{any}"}</code> → URLs, links, etc.</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">Rules:</div>
              <div>• Only 1 {"{otp}"} per template</div>
              <div>• Spaces collapse into \s*</div>
              <div>• : matches : or ：</div>
              <div>• . matches .*</div>
              <div>• AI-powered by DeepSeek</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
