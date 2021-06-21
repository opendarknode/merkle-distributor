import { BigNumber, utils } from "ethers";
import BalanceTree from "./balance-tree";

const { isAddress, getAddress } = utils;

// This is the blob that gets distributed and pinned to IPFS.
// It is completely sufficient for recreating the entire merkle tree.
// Anyone can verify that all air drops are included in the tree,
// and the tree has no additional distributions.
interface MerkleDistributorInfo {
    merkleRoot: string;
    claims: MerkleClaim;
}

export interface MerkleClaim {
    [account: string]: {
        points: string;
        proof: string[];
    };
}

export type Balance = { account: string; points: BigNumber };

export function parseBalanceMap(balances: Balance[]): MerkleDistributorInfo {
    // Use checksummed token and account
    const parsedBalances = balances.map(({ account, points }) => {
        if (!isAddress(account)) {
            throw new Error(`Found invalid account address: ${account}`);
        }
        const parsedAccount = getAddress(account);

        if (points.lte(0)) throw new Error(`Invalid points for account: ${account}`);

        return { account: parsedAccount, points };
    });

    // Construct a tree from parsedSorted
    const tree = new BalanceTree(parsedBalances);

    // Generate claims for each token
    const claims = parsedBalances.reduce<MerkleClaim>((memo, { account, points }) => {
        const claim: MerkleClaim = {
            [account]: {
                points: points.toHexString(),
                proof: tree.getProof(account, points),
            },
        };

        if (!memo) {
            memo = claim;
            return memo;
        }

        if (memo[account]) {
            throw new Error(`Duplicate account: ${account}`);
        }

        memo = Object.assign({}, memo, claim);
        return memo;
    }, {});

    return {
        merkleRoot: tree.getHexRoot(),
        claims,
    };
}
