import MerkleTree from "./merkle-tree";
import { BigNumber, utils } from "ethers";

export default class BalanceTree {
    private readonly tree: MerkleTree;
    constructor(balances: { account: string; token: string; earnings: BigNumber }[]) {
        this.tree = new MerkleTree(
            balances.map(({ account, earnings, token }) => {
                return BalanceTree.toNode(account, token, earnings);
            })
        );
    }

    public static verifyProof(
        account: string,
        token: string,
        earnings: BigNumber,
        proof: Buffer[],
        root: Buffer
    ): boolean {
        let pair = BalanceTree.toNode(account, token, earnings);
        for (const item of proof) {
            pair = MerkleTree.combinedHash(pair, item);
        }

        return pair.equals(root);
    }

    // keccak256(abi.encode(index, account, earnings))
    public static toNode(account: string, token: string, earnings: BigNumber): Buffer {
        return Buffer.from(
            utils.solidityKeccak256(["address", "address", "uint256"], [account, token, earnings]).substr(2),
            "hex"
        );
    }

    public getHexRoot(): string {
        return this.tree.getHexRoot();
    }

    // returns the hex bytes32 values of the proof
    public getProof(account: string, token: string, earnings: BigNumber): string[] {
        return this.tree.getHexProof(BalanceTree.toNode(account, token, earnings));
    }
}
