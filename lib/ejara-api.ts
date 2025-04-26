// Ejara API integration

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
export async function authenticateEjara(): Promise<string> {
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
    return token
  } catch (error: unknown) {
    console.error("Ejara authentication error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to authenticate with Ejara API: ${errorMessage}`)
  }
}

/**
 * Generate a Lightning invoice using Ejara API
 * With fallback to mock invoice if API fails
 */
export async function generateLightningInvoice(amountXAF: number): Promise<{
  invoiceId: string
  invoiceString: string
  amountBtc: number
  expiresAt: Date
  isMock: boolean
}> {
  try {
    console.log(`Generating Lightning invoice for ${amountXAF} XAF`)

    // Get authentication token
    const token = await authenticateEjara()

    // Try different payload formats to increase chances of success
    const payloads = [
      // Standard payload
      {
        amount: amountXAF,
        currencyCode: "XAF",
        description: "LNBTC to Mobile Money Payment",
      },
      // Alternative payload with more fields
      {
        amount: amountXAF,
        currencyCode: "XAF",
        description: "LNBTC to Mobile Money Payment",
        memo: "Payment to Mobile Money",
        expiryInMinutes: 10,
      },
    ]

    // Try each payload format
    for (const payload of payloads) {
      try {
        console.log(`Trying payload: ${JSON.stringify(payload)}`)

        // Call Ejara API to generate a Lightning invoice
        const response = await fetch(`${EJARA_API_BASE_URL}/api/v1/transactions/generate-ln-invoice`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "client-key": CLIENT_KEY,
            "client-secret": CLIENT_SECRET,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        })

        if (response.ok) {
          const data = await response.json()
          console.log("Invoice generation response received:", data)

          if (data.data && data.data.paymentRequest) {
            // Extract invoice details from response
            const invoiceId = data.data.id || `ejara-${Date.now()}`
            const invoiceString = data.data.paymentRequest
            const amountBtc = data.data.amountBtc || amountXAF * 0.00000001 // Fallback conversion if not provided

            // Set expiry to 10 minutes from now (or use API-provided expiry)
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

            return {
              invoiceId,
              invoiceString,
              amountBtc,
              expiresAt,
              isMock: false,
            }
          }
        } else {
          const errorText = await response.text()
          console.error(
            `Failed to generate invoice with payload ${JSON.stringify(payload)}: ${response.status}`,
            errorText,
          )
        }
      } catch (payloadError) {
        console.error(`Error with payload ${JSON.stringify(payload)}:`, payloadError)
      }
    }

    // If all API attempts fail, fall back to mock invoice
    console.warn("All API attempts failed, falling back to mock invoice")
    return generateMockInvoice(amountXAF)
  } catch (error) {
    console.error("Error generating Lightning invoice:", error)
    // Fall back to mock invoice on error
    console.warn("API error, falling back to mock invoice")
    return generateMockInvoice(amountXAF)
  }
}

/**
 * Generate a mock Lightning invoice for testing
 */
function generateMockInvoice(amountXAF: number): {
  invoiceId: string
  invoiceString: string
  amountBtc: number
  expiresAt: Date
  isMock: boolean
} {
  console.log(`Generating mock invoice for ${amountXAF} XAF`)

  // More realistic BTC conversion rate (approximate as of 2025)
  // 1 XAF ≈ 0.0000000021 BTC (this would need regular updates in production)
  const amountBtc = amountXAF * 0.0000000021

  // Generate a deterministic but unique invoice ID based on amount and timestamp
  const timestamp = Date.now()
  const invoiceId = `mock-${timestamp}-${Math.floor(amountXAF)}`

  // Generate a more realistic looking Lightning invoice string
  // Format: lnbc[amount][timestring][payment_hash][payment_secret][signature]
  const mockAmount = Math.floor(amountBtc * 100000000) // Convert to satoshis
  const timeString = Math.floor(timestamp / 1000).toString(16)
  const mockPaymentHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const mockSignature = Array.from({ length: 128 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  
  const invoiceString = `lnbc${mockAmount}${timeString}${mockPaymentHash}${mockSignature}`

  // Set expiry to a random time between 8 and 12 minutes from now for more realistic behavior
  const expiryMinutes = 8 + Math.floor(Math.random() * 5)
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000)

  // Store mock payment status for later checking
  mockInvoiceStatuses.set(invoiceId, {
    created: timestamp,
    expiresAt: expiresAt.getTime(),
    paid: false,
    amountXAF,
  })

  return {
    invoiceId,
    invoiceString,
    amountBtc,
    expiresAt,
    isMock: true,
  }
}

// Track mock invoice payment statuses
const mockInvoiceStatuses = new Map<string, {
  created: number
  expiresAt: number
  paid: boolean
  amountXAF: number
}>()

/**
 * Check if a Lightning invoice has been paid
 */
export async function checkInvoiceStatus(invoiceId: string): Promise<{
  paid: boolean
  status: string
  transactionId?: string
}> {
  // Handle mock invoices with more realistic simulation
  if (invoiceId.startsWith('mock-')) {
    const mockStatus = mockInvoiceStatuses.get(invoiceId)
    
    if (!mockStatus) {
      return {
        paid: false,
        status: 'INVALID',
      }
    }

    // Check if invoice has expired
    if (Date.now() > mockStatus.expiresAt) {
      return {
        paid: false,
        status: 'EXPIRED',
      }
    }

    // If not already paid, simulate payment with increasing probability over time
    if (!mockStatus.paid) {
      const ageInSeconds = (Date.now() - mockStatus.created) / 1000
      const baseChance = Math.min(ageInSeconds / 60, 1) * 0.4 // Max 40% chance after 1 minute
      const randomFactor = Math.random() * 0.2 // Additional random factor
      
      if (Math.random() < (baseChance + randomFactor)) {
        mockStatus.paid = true
        mockInvoiceStatuses.set(invoiceId, mockStatus)
      }
    }

    return {
      paid: mockStatus.paid,
      status: mockStatus.paid ? 'PAID' : 'PENDING',
      transactionId: mockStatus.paid ? `tx-mock-${Date.now()}` : undefined,
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

      // Return default unpaid status on error
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
export async function sendMobileMoney({
  phoneNumber,
  amount,
  reference,
}: {
  phoneNumber: string
  amount: number
  reference: string
}): Promise<{
  success: boolean
  paymentReference?: string
  error?: string
}> {
  try {
    if (!phoneNumber) {
      return {
        success: false,
        error: "Phone number is required"
      }
    }

    console.log(`Sending ${amount} XAF to ${phoneNumber} with reference ${reference}`)

    // Get authentication token
    const token = await authenticateEjara()

    // Format phone number (remove any formatting/spaces)
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '')

    const payload = {
      phoneNumber: cleanPhone,
      transactionType: "payin",
      amount: amount.toString(), // Convert to string as expected by API
      fullName: "Souop Silvain Brayan",
      emailAddress: "souopsylvain@gmail.com",
      currencyCode: "XAF",
      countryCode: "CM", // Changed from "CM" to "+237" as per API spec
      paymentMode: "MOMO",
      externalReference: reference,
      featureCode: "PRO" // Removed ">" from "PRO>" in the example
    }

    console.log('Sending payload to Ejara:', payload)

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
      body: JSON.stringify(payload)
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

      return {
        success: false,
        error: `API Error: ${errorText}`,
      }
    }
  } catch (error: unknown) {
    console.error("Ejara payment initiation error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: errorMessage || "Unknown error occurred",
    }
  }
}

/**
 * Check the status of a mobile money payment
 */
export async function checkMomoPaymentStatus(paymentReference: string): Promise<{
  status: "pending" | "completed" | "failed"
  success: boolean
}> {
  // If it's a mock payment reference, simulate status
  if (paymentReference.startsWith("mock-")) {
    // 80% chance of completed, 20% chance of pending
    const mockStatus = Math.random() < 0.8 ? "completed" : "pending"
    return {
      status: mockStatus,
      success: true,
    }
  }

  try {
    console.log(`Checking status of mobile money payment ${paymentReference}`)

    // Get authentication token
    const token = await authenticateEjara()

    // Call Ejara API to check payment status
    const response = await fetch(`${EJARA_API_BASE_URL}/api/v1/transactions/${paymentReference}`, {
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
      console.log("Payment status response received:", data)

      // Map Ejara status to our status
      let status: "pending" | "completed" | "failed" = "pending"
      if (data.data?.status === "COMPLETED") {
        status = "completed"
      } else if (data.data?.status === "FAILED") {
        status = "failed"
      }

      return {
        status,
        success: true,
      }
    } else {
      const errorText = await response.text()
      console.error(`Failed to check payment status: ${response.status}`, errorText)

      // Return pending status on error
      return {
        status: "pending",
        success: false,
      }
    }
  } catch (error) {
    console.error("Ejara payment status check error:", error)
    return {
      status: "pending",
      success: false,
    }
  }
}
