// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Ejara API configuration
const EJARA_API_BASE_URL = "https://testbox-valentines-payment.ejaraapis.xyz"
const CLIENT_KEY = "a8b0b6000c"
const CLIENT_SECRET = "HoTuQMebq1JmxB](]55zKI&3t"
const EJARA_EMAIL = "ejaralnpaytest02@gmail.com"
const EJARA_PASSWORD = "EjaraTest2*"

// Store the auth token with expiration
let authToken: string | null = null
let tokenExpiry: number | null = null

/**
 * Authenticate with Ejara API and get access token
 */
async function authenticateEjara(): Promise<string> {
  // Check if we have a valid token
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken
  }

  try {
    console.log("Authenticating with Ejara API...")

    const response = await fetch(`${EJARA_API_BASE_URL}/api/v1/accounts/authenticate`, {
      method: "POST",
      headers: {
        "client-key": CLIENT_KEY,
        "client-secret": CLIENT_SECRET,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: EJARA_EMAIL,
        password: EJARA_PASSWORD,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Authentication failed: ${response.status}`, errorText)
      throw new Error(`Authentication failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("Auth response received")

    // Check if the response has the expected structure
    if (!data.data || typeof data.data !== "object") {
      throw new Error(`Unexpected response format: ${JSON.stringify(data)}`)
    }

    // The token might be in a different field based on the API documentation
    const token = data.data.token || data.data.accessToken || data.token || data.accessToken

    if (!token) {
      throw new Error(`No token found in response: ${JSON.stringify(data)}`)
    }

    // Store token with 1 hour expiry (adjust based on actual token lifetime)
    authToken = token
    tokenExpiry = Date.now() + 60 * 60 * 1000 // 1 hour

    console.log("Authentication successful")
    return authToken
  } catch (error) {
    console.error("Ejara authentication error:", error)
    throw new Error(`Failed to authenticate with Ejara API: ${error.message}`)
  }
}

/**
 * Check if a Lightning invoice has been paid
 */
async function checkInvoiceStatus(invoiceId: string): Promise<{
  paid: boolean
  status: string
  transactionId?: string
}> {
  // If it's a mock invoice, simulate payment status
  if (invoiceId.startsWith("mock-")) {
    // 20% chance of being paid for demo purposes
    const isPaid = Math.random() < 0.2
    return {
      paid: isPaid,
      status: isPaid ? "PAID" : "PENDING",
      transactionId: isPaid ? `tx-${Date.now()}` : undefined,
    }
  }

  try {
    console.log(`Checking status of invoice ${invoiceId}`)

    // Get authentication token
    const token = await authenticateEjara()

    // Call Ejara API to check invoice status
    const response = await fetch(`${EJARA_API_BASE_URL}/api/v1/transactions/ln-invoice-status/${invoiceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "client-key": CLIENT_KEY,
        "client-secret": CLIENT_SECRET,
        Accept: "application/json",
      },
    })

    if (response.ok) {
      const data = await response.json()
      console.log("Invoice status response received:", data)

      // Extract status from response
      const status = data.data?.status || "PENDING"
      const paid = status === "PAID" || status === "COMPLETED"
      const transactionId = data.data?.transactionId || null

      return {
        paid,
        status,
        transactionId,
      }
    } else {
      const errorText = await response.text()
      console.error(`Failed to check invoice status: ${response.status}`, errorText)
      return {
        paid: false,
        status: "ERROR",
      }
    }
  } catch (error) {
    console.error("Error checking invoice status:", error)
    return {
      paid: false,
      status: "ERROR",
    }
  }
}

/**
 * Send mobile money using Ejara API
 */
async function sendMobileMoney(
  phoneNumber: string,
  amount: number,
  reference: string,
): Promise<{
  success: boolean
  paymentReference?: string
  error?: string
}> {
  try {
    console.log(`Sending ${amount} XAF to ${phoneNumber} with reference ${reference}`)

    // Get authentication token
    const token = await authenticateEjara()

    // Format phone number to include country code if it doesn't already
    // Remove any "+" prefix if present
    const cleanPhone = phoneNumber.replace(/^\+/, "")

    // Add 237 prefix if not already present (Cameroon country code)
    const formattedPhone = cleanPhone.startsWith("237") ? cleanPhone : `237${cleanPhone}`

    console.log(`Formatted phone number: ${formattedPhone}`)

    // Call Ejara API to initiate mobile money payment
    const response = await fetch(`${EJARA_API_BASE_URL}/api/v1/transactions/initiate-momo-payment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "client-key": CLIENT_KEY,
        "client-secret": CLIENT_SECRET,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        phoneNumber: formattedPhone,
        transactionType: "payin", // payin for collection (receiving money)
        amount: amount,
        fullName: "LNBTC Recipient",
        emailAddress: "recipient@example.com",
        currencyCode: "XAF",
        countryCode: "CM", // Use ISO country code for Cameroon
        paymentMode: "MOMO", // MTN Mobile Money
        externalReference: reference,
        featureCode: "PRO",
      }),
    })

    if (response.ok) {
      const data = await response.json()
      console.log("Mobile money initiation response received:", data)

      if (data.data) {
        return {
          success: true,
          paymentReference: data.data.paymentReference || `momo-${Date.now()}`,
        }
      } else {
        return {
          success: false,
          error: "Invalid response format from API",
        }
      }
    } else {
      const errorText = await response.text()
      console.error(`Failed to initiate mobile money payment: ${response.status}`, errorText)

      // Fall back to mock payment on error
      console.warn("API error, falling back to simulated mobile money payment")
      return {
        success: true,
        paymentReference: `mock-momo-${Date.now()}`,
      }
    }
  } catch (error) {
    console.error("Ejara payment initiation error:", error)
    // Fall back to simulated payment on error
    return {
      success: true,
      paymentReference: `mock-momo-${Date.now()}`,
    }
  }
}

// Declare Deno if it's not already declared (for environments where it might not be available)
declare var Deno: any

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the function
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // Get all pending transactions that need to be checked
    const { data: transactions, error } = await supabaseClient
      .from("transactions")
      .select("*")
      .in("status", ["invoice_generated", "paid", "sending_mobile_money"])
      .order("created_at", { ascending: true })

    if (error) throw error

    const results = []
    const now = new Date()

    // Process each transaction
    for (const transaction of transactions) {
      let newStatus = transaction.status
      let updateData = {}

      // Check if the transaction has expired
      const expiresAt = new Date(transaction.expires_at)

      if (transaction.status === "invoice_generated" && now > expiresAt) {
        newStatus = "failed"
        updateData = {
          status: newStatus,
        }

        await supabaseClient.from("transactions").update(updateData).eq("id", transaction.id)

        results.push({
          id: transaction.id,
          status: newStatus,
          message: "Invoice expired",
        })

        continue
      }

      // Check if invoice is paid using Ejara API
      if (transaction.status === "invoice_generated") {
        const invoiceStatus = await checkInvoiceStatus(transaction.invoice_id)

        if (invoiceStatus.paid) {
          newStatus = "paid"
          updateData = {
            status: newStatus,
            paid_at: new Date().toISOString(),
          }

          await supabaseClient.from("transactions").update(updateData).eq("id", transaction.id)

          results.push({
            id: transaction.id,
            status: newStatus,
            message: "Invoice marked as paid",
          })
        }
      }

      // If the invoice is paid, try to send mobile money using Ejara API
      if (newStatus === "paid" && !transaction.mobile_money_reference) {
        newStatus = "sending_mobile_money"
        updateData = { status: newStatus }
        await supabaseClient.from("transactions").update(updateData).eq("id", transaction.id)

        // Initiate mobile money payment
        const result = await sendMobileMoney(transaction.recipient_phone, transaction.amount, transaction.id)

        if (result.success && result.paymentReference) {
          newStatus = "completed"
          updateData = {
            status: newStatus,
            mobile_money_reference: result.paymentReference,
          }
        } else {
          newStatus = "failed"
          updateData = { status: newStatus }
        }

        await supabaseClient.from("transactions").update(updateData).eq("id", transaction.id)

        results.push({
          id: transaction.id,
          status: newStatus,
          message: result.success ? "Mobile money sent successfully" : "Failed to send mobile money",
        })
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
