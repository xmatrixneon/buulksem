import { z } from 'zod'

/**
 * User creation validation schema (frontend)
 * Matches backend validation for consistency
 */
export const signUpSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .trim(),
  email: z.string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, { message: 'Must contain at least one uppercase letter' })
    .regex(/[a-z]/, { message: 'Must contain at least one lowercase letter' })
    .regex(/[0-9]/, { message: 'Must contain at least one number' }),
  confirmPassword: z.string()
    .min(1, 'Please confirm your password')
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ['confirmPassword']
  }
)

export type SignUpFormData = z.infer<typeof signUpSchema>

/**
 * Sign in validation schema
 */
export const signInSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(1, 'Password is required')
})

export type SignInFormData = z.infer<typeof signInSchema>

/**
 * Validate sign-up form data
 */
export function validateSignUpForm(data: unknown) {
  return signUpSchema.safeParse(data)
}

/**
 * Validate sign-in form data
 */
export function validateSignInForm(data: unknown) {
  return signInSchema.safeParse(data)
}

/**
 * Get password strength indicator
 */
export function getPasswordStrength(password: string): {
  score: number
  label: string
  color: string
} {
  if (!password) {
    return { score: 0, label: 'Enter password', color: 'bg-gray-200' }
  }

  let score = 0

  // Length check
  if (password.length >= 8) score++
  if (password.length >= 12) score++

  // Complexity checks
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score <= 2) {
    return { score, label: 'Weak', color: 'bg-red-500' }
  } else if (score <= 4) {
    return { score, label: 'Medium', color: 'bg-yellow-500' }
  } else {
    return { score, label: 'Strong', color: 'bg-green-500' }
  }
}
