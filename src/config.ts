// Env config. Devnet by default — no real money until SOLANA_RPC_URL /
// USDC_MINT are switched to mainnet values on purpose.
export const config = {
  port: Number(process.env.PORT ?? 8080),
  rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  // Circle devnet USDC mint. Mainnet USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  usdcMint: process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  treasury: process.env.TREASURY_ADDRESS ?? "",
  feeUsdc: Number(process.env.FEE_USDC ?? 0.05),
  coingeckoBase: "https://api.coingecko.com/api/v3",
};
