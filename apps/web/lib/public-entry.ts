export const publicLinks = {
  brand: "/",
  transfers: "/sender",
  recipients: "/sender/recipients",
  support: "/support",
  staff: "/staff",
  admin: "/admin",
  signIn: "/sign-in?next=%2Fsender",
  createAccount: "/register?next=%2Fsender%2Fnew-transfer",
  requestTransfer: "/sign-in?next=%2Fsender%2Fnew-transfer"
} as const;
