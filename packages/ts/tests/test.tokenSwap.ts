
import assert from 'assert';

import { web3, Provider, BN } from "@project-serum/anchor"
import { NodeWallet } from "@metaplex/js";
import { initializeLinearPriceCurve, executeSwap, estimateSwap, tokenSwapProgram, Numberu64, getTokenSwapInfo } from "rly-js";

//import { initializeLinearPriceCurve, executeSwap, estimateSwap, tokenSwapProgram, Numberu64, getTokenSwapInfo } from "../src";

import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
const { Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL, PublicKey } = web3;

describe('token swap', () => {

    let provider;
    let wallet;
    let connection;
    let tokenA;
    let tokenB;
    let tokenSwapInfo;
    let slopeNumerator;
    let slopeDenominator;
    let initialTokenAPriceNumerator;
    let initialTokenAPriceDenominator;
    let feeAccount;
    let poolToken;
    let tokenATokenAccount;
    let tokenBTokenAccount;
    let callerTokenAAccount;
    let callerTokenBAccount;
    let tokenBAdmin;
    let tokenBAdminTokenAccount;
    let tokenAAdminTokenAccount;
    const initialTokenBLiquidity = new BN('16000000000000000000');
    const initialTokenALiquidity = new BN(10000 * 10 ** 8);
    const swapInitAmountTokenA = new BN(2400 * 10 ** 8);
    const decimals = 8

    before(async () => {
        const walletKeyPair = Keypair.generate();
        tokenBAdmin = Keypair.generate();
        tokenSwapInfo = Keypair.generate();
        provider = new Provider(new Connection(clusterApiUrl("devnet")), new NodeWallet(walletKeyPair), {});
        ({ connection, wallet } = provider);
        const { payer } = wallet;
        await connection.confirmTransaction(await connection.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL))

        tokenA = await Token.createMint(
            connection,
            payer,
            payer.publicKey,
            null,
            decimals,
            TOKEN_PROGRAM_ID
        );


        tokenB = await Token.createMint(
            connection,
            payer,
            payer.publicKey,
            null,
            decimals,
            TOKEN_PROGRAM_ID
        );

        callerTokenAAccount = await tokenA.createAssociatedTokenAccount(payer.publicKey);
        callerTokenBAccount = await tokenB.createAssociatedTokenAccount(payer.publicKey);
        tokenBAdminTokenAccount = await tokenB.createAssociatedTokenAccount(tokenBAdmin.publicKey);
        tokenAAdminTokenAccount = await tokenA.createAssociatedTokenAccount(tokenBAdmin.publicKey);
        await tokenB.mintTo(callerTokenBAccount, payer, [], Numberu64.fromBuffer(initialTokenBLiquidity.toBuffer()));
        await tokenB.mintTo(tokenBAdminTokenAccount, payer, [], Numberu64.fromBuffer(initialTokenBLiquidity.toBuffer()));
        await tokenA.mintTo(callerTokenAAccount, payer, [], initialTokenALiquidity.toNumber());
        await tokenA.mintTo(tokenAAdminTokenAccount, payer, [], initialTokenALiquidity.toNumber());


    })

    it('it should get an instance of the token swap program', async () => {

        const programName = 'token_bonding_curve';
        const { idl } = await tokenSwapProgram(provider);
        assert.strictEqual(idl.name, programName);

    })


    it('it should initiliaze a linear price curve', async () => {

        const { payer } = wallet

        const adminOwner = Keypair.generate();

        slopeNumerator = new BN(1);
        slopeDenominator = new BN(200000000);
        initialTokenAPriceNumerator = new BN(150);
        initialTokenAPriceDenominator = new BN(3);

        const tokenSwap = await tokenSwapProgram(provider);
        const poolTokenDecimals = 9;


        const { tx, destinationAccount } = await initializeLinearPriceCurve({
            tokenSwap,
            slopeNumerator,
            slopeDenominator,
            initialTokenAPriceNumerator,
            initialTokenAPriceDenominator,
            callerTokenBAccount: tokenBAdminTokenAccount,
            tokenSwapInfo,
            tokenA: tokenA.publicKey,
            tokenB: tokenB.publicKey,
            poolTokenDecimals,
            wallet,
            connection,
            initialTokenBLiquidity
        },

            {
                callerTokenBAccountOwner: new NodeWallet(tokenBAdmin),
                adminAccountOwner: adminOwner.publicKey
            }
        )

        await connection.confirmTransaction(tx);

        const data = await getTokenSwapInfo(provider, tokenSwapInfo.publicKey, tokenSwap.programId);
        poolToken = new Token(connection, data.poolToken, TOKEN_PROGRAM_ID, payer)
        feeAccount = data.feeAccount;
        tokenATokenAccount = data.tokenAccountA;
        tokenBTokenAccount = data.tokenAccountB;
        const { amount: feeAmount } = await poolToken.getAccountInfo(feeAccount);
        const { amount: destinationAmount } = await poolToken.getAccountInfo(destinationAccount.publicKey)

        assert.ok(feeAmount.eq(new BN(0)));
        assert.ok(destinationAmount.eq(new BN(10 * 10 ** 8)));

    })


    it('it should estimate the result of a token swap', async () => {

        const tokenSwap = await tokenSwapProgram(provider);
        const amountOut = new BN(0)

        const { amountTokenAPostSwap, amountTokenBPostSwap } = await estimateSwap({
            tokenSwap,
            tokenSwapInfo: tokenSwapInfo.publicKey,
            amountIn: swapInitAmountTokenA,
            amountOut,
            userTransferAuthority: tokenBAdmin.publicKey,
            userSourceTokenAccount: tokenAAdminTokenAccount,
            userDestinationTokenAccount: tokenBAdminTokenAccount,
            swapSourceTokenAccount: tokenATokenAccount,
            swapDestinationTokenAccount: tokenBTokenAccount,
            poolMintAccount: poolToken.publicKey,
            poolFeeAccount: feeAccount,
            wallet,
            connection
        })

        assert.ok(amountTokenAPostSwap.eq(new BN(760000000000)));
        assert.ok(amountTokenBPostSwap.eq(new BN(4000000000)));

    })

    it('it should execute a swap on a linear price curve', async () => {

        const tokenSwap = await tokenSwapProgram(provider);
        const amountOut = new BN(0)

        const tx = await executeSwap({
            tokenSwap,
            tokenSwapInfo: tokenSwapInfo.publicKey,
            amountIn: swapInitAmountTokenA,
            amountOut,
            userTransferAuthority: tokenBAdmin.publicKey,
            userSourceTokenAccount: tokenAAdminTokenAccount,
            userDestinationTokenAccount: tokenBAdminTokenAccount,
            swapSourceTokenAccount: tokenATokenAccount,
            swapDestinationTokenAccount: tokenBTokenAccount,
            poolMintAccount: poolToken.publicKey,
            poolFeeAccount: feeAccount,
            wallet,
            connection
        },
            { userTransferAuthorityOwner: new NodeWallet(tokenBAdmin) }
        )

        await connection.confirmTransaction(tx)

        const usertokenAInfo = await tokenA.getAccountInfo(tokenAAdminTokenAccount);
        const usertokenBInfo = await tokenB.getAccountInfo(tokenBAdminTokenAccount);
        const swapTokenAInfo = await tokenA.getAccountInfo(tokenATokenAccount);
        const swapTokenBInfo = await tokenB.getAccountInfo(tokenBTokenAccount);

        assert.ok(usertokenAInfo.amount.eq(new BN(760000000000)));
        assert.ok(usertokenBInfo.amount.eq(new BN(4000000000)));
        assert.ok(swapTokenAInfo.amount.eq(new BN(240000000000)));
        assert.ok(swapTokenBInfo.amount.eq(new BN('70872530412510')));
    })

    it('it should estimate the reverse of a token swap', async () => {

        const tokenSwap = await tokenSwapProgram(provider);
        const amountOut = new BN(0)

        const { amountTokenAPostSwap: userSourceTokenAmount, amountTokenBPostSwap: userDestinationTokenAmount } = await estimateSwap({
            tokenSwap,
            tokenSwapInfo: tokenSwapInfo.publicKey,
            amountIn: new BN(20 * 10 ** 8),
            amountOut,
            userTransferAuthority: tokenBAdmin.publicKey,
            userSourceTokenAccount: tokenBAdminTokenAccount,
            userDestinationTokenAccount: tokenAAdminTokenAccount,
            swapSourceTokenAccount: tokenBTokenAccount,
            swapDestinationTokenAccount: tokenATokenAccount,
            poolMintAccount: poolToken.publicKey,
            poolFeeAccount: feeAccount,
            wallet,
            connection
        })

        assert.ok(userDestinationTokenAmount.eq(new BN(890000000000)));
        assert.ok(userSourceTokenAmount.eq(new BN(2000000000)));

    })



    it('it should swap back on a linear price curve', async () => {

        const tokenSwap = await tokenSwapProgram(provider);
        const amountOut = new BN(0)

        const tx = await executeSwap({
            tokenSwap,
            tokenSwapInfo: tokenSwapInfo.publicKey,
            amountIn: new BN(20 * 10 ** 8),
            amountOut,
            userTransferAuthority: tokenBAdmin.publicKey,
            userSourceTokenAccount: tokenBAdminTokenAccount,
            userDestinationTokenAccount: tokenAAdminTokenAccount,
            swapSourceTokenAccount: tokenBTokenAccount,
            swapDestinationTokenAccount: tokenATokenAccount,
            poolMintAccount: poolToken.publicKey,
            poolFeeAccount: feeAccount,
            wallet,
            connection
        },
            { userTransferAuthorityOwner: new NodeWallet(tokenBAdmin) }
        )

        await connection.confirmTransaction(tx)

        const usertokenAInfo = await tokenA.getAccountInfo(tokenAAdminTokenAccount);
        const usertokenBInfo = await tokenB.getAccountInfo(tokenBAdminTokenAccount);
        const swapTokenAInfo = await tokenA.getAccountInfo(tokenATokenAccount);
        const swapTokenBInfo = await tokenB.getAccountInfo(tokenBTokenAccount);

        assert.ok(usertokenAInfo.amount.eq(new BN(890000000000)));
        assert.ok(usertokenBInfo.amount.eq(new BN(2000000000)));
        assert.ok(swapTokenAInfo.amount.eq(new BN(110000000000)));
        assert.ok(swapTokenBInfo.amount.eq(new BN('70874530412510')));
    })

})



