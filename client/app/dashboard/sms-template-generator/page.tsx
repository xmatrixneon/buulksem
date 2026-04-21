'use client';

import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Code, Copy, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";

export default function SmsTemplateGenerator() {
  const trpc = useTRPC()
  const [smsText, setSmsText] = useState('');
  const [debouncedSmsText, setDebouncedSmsText] = useState('');

  // Debounce input
  useState(() => {
    const timer = setTimeout(() => {
      setDebouncedSmsText(smsText);
    }, 500);
    return () => clearTimeout(timer);
  });

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

    setDebouncedSmsText(smsText.trim());

    if (extractedOtp) {
      toast.success(`✅ Successfully extracted OTP: ${extractedOtp}`);
    } else {
      toast.success('Template generated successfully!');
    }
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(template);
    toast.success("Template copied to clipboard!");
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
            </CardTitle>
            <CardDescription>
              AI-generated template compatible with your regex builder
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {template ? (
              <>
                <div className="p-3 bg-muted rounded-md border">
                  <code className="text-sm whitespace-pre-wrap break-words">
                    {template}
                  </code>
                </div>
                <Button
                  onClick={handleCopyTemplate}
                  variant="outline"
                  className="w-full"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Template
                </Button>
              </>
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
              <div><code className="bg-muted px-1 rounded">{"{otp}"}</code> → OTP digits/alphanumeric</div>
              <div><code className="bg-muted px-1 rounded">{"{time}"}</code> → Durations, dates, times</div>
              <div><code className="bg-muted px-1 rounded">{"{random}"}</code> → Purely alphanumeric strings</div>
              <div><code className="bg-muted px-1 rounded">{"{any}"}</code> → Anything else (links, special chars)</div>
            </div>
            <div className="space-y-2">
              <div className="font-semibold">Rules:</div>
              <div>• Only 1 {"{otp}"} per template</div>
              <div>• Spaces collapse into \s*</div>
              <div>• : matches : or ：</div>
              <div>• . matches .*</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
