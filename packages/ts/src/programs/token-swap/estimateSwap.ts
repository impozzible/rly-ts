import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, web3, BN } from "@project-serum/anchor";
import { accountInfoFromSim, simulateTransaction } from "../..";

const { PublicKey, Transaction } = web3;

interface estimateSwapParams {
  tokenSwap: Program;
  tokenSwapInfo: web3.PublicKey;
  amountIn: BN;
  amountOut: BN;
  userTransferAuthority: web3.PublicKey;
  userSourceTokenAccount: web3.PublicKey;
  userDestinationTokenAccount: web3.PublicKey;
  swapSourceTokenAccount: web3.PublicKey;
  swapDestinationTokenAccount: web3.PublicKey;
  poolMintAccount: web3.PublicKey;
  poolFeeAccount: web3.PublicKey;
  walletPubKey: web3.PublicKey;
  connection: web3.Connection;
}

export const estimateSwap = async (
  {
    tokenSwap,
    tokenSwapInfo,
    amountIn,
    amountOut,
    userTransferAuthority,
    userSourceTokenAccount,
    userDestinationTokenAccount,
    swapSourceTokenAccount,
    swapDestinationTokenAccount,
    poolMintAccount,
    poolFeeAccount,
    walletPubKey,
    connection,
  } = {} as estimateSwapParams
) => {
  // get exepcted swap authority PDA

  const [expectedSwapAuthorityPDA] = await PublicKey.findProgramAddress(
    [tokenSwapInfo.toBuffer()],
    tokenSwap.programId
  );

  const Ix = await tokenSwap.instruction.swap(amountIn, amountOut, {
    accounts: {
      tokenSwap: tokenSwapInfo,
      swapAuthority: expectedSwapAuthorityPDA,
      userTransferAuthority,
      source: userSourceTokenAccount,
      destination: userDestinationTokenAccount,
      swapSource: swapSourceTokenAccount,
      swapDestination: swapDestinationTokenAccount,
      poolMint: poolMintAccount,
      poolFee: poolFeeAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });

  const tx = new Transaction();
  tx.add(Ix);

  //simulate transaction return simulated state change for userSourceTokenAccount and userDestinationTokenAccount

  const {
    value: { err, logs, accounts },
  } = await simulateTransaction(
    tx,
    walletPubKey,
    connection,
    { commitment: "finalized", preflightCommitment: "finalized" },
    [userSourceTokenAccount, userDestinationTokenAccount]
  );
  if (err) {
    throw { message: "tx simulation error", err, logs };
  } else {
    const accountAInfo = await accountInfoFromSim(accounts[0]);
    const accountBInfo = await accountInfoFromSim(accounts[1]);
    return {
      amountTokenAPostSwap: accountAInfo.amount,
      amountTokenBPostSwap: accountBInfo.amount,
    };
  }
};
