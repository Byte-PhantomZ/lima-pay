import { NextResponse } from "next/server"
import { generateLightningInvoice, sendMobileMoney } from "@/lib/ejara-api"
import { getServerClient } from "@/lib/supabase"
import type { TransactionStatus } from "@/lib/types"

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

    const supabase = getServerClient()

    // Generate Lightning invoice for the payment
    const invoice = await generateLightningInvoice(Number(amount))

    // Create transaction record
    const { data: transaction, error: insertError } = await supabase
      .from("transactions")
      .insert({
        recipient_phone: phone,
        network_id: networkId,
        amount: Number(amount),
        amount_btc: invoice.amountBtc,
        invoice_id: invoice.invoiceId,
        invoice_string: invoice.invoiceString,
        expires_at: invoice.expiresAt,
        status: "invoice_generated" as TransactionStatus,
      })
      .select()
      .single()

    if (insertError || !transaction) {
      console.error("Error creating transaction:", insertError)
      return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
      invoiceId: invoice.invoiceId,
      invoiceString: invoice.invoiceString,
      expiresAt: invoice.expiresAt,
      isMock: invoice.isMock
    })
  } catch (error) {
    console.error("Error creating invoice:", error)
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    )
  }
}
