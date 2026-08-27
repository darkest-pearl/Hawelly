export type TransferTone = "info" | "warning" | "review" | "success" | "neutral";

export interface OperationsTransfer {
  reference: string;
  sender: string;
  route: string;
  amount: string;
  status: string;
  tone: TransferTone;
  owner: string;
  due: string;
  created: string;
  sourceCountry: string;
  destinationCountry: string;
  payoutMethod: string;
}

export const operationsTransfers: OperationsTransfer[] = [
  { reference: "HW-24018", sender: "Rahman Ltd.", route: "GB → PK", amount: "GBP 12,450.00", status: "New request", tone: "info", owner: "Nadia Khan", due: "—", created: "12 May 2026, 09:42", sourceCountry: "United Kingdom", destinationCountry: "Pakistan", payoutMethod: "Bank transfer" },
  { reference: "HW-24017", sender: "Patel Exports", route: "AE → IN", amount: "AED 18,750.00", status: "Quote due", tone: "warning", owner: "Arjun Mehta", due: "2h 15m", created: "12 May 2026, 09:18", sourceCountry: "United Arab Emirates", destinationCountry: "India", payoutMethod: "Bank transfer" },
  { reference: "HW-24016", sender: "Greenfield GmbH", route: "DE → TR", amount: "EUR 22,300.00", status: "Funding review", tone: "review", owner: "Samira Ali", due: "4h 40m", created: "12 May 2026, 08:54", sourceCountry: "Germany", destinationCountry: "Türkiye", payoutMethod: "Bank transfer" },
  { reference: "HW-24015", sender: "Global Traders", route: "US → MX", amount: "USD 9,850.00", status: "Payout", tone: "success", owner: "Liam O’Connor", due: "—", created: "12 May 2026, 08:41", sourceCountry: "United States", destinationCountry: "Mexico", payoutMethod: "Cash pickup" },
  { reference: "HW-24014", sender: "Sunrise Holdings", route: "SG → ID", amount: "SGD 15,600.00", status: "On hold", tone: "neutral", owner: "Nadia Khan", due: "—", created: "12 May 2026, 08:12", sourceCountry: "Singapore", destinationCountry: "Indonesia", payoutMethod: "Bank transfer" },
  { reference: "HW-24013", sender: "Al Noor FZCO", route: "AE → EG", amount: "AED 7,200.00", status: "Quote due", tone: "warning", owner: "Arjun Mehta", due: "6h 10m", created: "12 May 2026, 07:58", sourceCountry: "United Arab Emirates", destinationCountry: "Egypt", payoutMethod: "Cash pickup" }
];

export const senderTransfers = [
  { reference: "HW-24017", sent: "AED 1,200.00", received: "PHP 18,472.10", status: "Funding", tone: "info" as const, expected: "28 Aug" },
  { reference: "HW-24016", sent: "AED 3,000.00", received: "PHP 46,365.30", status: "Payout", tone: "info" as const, expected: "27 Aug" },
  { reference: "HW-24015", sent: "AED 750.00", received: "PHP 11,456.80", status: "Complete", tone: "success" as const, expected: "25 Aug" }
];
