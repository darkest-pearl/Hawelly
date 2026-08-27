import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/auth/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hawelly",
  description: "Staff-managed cross-border transfer coordination"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
