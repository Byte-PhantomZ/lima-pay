"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { AlertCircle, CheckCircle, Clock, Copy, Loader2, RefreshCw, XCircle } from "lucide-react"
import type { Transaction } from "@/lib/types"
import { getBrowserClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"

interface PaymentStatusProps {
  transaction: Transaction
}

export function PaymentStatus({ transaction: initialTransaction }: PaymentStatusProps) {
  const [transaction, setTransaction] = useState<Transaction>(initialTransaction)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [progressPercent, setProgressPercent] = useState<number>(100)
  const [isMockInvoice, setIsMockInvoice] = useState<boolean>(transaction.invoice_id?.startsWith("mock-") || false)

  const supabase = getBrowserClient()

  // Calculate time remaining and progress percentage
  useEffect(() => {
    if (transaction.status !== "invoice_generated" && transaction.status !== "pending") {
      return
    }

    if (!transaction.expires_at) {
      return
    }

    const expiresAt = new Date(transaction.expires_at).getTime()
    const now = Date.now()
    const totalDuration = 10 * 60 * 1000 // 10 minutes in milliseconds

    // If already expired
    if (now >= expiresAt) {
      setTimeRemaining(0)
      setProgressPercent(0)
      return
    }

    const remaining = Math.max(0, expiresAt - now)
    const elapsed = totalDuration - remaining
    const percent = Math.max(0, Math.min(100, (remaining / totalDuration) * 100))

    setTimeRemaining(Math.floor(remaining / 1000)) // Convert to seconds
    setProgressPercent(percent)

    const timer = setInterval(() => {
      const newNow = Date.now()
      const newRemaining = Math.max(0, expiresAt - newNow)
      const newPercent = Math.max(0, Math.min(100, (newRemaining / totalDuration) * 100))

      setTimeRemaining(Math.floor(newRemaining / 1000))
      setProgressPercent(newPercent)

      if (newRemaining <= 0) {
        clearInterval(timer)
        checkPaymentStatus() // Check one last time when expired
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [transaction.expires_at, transaction.status])

  // Function to copy invoice string to clipboard
  const copyToClipboard = () => {
    if (!transaction.invoice_string) return

    navigator.clipboard
      .writeText(transaction.invoice_string)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch((err) => {
        console.error("Failed to copy:", err)
      })
  }

  // Function to check payment status
  const checkPaymentStatus = async () => {
    try {
      setIsChecking(true)
      setError(null)

      const response = await fetch(`/api/check-payment/${transaction.id}`)

      if (!response.ok) {
        throw new Error("Failed to check payment status")
      }

      const data = await response.json()
      setTransaction((prev) => ({ ...prev, status: data.status }))

      // If payment is completed or failed, stop polling
      if (data.status === "completed" || data.status === "failed") {
        return true
      }

      return false
    } catch (error) {
      console.error("Error checking payment status:", error)
      setError("Failed to check payment status. Please try again.")
      return true // Stop polling on error
    } finally {
      setIsChecking(false)
    }
  }

  // For mock invoices, simulate payment after a random time (for demo purposes)
  useEffect(() => {
    if (isMockInvoice && transaction.status === "invoice_generated") {
      // Simulate payment after 5-15 seconds for demo purposes
      const simulatePaymentTimer = setTimeout(
        () => {
          // 50% chance of payment success in demo mode
          if (Math.random() < 0.5) {
            checkPaymentStatus()
          }
        },
        5000 + Math.random() * 10000,
      )

      return () => clearTimeout(simulatePaymentTimer)
    }
  }, [isMockInvoice, transaction.status])

  // Set up real-time subscription
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel(`transaction-${transaction.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `id=eq.${transaction.id}`,
        },
        (payload) => {
          setTransaction((prev) => ({ ...prev, ...payload.new }))
        },
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  }, [transaction.id, supabase])

  // Set up polling as a fallback
  useEffect(() => {
    if (transaction.status === "completed" || transaction.status === "failed") {
      return
    }

    const interval = setInterval(async () => {
      const shouldStop = await checkPaymentStatus()
      if (shouldStop) {
        clearInterval(interval)
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [transaction.status])

  // Format time remaining
  const formatTimeRemaining = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  // Get status message and icon based on transaction status
  const getStatusInfo = () => {
    switch (transaction.status) {
      case "invoice_generated":
        return {
          title: "Waiting for Payment",
          description: isMockInvoice
            ? "This is a demo invoice. In a real environment, you would scan this with your Lightning wallet."
            : "Please scan the QR code with your Lightning wallet",
          icon: <Clock className="h-6 w-6 text-yellow-500" />,
        }
      case "paid":
        return {
          title: "Payment Received",
          description: "Processing your mobile money transfer",
          icon: <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />,
        }
      case "sending_mobile_money":
        return {
          title: "Sending Mobile Money",
          description: "Your mobile money transfer is being processed",
          icon: <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />,
        }
      case "completed":
        return {
          title: "Transfer Complete",
          description: "Your mobile money transfer has been sent successfully",
          icon: <CheckCircle className="h-6 w-6 text-green-500" />,
        }
      case "failed":
        return {
          title: "Transfer Failed",
          description: "There was an issue processing your transfer",
          icon: <XCircle className="h-6 w-6 text-red-500" />,
        }
      default:
        return {
          title: "Processing",
          description: "Your transaction is being processed",
          icon: <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />,
        }
    }
  }

  const { title, description, icon } = getStatusInfo()

  // Format amount with 2 decimal places
  const formattedAmount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(transaction.amount)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isMockInvoice && (
          <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle className="text-yellow-600 dark:text-yellow-400">Demo Mode</AlertTitle>
            <AlertDescription className="text-yellow-600 dark:text-yellow-400">
              This is a demo invoice. In production, you would scan a real Lightning invoice.
              <br />
              For this demo, the payment may be automatically simulated after a few seconds.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Amount</p>
          <p className="text-2xl font-bold">{formattedAmount} XAF</p>
        </div>

        {(transaction.status === "invoice_generated" || transaction.status === "pending") &&
          transaction.invoice_string && (
            <>
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG value={transaction.invoice_string} size={200} level="H" includeMargin />
                </div>
              </div>

              <div className="relative">
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md overflow-hidden">
                  <p className="text-xs text-gray-600 dark:text-gray-300 break-all">{transaction.invoice_string}</p>
                </div>
                <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={copyToClipboard}>
                  {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Time remaining</span>
                  <span>{formatTimeRemaining(timeRemaining)}</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  This invoice will expire in {formatTimeRemaining(timeRemaining)}
                </p>
              </div>
            </>
          )}

        {transaction.status === "completed" && (
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-md">
            <p className="text-green-700 dark:text-green-300 text-center">
              Mobile money has been sent to {transaction.recipient_phone}
              {transaction.mobile_money_reference && (
                <span className="block mt-2 text-sm">Reference: {transaction.mobile_money_reference}</span>
              )}
            </p>
          </div>
        )}

        {transaction.status === "failed" && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
            <p className="text-red-700 dark:text-red-300 text-center">
              Transaction failed. Please try again or contact support.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Button
          variant="outline"
          className="w-full"
          onClick={checkPaymentStatus}
          disabled={isChecking || transaction.status === "completed" || transaction.status === "failed"}
        >
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Status
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
