"use client"

import { useState, useEffect } from "react"
import { signUp } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, Mail, Lock, User, Check, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { validateSignUpForm, getPasswordStrength, type SignUpFormData } from "@/lib/validations/auth"

export default function SignUpPage() {
  const [formData, setFormData] = useState<SignUpFormData>({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof SignUpFormData, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof SignUpFormData, boolean>>>({})
  const router = useRouter()

  // Real-time validation on field change
  useEffect(() => {
    if (Object.keys(touched).length > 0) {
      validateField(Object.keys(touched)[0] as keyof SignUpFormData)
    }
  }, [formData, touched])

  const validateField = (field: keyof SignUpFormData) => {
    const result = validateSignUpForm(formData)

    if (!result.success) {
      const fieldError = result.error.errors.find(e => e.path[0] === field)
      setErrors(prev => ({
        ...prev,
        [field]: fieldError?.message
      }))
      return !!fieldError
    } else {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
      return false
    }
  }

  const validateAll = () => {
    const result = validateSignUpForm(formData)

    if (!result.success) {
      const newErrors: Partial<Record<keyof SignUpFormData, string>> = {}
      result.error.errors.forEach(e => {
        const field = e.path[0] as keyof SignUpFormData
        newErrors[field] = e.message
      })
      setErrors(newErrors)
      return false
    }

    setErrors({})
    return true
  }

  const handleBlur = (field: keyof SignUpFormData) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    validateField(field)
  }

  const handleChange = (field: keyof SignUpFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Mark all fields as touched
    setTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true
    })

    // Validate all fields
    if (!validateAll()) {
      toast.error("Please fix the errors before submitting")
      return
    }

    setLoading(true)

    try {
      const result = await signUp.email({
        email: formData.email,
        password: formData.password,
        name: formData.name,
      })

      if (result.error) {
        toast.error(result.error.message || "Registration failed")
      } else {
        toast.success("Account created successfully!")
        router.push('/dashboard')
      }
    } catch (err) {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const passwordStrength = getPasswordStrength(formData.password)

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-muted/40">
      <div className={cn("flex flex-col gap-6", "w-full max-w-md")}>
        <Card className="shadow-lg border-border/50">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">MS</span>
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
            <CardDescription className="text-muted-foreground">
              Sign up to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Full Name
                </Label>
                <div className="relative">
                  <User className={cn(
                    "absolute left-3 top-3 h-4 w-4 transition-colors",
                    touched.name && errors.name ? "text-destructive" : "text-muted-foreground"
                  )} />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    onBlur={() => handleBlur("name")}
                    disabled={loading}
                    className={cn(
                      "pl-10",
                      touched.name && errors.name && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touched.name && (
                    <div className="absolute right-3 top-3">
                      {errors.name ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  )}
                </div>
                {touched.name && errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className={cn(
                    "absolute left-3 top-3 h-4 w-4 transition-colors",
                    touched.email && errors.email ? "text-destructive" : "text-muted-foreground"
                  )} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    required
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    disabled={loading}
                    className={cn(
                      "pl-10",
                      touched.email && errors.email && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touched.email && (
                    <div className="absolute right-3 top-3">
                      {errors.email ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  )}
                </div>
                {touched.email && errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className={cn(
                    "absolute left-3 top-3 h-4 w-4 transition-colors",
                    touched.password && errors.password ? "text-destructive" : "text-muted-foreground"
                  )} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters, 1 uppercase, 1 number"
                    required
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    disabled={loading}
                    className={cn(
                      "pl-10 pr-10",
                      touched.password && errors.password && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {touched.password && errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
                {formData.password && !errors.password && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all", passwordStrength.color)}
                        style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{passwordStrength.label}</span>
                  </div>
                )}
                {formData.password && (
                  <div className="grid grid-cols-2 gap-1 mt-2 text-xs text-muted-foreground">
                    <div className={cn(/[a-z]/.test(formData.password) ? "text-green-600" : "")}>
                      {/[a-z]/.test(formData.password) ? "✓" : "○"} Lowercase
                    </div>
                    <div className={cn(/[A-Z]/.test(formData.password) ? "text-green-600" : "")}>
                      {/[A-Z]/.test(formData.password) ? "✓" : "○"} Uppercase
                    </div>
                    <div className={cn(/[0-9]/.test(formData.password) ? "text-green-600" : "")}>
                      {/[0-9]/.test(formData.password) ? "✓" : "○"} Number
                    </div>
                    <div className={cn(formData.password.length >= 8 ? "text-green-600" : "")}>
                      {formData.password.length >= 8 ? "✓" : "○"} 8+ chars
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className={cn(
                    "absolute left-3 top-3 h-4 w-4 transition-colors",
                    touched.confirmPassword && errors.confirmPassword ? "text-destructive" : "text-muted-foreground"
                  )} />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange("confirmPassword", e.target.value)}
                    onBlur={() => handleBlur("confirmPassword")}
                    disabled={loading}
                    className={cn(
                      "pl-10 pr-10",
                      touched.confirmPassword && errors.confirmPassword && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {touched.confirmPassword && errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                size="lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating account...
                  </>
                ) : (
                  "Sign Up"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <a href="/sign-in" className="text-primary hover:underline font-medium">
                Sign in
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
