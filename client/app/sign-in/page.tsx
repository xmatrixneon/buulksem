"use client"

import { useState, useEffect } from "react"
import { signIn } from "@/lib/auth-client"
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
import { Eye, EyeOff, Mail, Lock, Check, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { validateSignInForm, type SignInFormData } from "@/lib/validations/auth"

export default function SignInPage() {
  const [formData, setFormData] = useState<SignInFormData>({
    email: "",
    password: ""
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof SignInFormData, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof SignInFormData, boolean>>>({})
  const router = useRouter()

  // Real-time validation on field change
  useEffect(() => {
    if (Object.keys(touched).length > 0) {
      validateField(Object.keys(touched)[0] as keyof SignInFormData)
    }
  }, [formData, touched])

  const validateField = (field: keyof SignInFormData) => {
    const result = validateSignInForm(formData)

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
    const result = validateSignInForm(formData)

    if (!result.success) {
      const newErrors: Partial<Record<keyof SignInFormData, string>> = {}
      result.error.errors.forEach(e => {
        const field = e.path[0] as keyof SignInFormData
        newErrors[field] = e.message
      })
      setErrors(newErrors)
      return false
    }

    setErrors({})
    return true
  }

  const handleBlur = (field: keyof SignInFormData) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    validateField(field)
  }

  const handleChange = (field: keyof SignInFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Mark all fields as touched
    setTouched({
      email: true,
      password: true
    })

    // Validate all fields
    if (!validateAll()) {
      toast.error("Please fix the errors before submitting")
      return
    }

    setLoading(true)

    try {
      const result = await signIn.email({
        email: formData.email,
        password: formData.password,
      })

      if (result.error) {
        toast.error(result.error.message || "Login failed")
      } else {
        toast.success("Login successful!")
        router.push('/dashboard')
      }
    } catch (err) {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

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
            <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="Enter your password"
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
                    Logging in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Don't have an account? </span>
              <a href="/sign-up" className="text-primary hover:underline font-medium">
                Sign up
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
