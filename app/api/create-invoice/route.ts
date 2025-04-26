import { NextResponse } from "next/server"
import { generateLightningInvoice, sendMobileMoney } from "@/lib/ejara-api"
import { getNetworks } from "@/lib/data"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { amount, phone, networkId } = body

    // Validate required fields
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 })
    }
    if (!amount) {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 })
    }

    // Generate unique reference for this transaction
    const reference = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Initiate mobile money payment
    const momoResult = await sendMobileMoney({
      phoneNumber: phone, // Match the field name from the form
      amount: Number(amount),
      reference,
    })

    if (!momoResult.success) {
      return NextResponse.json(
        { error: momoResult.error || "Failed to initiate mobile money payment" },
        { status: 400 }
      )
    }

    // Generate Lightning invoice for the payment
    const invoice = await generateLightningInvoice(Number(amount))

    return NextResponse.json({
      success: true,
      invoiceId: invoice.invoiceId,
      invoiceString: invoice.invoiceString,
      paymentReference: momoResult.paymentReference,
      expiresAt: invoice.expiresAt,
    })
  } catch (error) {
    console.error("Error creating invoice:", error)
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    )
  }
}
