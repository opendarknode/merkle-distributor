import MerkleTree from "./merkle-tree";
import { BigNumber, utils } from "ethers";

export default class BalanceTree {
    private readonly tree: MerkleTree;
    constructor(balances: { account: string; points: BigNumber }[]) {
        this.tree = new MerkleTree(
            balances.map(({ account, points }) => {
                return BalanceTree.toNode(account, points);
            })
        );
    }

    public static verifyProof(account: string, points: BigNumber, proof: Buffer[], root: Buffer): boolean {
        let pair = BalanceTree.toNode(account, points);
        for (const item of proof) {
            pair = MerkleTree.combinedHash(pair, item);
        }

        return pair.equals(root);
    }

    // keccak256(abi.encodePacked(account, _points));
    public static toNode(account: string, points: BigNumber): Buffer {
        return Buffer.from(utils.solidityKeccak256(["address", "uint256"], [account, points]).substr(2), "hex");
    }

    public getHexRoot(): string {
        return this.tree.getHexRoot();
    }

    // returns the hex bytes32 values of the proof
    public getProof(account: string, points: BigNumber): string[] {
        return this.tree.getHexProof(BalanceTree.toNode(account, points));
    }
}
