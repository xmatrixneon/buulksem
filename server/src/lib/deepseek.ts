/**
 * DeepSeek API Integration for SMS Template Generation
 * Uses AI to convert SMS messages into regex templates with placeholders
 * Matches the working regex logic from fetch handler
 */

interface SmsTemplateResponse {
  success: boolean;
  template?: string;
  otp?: string;
  message: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ImproveTemplateResponse {
  success: boolean;
  template?: string;
  otp?: string;
  message: string;
  conversation?: ChatMessage[];
}

// Copy working regex functions from fetch handler
function escapeRegex(s: string = ''): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeToSingleLine(str: string = ''): string {
  return str
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSmartOtpRegexList(formats: string[]): RegExp[] {
  if (!formats || formats.length === 0) return []
  if (!Array.isArray(formats)) formats = [formats]

  return formats
    .map((format) => {
      format = normalizeToSingleLine(format)
      if (!format.includes('{otp')) return null

      let pattern = escapeRegex(format)
      let isFirstOtp = true

      // Handle fixed-length OTP patterns: {otp4}, {otp5}, {otp6}, {otp7}, {otp8}
      const fixedOtpMatch = format.match(/\{otp(\d+)\}/)
      if (fixedOtpMatch && fixedOtpMatch[1]) {
        const length = parseInt(fixedOtpMatch[1], 10)
        pattern = pattern.replace(/\\\{otp\d+\\\}/gi, () => {
          if (isFirstOtp) {
            isFirstOtp = false
            return `(?<otp>\\b\\d{${length}}\\b)`
          }
          return `(?:\\b\\d{${length}}\\b)`
        })
      } else {
        // Handle {otp} - 3-12 characters (working version)
        pattern = pattern.replace(/\\\{otp\\\}/gi, () => {
          if (isFirstOtp) {
            isFirstOtp = false
            return '(?<otp>[A-Za-z0-9\\-]{3,12})'
          }
          return '(?:[A-Za-z0-9\\-]{3,12})'
        })
      }

      // Placeholders - same as working version
      pattern = pattern.replace(/\\\{date\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{datetime\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{time\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{random\\\}/gi, '.+?')
      pattern = pattern.replace(/\\\{any\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{.*?\\\}/gi, '.*?')

      // Spacing + punctuation - same as working version
      pattern = pattern
        .replace(/\\s+/g, '\\s*')
        .replace(/\\:/g, '[:：]?')
        .replace(/\\\./g, '.*?')

      return new RegExp(pattern, 'i')
    })
    .filter(Boolean) as RegExp[]
}

/**
 * Validate template against SMS using working regex logic
 */
function validateTemplate(template: string, smsText: string): { valid: boolean; otp?: string; reason?: string } {
  const cleanMessage = normalizeToSingleLine(smsText)
  const regexList = buildSmartOtpRegexList([template])

  if (regexList.length === 0) {
    return { valid: false, reason: 'Failed to build regex from template' }
  }

  for (const regex of regexList) {
    const match = regex.exec(cleanMessage)
    const otp = match?.groups?.otp || (match && match[1]) || null
    if (otp) {
      return { valid: true, otp }
    }
  }

  return { valid: false, reason: 'Could not extract OTP from SMS using the generated template' }
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

  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    attempts++

    const prompt = `You are an expert SMS template generator. Convert the following SMS message into a template using placeholders.

CRITICAL RULES:
- Use exactly ONE {otp} placeholder for the OTP code
- OTP matches: (?<otp>[A-Za-z0-9\\-]{3,12}) - 3 to 12 alphanumeric characters
- If the SMS contains OTP multiple times, use {otp} for the first occurrence only
- Use {any} for any repeated OTP references

Placeholders:
- {otp} - OTP code (3-12 alphanumeric characters)
- {time} - Duration like "5 minutes", "100 secs"
- {date} - Date values
- {random} - Purely alphanumeric random strings (3-15 chars)
- {any} - Anything else (URLs, tokens with special chars, repeated OTP)

Rules:
1. Replace the OTP with {otp} (only first occurrence)
2. Durations → {time}
3. Random purely alphanumeric → {random}
4. Random with special chars → {any}
5. Keep static text exactly as-is
6. Preserve all punctuation and spacing

Examples:
"<#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs." → "<#> {otp} is your OTP to login into Airtel Thanks app. Valid for {time}."
"Dear customer, 5672 is the one Time Password from Vi. Expires in 3 min...OTP @www.myvi.in #5672" → "Dear customer, {otp} is the one Time Password from Vi. Expires in {time}...OTP @www.myvi.in #{any}"

SMS to convert: "${smsText}"

Return ONLY the template string, nothing else.`

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            {
              role: 'system',
              content: 'You are an SMS template generator. Return ONLY the template string, no explanations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 8000
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[DeepSeek] API Error:', response.status, errorText)
        return generateTemplateWithRegex(smsText)
      }

      const data = await response.json() as DeepSeekChatResponse
      let template = data?.choices?.[0]?.message?.content?.trim() || ''

      if (!template) {
        console.error('[DeepSeek] Empty response from API')
        return generateTemplateWithRegex(smsText)
      }

      // Clean template - remove quotes
      template = template.replace(/^"+|"+$/g, '').trim()

      // Validate template
      const validation = validateTemplate(template, smsText)

      if (validation.valid) {
        return {
          success: true,
          template,
          otp: validation.otp,
          message: 'Template generated and validated'
        }
      }

      // If validation failed and we have attempts left, try again
      if (attempts < maxAttempts) {
        console.log(`[DeepSeek] Attempt ${attempts} failed validation: ${validation.reason}. Retrying...`)
        continue
      }

      // Last attempt failed, return with error info
      return {
        success: false,
        template,
        message: `Template validation failed: ${validation.reason}`
      }
    } catch (error) {
      console.error('[DeepSeek] Error generating template:', error)
      return generateTemplateWithRegex(smsText)
    }
  }

  // Should not reach here
  return generateTemplateWithRegex(smsText)
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
  ]

  let otp: string | undefined = undefined
  let template = smsText

  for (const pattern of otpPatterns) {
    const match = smsText.match(pattern)
    if (match) {
      const digits = match[0].match(/\d{4,8}/)
      if (digits) {
        otp = digits[0]
        break
      }
    }
  }

  if (otp) {
    template = smsText.replace(new RegExp(`\\b${otp}\\b`, 'g'), '{otp}')
    template = template.replace(/\b\d{1,3}\b/g, '')
    template = template.replace(/\s+/g, ' ').trim()
  }

  return {
    success: true,
    template: template || smsText,
    otp,
    message: otp ? 'OTP found and template generated' : 'No OTP found in message'
  }
}

/**
 * Improve template with chat/follow-up
 * Allows user to provide feedback and get better template
 */
export async function improveTemplateWithChat(
  originalSms: string,
  previousTemplate: string,
  userFeedback: string,
  conversationHistory: ChatMessage[] = []
): Promise<ImproveTemplateResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey || apiKey === 'your-deepseek-api-key') {
    return {
      success: false,
      message: 'DeepSeek API not configured'
    };
  }

  try {
    // Build conversation
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert SMS template generator. Your task is to create regex-compatible templates from SMS messages.

CRITICAL RULES:
- Use exactly ONE {otp} placeholder for the OTP code
- OTP matches: (?<otp>[A-Za-z0-9\\-]{3,12}) - 3 to 12 alphanumeric characters
- If the SMS contains OTP multiple times, use {otp} for the first occurrence only
- Use {any} for any repeated OTP references

Placeholders:
- {otp} - OTP code (3-12 alphanumeric characters)
- {otp4}, {otp5}, {otp6} - Fixed-length OTP (4, 5, 6 digits)
- {time} - Duration like "5 minutes", "100 secs"
- {date} - Date values
- {random} - Purely alphanumeric random strings (3-15 chars)
- {any} - Anything else (URLs, tokens with special chars, repeated OTP)

Rules:
1. Replace the OTP with {otp} (only first occurrence)
2. Durations → {time}
3. Random purely alphanumeric → {random}
4. Random with special chars → {any}
5. Keep static text exactly as-is
6. Preserve all punctuation and spacing
7. Return ONLY the template string, no explanations

After generating the template, internally verify it would match the original SMS and extract the OTP correctly.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: `Original SMS: "${originalSms}"`
      },
      {
        role: 'assistant',
        content: `Generated template: ${previousTemplate}`
      },
      {
        role: 'user',
        content: userFeedback
      }
    ];

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        temperature: 0.3,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeek] Chat API Error:', response.status, errorText);
      return {
        success: false,
        message: `API Error: ${response.status}`
      };
    }

    const data = await response.json() as DeepSeekChatResponse;
    let improvedTemplate = data?.choices?.[0]?.message?.content?.trim() || '';

    if (!improvedTemplate) {
      return {
        success: false,
        message: 'Empty response from AI'
      };
    }

    // Clean template - remove quotes
    improvedTemplate = improvedTemplate.replace(/^"+|"+$/g, '').trim();

    // Validate the improved template
    const validation = validateTemplate(improvedTemplate, originalSms);

    if (!validation.valid) {
      return {
        success: false,
        template: improvedTemplate,
        message: `Template validation failed: ${validation.reason}. You can ask for further improvements.`
      };
    }

    // Add to conversation history
    const updatedConversation: ChatMessage[] = [
      ...conversationHistory,
      { role: 'user', content: `Original SMS: "${originalSms}"` },
      { role: 'assistant', content: `Generated template: ${previousTemplate}` },
      { role: 'user', content: userFeedback },
      { role: 'assistant', content: improvedTemplate }
    ];

    return {
      success: true,
      template: improvedTemplate,
      otp: validation.otp,
      message: 'Template improved successfully!',
      conversation: updatedConversation
    };

  } catch (error) {
    console.error('[DeepSeek] Error in chat improvement:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
