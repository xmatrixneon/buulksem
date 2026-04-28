import { z } from 'zod'

/**
 * User creation validation schema
 * Ensures all required fields are present and valid
 */
export const createUserSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .trim()
})

/**
 * User update validation schema
 * All fields optional for partial updates
 */
export const updateUserSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .toLowerCase()
    .trim()
    .optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .trim()
    .optional()
})

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

/**
 * Change password validation schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
})

/**
 * Validate user data against schema
 * Throws ZodError if validation fails
 */
export function validateUserCreation(data: unknown) {
  return createUserSchema.parse(data)
}

/**
 * Validate user update data against schema
 * Throws ZodError if validation fails
 */
export function validateUserUpdate(data: unknown) {
  return updateUserSchema.parse(data)
}

/**
 * Validate sign in data against schema
 * Throws ZodError if validation fails
 */
export function validateSignIn(data: unknown) {
  return signInSchema.parse(data)
}
