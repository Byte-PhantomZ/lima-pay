export interface MobileNetwork {
  id: number
  name: string
  code: string
  country: string
}

export interface Transaction {
  id: string
  status: TransactionStatus
  recipient_phone: string
  network_id: number
  amount: number
  amount_btc?: number
  invoice_id?: string
  invoice_string?: string
  payment_request?: string
  expires_at?: string
  paid_at?: string
  mobile_money_reference?: string
  created_at: string
  updated_at: string
}

export type TransactionStatus =
  | "pending"
  | "invoice_generated"
  | "paid"
  | "sending_mobile_money"
  | "completed"
  | "failed"

export interface PaymentFormData {
  phone: string
  networkId: number
  amount: number
}
