import { FC, useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Button,
  Grid,
  TextField,
  Typography,
  Box,
  Stack,
  Link,
} from "@mui/material";
import {
  executeSwap,
  estimateSwap,
  tokenSwapProgram,
  getTokenSwapInfo,
  getMintInfo,
  getTokenAccountInfo,
} from "rly-js";
import { PublicKey } from "@solana/web3.js";
import { EXPLORER_ROOT, NETWORK } from "../config";
import { AnchorProvider as Provider, Wallet } from "@project-serum/anchor";
import BN from "bn.js";
import { getAssociatedTokenAddress, baseToDec, decToBase } from "../utils";

const ExecuteTbcSwap: FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet() as unknown as Wallet;
  const provider = new Provider(connection, wallet, {});

  type defaultSwapValues = {
    tokenSwapInfo: string;
    tokenA: string;
    tokenB: string;
    amountIn: number;
    amountOut: number;
  };

  type swapResponse = {
    tx: string | null;
  };

  const defaultSwapValues = {
    tokenSwapInfo: "",
    tokenA: "",
    tokenB: "",
    amountIn: 0,
    amountOut: 0,
  } as defaultSwapValues;

  const defaultSwapResponse = {} as swapResponse;

  const [formValues, setFormValues] = useState(defaultSwapValues);
  const [estimateOut, setEstimateOut] = useState(0);
  const [swapResponseValues, setSwapResponseValues] =
    useState(defaultSwapResponse);

  const generateSwapValues = async () => {
    const { tokenSwapInfo, tokenA, tokenB, amountIn, amountOut } = formValues;

    const tokenSwapInfoPubKey = new PublicKey(tokenSwapInfo);
    const tokenAPubKey = new PublicKey(tokenA);
    const tokenBPubKey = new PublicKey(tokenB);

    //convert amount to proper units

    const { decimals: tokenADecimals } = await getMintInfo({
      tokenMint: tokenAPubKey,
      connection,
    });
    const { decimals: tokenBDecimals } = await getMintInfo({
      tokenMint: tokenBPubKey,
      connection,
    });

    const amountInBN = baseToDec(new BN(amountIn), new BN(tokenADecimals));
    const amountOutBN = baseToDec(new BN(amountOut), new BN(tokenBDecimals));

    const tokenSwap = await tokenSwapProgram(provider);
    const { feeAccount, tokenAccountA, tokenAccountB, poolToken } =
      await getTokenSwapInfo(
        provider.connection,
        tokenSwapInfoPubKey,
        tokenSwap.programId
      );
    const callerTokenAAccount = await getAssociatedTokenAddress(
      tokenAPubKey,
      wallet.publicKey
    );
    const callerTokenBAccount = await getAssociatedTokenAddress(
      tokenBPubKey,
      wallet.publicKey
    );

    return {
      tokenSwap,
      tokenSwapInfoPubKey,
      amountInBN,
      amountOutBN,
      callerTokenAAccount,
      callerTokenBAccount,
      poolToken,
      feeAccount,
      tokenAccountA,
      tokenAccountB,
      tokenADecimals,
      tokenBDecimals,
    };
  };

  const estimateSwapValues = async () => {
    const {
      tokenSwap,
      tokenSwapInfoPubKey,
      amountInBN,
      amountOutBN,
      callerTokenAAccount,
      callerTokenBAccount,
      poolToken,
      feeAccount,
      tokenAccountA,
      tokenAccountB,
      tokenADecimals,
      tokenBDecimals,
    } = await generateSwapValues();

    const tokenAAccountInfo = await getTokenAccountInfo(
      connection,
      callerTokenAAccount
    );
    const tokenBAccountInfo = await getTokenAccountInfo(
      connection,
      callerTokenBAccount
    );
    try {
      const { amountTokenAPostSwap, amountTokenBPostSwap } = await estimateSwap(
        {
          tokenSwap,
          tokenSwapInfo: tokenSwapInfoPubKey,
          amountIn: amountInBN,
          amountOut: amountOutBN,
          userTransferAuthority: wallet.publicKey,
          userSourceTokenAccount: callerTokenAAccount,
          userDestinationTokenAccount: callerTokenBAccount,
          swapSourceTokenAccount: tokenAccountA,
          swapDestinationTokenAccount: tokenAccountB,
          poolMintAccount: poolToken,
          poolFeeAccount: feeAccount,
          walletPubKey: wallet.publicKey,
          connection,
        }
      );

      console.log(tokenBAccountInfo.amount.toString());

      //console.log(amountTokenAPostSwap.toString())
      console.log(amountTokenBPostSwap.toString());

      return {
        amountA: decToBase(
          new BN(tokenAAccountInfo.amount).sub(new BN(amountTokenAPostSwap)),
          new BN(tokenADecimals)
        ),
        amountB: decToBase(
          new BN(amountTokenBPostSwap).sub(new BN(tokenBAccountInfo.amount)),
          new BN(tokenBDecimals)
        ),
      };
    } catch (error) {
      console.log(error);
      console.log("invalid amounts");
      return {
        amountA: decToBase(amountInBN, new BN(tokenADecimals)),
        amountB: decToBase(amountOutBN, new BN(tokenBDecimals)),
      };
    }
  };

  useEffect(() => {
    const estimate = async () => {
      const { amountB } = await estimateSwapValues();
      console.log(amountB);
      setEstimateOut(Number(amountB));
    };
    if (wallet.publicKey && formValues.amountIn > 0) {
      estimate();
    }
  }, [formValues.amountIn]);

  const handleInputChange = async (e: any) => {
    const { name, value } = e.target;
    setFormValues({
      ...formValues,
      [name]: value,
    });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!wallet.publicKey) {
      console.log("wallet not active");
    } else {
      const {
        tokenSwap,
        tokenSwapInfoPubKey,
        amountInBN,
        amountOutBN,
        callerTokenAAccount,
        callerTokenBAccount,
        poolToken,
        feeAccount,
        tokenAccountA,
        tokenAccountB,
        tokenADecimals,
        tokenBDecimals,
      } = await generateSwapValues();

      const result = await executeSwap({
        tokenSwap,
        tokenSwapInfo: tokenSwapInfoPubKey,
        amountIn: amountInBN,
        amountOut: amountOutBN,
        userTransferAuthority: wallet.publicKey,
        userSourceTokenAccount: callerTokenAAccount,
        userDestinationTokenAccount: callerTokenBAccount,
        swapSourceTokenAccount: tokenAccountA,
        swapDestinationTokenAccount: tokenAccountB,
        poolMintAccount: poolToken,
        poolFeeAccount: feeAccount,
        wallet,
        connection,
      });

      setSwapResponseValues({ tx: result });
    }
  };

  return (
    <Box component="form" noValidate onSubmit={handleSubmit} sx={{ mt: 6 }}>
      <Typography variant="h6" gutterBottom>
        Execute Swap
      </Typography>

      <Grid container spacing={3} maxWidth="sm">
        <Grid item xs={12} sm={12}>
          <TextField
            required
            id="tokenSwapInfo"
            name="tokenSwapInfo"
            label="Swap Id"
            value={formValues.tokenSwapInfo}
            onChange={handleInputChange}
            fullWidth
            variant="standard"
          />
        </Grid>
        <Grid item xs={12} sm={12}>
          <TextField
            required
            id="tokenA"
            name="tokenA"
            label="token A"
            fullWidth
            variant="standard"
            value={formValues.tokenA}
            onChange={handleInputChange}
          />
        </Grid>
        <Grid item xs={12} sm={12}>
          <TextField
            required
            id="tokenB"
            name="tokenB"
            label="Token B"
            fullWidth
            variant="standard"
            value={formValues.tokenB}
            onChange={handleInputChange}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            required
            id="amountIn"
            name="amountIn"
            label="Amount In"
            fullWidth
            variant="standard"
            value={formValues.amountIn}
            onChange={handleInputChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            id="amountOut"
            name="amountOut"
            label="Amount Out"
            fullWidth
            variant="standard"
            value={estimateOut}
          />
        </Grid>
      </Grid>
      <Button
        variant="contained"
        color="primary"
        type="submit"
        sx={{ mt: 3, mb: 2 }}
      >
        Swap
      </Button>
      {swapResponseValues.tx != null && (
        <Stack spacing={1}>
          <Typography variant="body1" color="text.secondary">
            {`swap successfully executed!`}
            <Link
              href={`${EXPLORER_ROOT}/tx/${swapResponseValues.tx}?cluster=${NETWORK}`}
              target="_blank"
            >
              {" "}
              (view transaction)
            </Link>
          </Typography>
        </Stack>
      )}
    </Box>
  );
};

export default ExecuteTbcSwap;
