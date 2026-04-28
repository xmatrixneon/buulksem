/**
 * DeepSeek API Integration for SMS Template Generation
 * Uses AI to convert SMS messages into regex templates with placeholders
 */

interface SmsTemplateResponse {
  success: boolean;
  template?: string;
  otp?: string;
  message: string;
}

interface DeepSeekChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Generate SMS template using DeepSeek AI
 * @param smsText - The SMS message to convert to template
 * @returns Template with placeholders and extracted OTP
 */
export async function generateSmsTemplate(smsText: string): Promise<SmsTemplateResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey || apiKey === 'your-deepseek-api-key') {
    // Fallback to regex if no API key configured
    return generateTemplateWithRegex(smsText);
  }

  try {
    const prompt = `Return FULL SMS template.

Rules:
- Only ONE {otp}
- Use {time} for duration
- Use {date} for date
- Use {random} for simple alphanumeric
- Use {any} for URLs / complex / symbols
- Do NOT replace normal words
- Keep structure exact

Input SMS: "${smsText}"

Template:`;

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'SMS template generator. Convert SMS to template with placeholders: {otp}, {date}, {time}, {random}, {any}. Return ONLY the template.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeek] API Error:', response.status, errorText);
      return generateTemplateWithRegex(smsText);
    }

    const data = await response.json() as DeepSeekChatResponse;
    const template = data?.choices?.[0]?.message?.content?.trim() || '';

    // Extract OTP from original SMS
    const otpMatch = smsText.match(/\b\d{4,8}\b/);
    const otp = otpMatch ? otpMatch[0] : undefined;

    return {
      success: true,
      template,
      otp,
      message: otp ? 'OTP found and template generated' : 'Template generated'
    };
  } catch (error) {
    console.error('[DeepSeek] Error generating template:', error);
    return generateTemplateWithRegex(smsText);
  }
}

/**
 * Fallback regex-based template generation
 * Used when DeepSeek API is unavailable
 */
function generateTemplateWithRegex(smsText: string): SmsTemplateResponse {
  const otpPatterns = [
    /\b\d{4,8}\b/g,
    /(?:otp|code|password|pass|pin|verification|is)\s*:?\s*\d{4,8}/gi,
    /(?:your|the)\s+(?:otp|code|password|pin|verification)\s+(?:is\s+)?\d{4,8}/gi
  ];

  let otp: string | undefined = undefined;
  let template = smsText;

  for (const pattern of otpPatterns) {
    const match = smsText.match(pattern);
    if (match) {
      const digits = match[0].match(/\d{4,8}/);
      if (digits) {
        otp = digits[0];
        break;
      }
    }
  }

  if (otp) {
    template = smsText.replace(new RegExp(`\\b${otp}\\b`, 'g'), '{otp}');
    template = template.replace(/\b\d{1,3}\b/g, '');
    template = template.replace(/\s+/g, ' ').trim();
  }

  return {
    success: true,
    template: template || smsText,
    otp,
    message: otp ? 'OTP found and template generated' : 'No OTP found in message'
  };
}
