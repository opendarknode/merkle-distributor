import "@nomiclabs/hardhat-waffle";
import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleDistributor, MerkleDistributor__factory, TestERC20, TestERC20__factory } from "../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import BalanceTree from "../src/balance-tree";
import { BigNumber } from "ethers";
import { Balance, MerkleClaim, parseBalanceMap } from "../src/parse-balance-map";
import { zeroAddress } from "ethereumjs-util";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("MerkleDistributor", () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let Distributor: MerkleDistributor__factory;
    let distributor: MerkleDistributor;
    let signers: SignerWithAddress[];
    let token1: TestERC20;
    let token2: TestERC20;
    let tree: BalanceTree;

    before(async () => {
        Distributor = ((await ethers.getContractFactory("MerkleDistributor")) as unknown) as MerkleDistributor__factory;
        signers = await ethers.getSigners();
        [alice, bob] = signers;

        let Token = ((await ethers.getContractFactory("TestERC20")) as unknown) as TestERC20__factory;
        token1 = (await Token.deploy("Token", "TKN", 0)) as TestERC20;
        token2 = (await Token.deploy("Token", "TKN", 0)) as TestERC20;
    });

    describe("merkleRoot", () => {
        it("returns the zero merkle root", async () => {
            const distributor = (await Distributor.deploy(ZERO_BYTES32)) as MerkleDistributor;
            expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32);
        });
    });

    describe("claim", () => {
        it("fails for empty proof", async () => {
            const distributor = (await Distributor.deploy(ZERO_BYTES32)) as MerkleDistributor;
            await expect(distributor.claim(token1.address, 0, 0, [], [])).to.be.revertedWith("MerkleDistributor: Invalid account proof.");
        });

        describe("two account tree", () => {
            let aggregateProof: string[];
            let aliceProof: string[];
            let bobProof: string[];

            let alicePoints = BigNumber.from(100);
            let bobPoints = BigNumber.from(200);
            let aggregatePoints = alicePoints.add(bobPoints);

            beforeEach("deploy", async () => {
                tree = new BalanceTree([
                    { account: alice.address, points: alicePoints },
                    { account: bob.address, points: bobPoints },
                    { account: zeroAddress(), points: aggregatePoints },
                ]);

                aggregateProof = tree.getProof(zeroAddress(), aggregatePoints);
                aliceProof = tree.getProof(alice.address, alicePoints);
                bobProof = tree.getProof(bob.address, bobPoints);

                distributor = (await Distributor.deploy(tree.getHexRoot())) as MerkleDistributor;
            });

            it("successful claim", async () => {
                // Alice token1
                await expect(distributor.connect(alice).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(alice.address, token1.address, alicePoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints));

                // Alice token2
                await expect(distributor.connect(alice).claim(token2.address, alicePoints, aggregatePoints, aliceProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(alice.address, token2.address, alicePoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints));

                const [aggregateToken1Claimed, aggregateToken2Claimed] = await Promise.all([
                    distributor.getClaimed(zeroAddress(), token1.address),
                    distributor.getClaimed(zeroAddress(), token2.address),
                ]);

                // Bob token1
                await expect(distributor.connect(bob).claim(token1.address, bobPoints, aggregatePoints, bobProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(
                        bob.address,
                        token1.address,
                        bobPoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateToken1Claimed))
                    );

                // Bob token2
                await expect(distributor.connect(bob).claim(token2.address, bobPoints, aggregatePoints, bobProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(
                        bob.address,
                        token2.address,
                        bobPoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateToken2Claimed))
                    );
            });

            it("sets claimed", async () => {
                expect(await distributor.getClaimed(alice.address, token1.address)).to.eq(0);
                expect(await distributor.getClaimed(bob.address, token1.address)).to.eq(0);
                expect(await distributor.getClaimed(zeroAddress(), token1.address)).to.eq(0);
                expect(await distributor.getClaimed(alice.address, token2.address)).to.eq(0);
                expect(await distributor.getClaimed(bob.address, token2.address)).to.eq(0);
                expect(await distributor.getClaimed(zeroAddress(), token2.address)).to.eq(0);
                await distributor.connect(alice).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof);
                expect(await distributor.getClaimed(alice.address, token1.address)).to.eq(alicePoints);
                expect(await distributor.getClaimed(bob.address, token1.address)).to.eq(0);
                expect(await distributor.getClaimed(zeroAddress(), token1.address)).to.eq(alicePoints);
                expect(await distributor.getClaimed(alice.address, token2.address)).to.eq(0);
                expect(await distributor.getClaimed(bob.address, token2.address)).to.eq(0);
                expect(await distributor.getClaimed(zeroAddress(), token2.address)).to.eq(0);
            });

            it("cannot allow two claims", async () => {
                await distributor.connect(alice).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof);
                await expect(
                    distributor.connect(alice).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof)
                ).to.be.revertedWith("MerkleDistributor: Nothing to claim.");
            });

            it("cannot claim for address other than proof", async () => {
                await expect(
                    distributor.connect(bob).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof)
                ).to.be.revertedWith("MerkleDistributor: Invalid account proof.");
            });

            it("cannot claim more than proof", async () => {
                await expect(
                    distributor.connect(alice).claim(token1.address, aggregatePoints, aggregatePoints, aliceProof, aggregateProof)
                ).to.be.revertedWith("MerkleDistributor: Invalid account proof.");
            });

            it("can claim updated balances", async () => {
                // Alice should be able to claim (100-0) / (300 - 0) = 33%
                let alicePercent = alicePoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints);
                expect(alicePercent).to.eq(ethers.utils.parseEther("0.333333333333333333"));

                // Alice claims token1
                await expect(distributor.connect(alice).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(alice.address, token1.address, alicePercent);

                let [aggregateClaimed, aliceClaimed] = await Promise.all([
                    distributor.getClaimed(zeroAddress(), token1.address),
                    distributor.getClaimed(alice.address, token1.address),
                ]);

                // Let Alice deposit 200. New cumulative points are 100 + (100 + 200) = 400
                alicePoints = alicePoints.add(alicePoints).add(BigNumber.from(200));
                const newAliceBalance: Balance = { account: alice.address, points: alicePoints };
                // Let Bob deposit 800. New cumulative points are 200 + (200 + 800) = 1200
                bobPoints = bobPoints.add(bobPoints).add(BigNumber.from(800));
                const newBobBalance: Balance = { account: bob.address, points: bobPoints };
                // New aggregate cumulative points are 400 + 1200 = 1600
                aggregatePoints = alicePoints.add(bobPoints);
                const newAggregateBalance: Balance = { account: zeroAddress(), points: aggregatePoints };

                tree = new BalanceTree([newAliceBalance, newBobBalance, newAggregateBalance]);
                aliceProof = tree.getProof(alice.address, alicePoints);
                bobProof = tree.getProof(bob.address, bobPoints);
                aggregateProof = tree.getProof(zeroAddress(), aggregatePoints);
                await distributor.updateMerkleRoot(tree.getHexRoot());

                // Alice should now be able to claim (400-100) / (1600-100) = 20%
                alicePercent = alicePoints.sub(aliceClaimed).mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateClaimed));
                expect(alicePercent).to.eq(ethers.utils.parseEther("0.2"));

                // Alice claims token1 again with new balances
                await expect(distributor.connect(alice).claim(token1.address, alicePoints, aggregatePoints, aliceProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(alice.address, token1.address, alicePercent);

                // The new aggregate claimed should be 400
                aggregateClaimed = await distributor.getClaimed(zeroAddress(), token1.address);
                expect(aggregateClaimed).to.eq(BigNumber.from(400));

                // Bob should be able to claim (1200-0) / (1600-400) = 100%
                let bobPercent = bobPoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateClaimed));
                expect(bobPercent).to.eq(ethers.utils.parseEther("1"));

                // Bob claims token1
                await expect(distributor.connect(bob).claim(token1.address, bobPoints, aggregatePoints, bobProof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(bob.address, token1.address, bobPercent);
            });
        });

        describe("realistic size tree", () => {
            const NUM_SAMPLES = 25;
            const elements: Balance[] = [];
            let aggregatePoints = BigNumber.from(0);

            before(async () => {
                for (let i = 0; i < signers.length; i++) {
                    const points = BigNumber.from(i + 1);
                    elements.push({ account: signers[i].address, points });
                    aggregatePoints = aggregatePoints.add(points);
                }
                elements.push({
                    account: zeroAddress(),
                    points: aggregatePoints,
                });
                tree = new BalanceTree(elements);
            });

            beforeEach("deploy", async () => {
                distributor = (await Distributor.deploy(tree.getHexRoot())) as MerkleDistributor;
            });

            it("proof verification works", () => {
                const root = Buffer.from(tree.getHexRoot().slice(2), "hex");
                for (let j = 0; j < NUM_SAMPLES; j += 1) {
                    const i = Math.floor(Math.random() * signers.length);
                    const points = BigNumber.from(i + 1);
                    const proof1 = tree.getProof(signers[i].address, points).map((el) => Buffer.from(el.slice(2), "hex"));
                    const validProof1 = BalanceTree.verifyProof(signers[i].address, points, proof1, root);
                    expect(validProof1).to.be.true;
                }
            });

            it("no double claims in random distribution", async () => {
                for (let j = 0; j < NUM_SAMPLES; j += 1) {
                    const i = Math.floor(Math.random() * signers.length);
                    const points = BigNumber.from(i + 1);
                    const accountProof = tree.getProof(signers[i].address, points);
                    const aggregateProof = tree.getProof(zeroAddress(), aggregatePoints);
                    const [aggregateToken1Claimed, aggregateToken2Claimed] = await Promise.all([
                        distributor.getClaimed(zeroAddress(), token1.address),
                        distributor.getClaimed(zeroAddress(), token2.address),
                    ]);

                    // Claim token1
                    await expect(
                        distributor.connect(signers[i]).claim(token1.address, points, aggregatePoints, accountProof, aggregateProof)
                    )
                        .to.emit(distributor, "Claimed")
                        .withArgs(
                            signers[i].address,
                            token1.address,
                            points.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateToken1Claimed))
                        );

                    // Expect second claim of token1 to revert
                    await expect(
                        distributor.connect(signers[i]).claim(token1.address, points, aggregatePoints, accountProof, aggregateProof)
                    ).to.be.revertedWith("MerkleDistributor: Nothing to claim.");

                    // Claim token2
                    await expect(
                        distributor.connect(signers[i]).claim(token2.address, points, aggregatePoints, accountProof, aggregateProof)
                    )
                        .to.emit(distributor, "Claimed")
                        .withArgs(
                            signers[i].address,
                            token2.address,
                            points.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateToken2Claimed))
                        );

                    // Expect second claim of token2 to revert
                    await expect(
                        distributor.connect(signers[i]).claim(token2.address, points, aggregatePoints, accountProof, aggregateProof)
                    ).to.be.revertedWith("MerkleDistributor: Nothing to claim.");
                }
            });
        });
    });

    describe("parseBalanceMap", () => {
        let distributor: MerkleDistributor;
        let _claims: MerkleClaim;

        const aggregatePoints = BigNumber.from(300);
        const alicePoints = BigNumber.from(100);
        const bobPoints = BigNumber.from(200);

        beforeEach("deploy", async () => {
            const { merkleRoot, claims } = parseBalanceMap([
                { account: alice.address, points: alicePoints },
                { account: bob.address, points: bobPoints },
                { account: zeroAddress(), points: aggregatePoints },
            ]);

            _claims = claims;
            distributor = (await Distributor.deploy(merkleRoot)) as MerkleDistributor;
        });

        it("check the proofs is as expected", () => {
            expect(_claims).to.deep.eq({
                [alice.address]: {
                    points: "0x64",
                    proof: [
                        "0x25b2b65d1635eef64ee353c1357c9374031d908d340ccaf68a7903f468267c9f",
                        "0x2ed43a94c31997930a2c6fe97caf231eb915ef2b55b3477460f52c5648326b3b",
                    ],
                },
                [bob.address]: {
                    points: "0xc8",
                    proof: ["0x0caa3afc070bb7208301e062839d474118253afddc9d7b04cd9c95bab3fca1cd"],
                },
                [zeroAddress()]: {
                    points: "0x012c",
                    proof: [
                        "0x0b14a3a1c8477061457135b1cbc433511be294616a44b241a4255d876f0a7535",
                        "0x2ed43a94c31997930a2c6fe97caf231eb915ef2b55b3477460f52c5648326b3b",
                    ],
                },
            });
        });

        it("all claims work exactly once", async () => {
            const aggregatePoints = BigNumber.from(_claims[zeroAddress()].points);
            const aggregateProof = _claims[zeroAddress()].proof;

            for (const [key] of Object.entries(_claims)) {
                if (key == zeroAddress()) continue;

                const signer = signers.find((signer) => signer.address === key)!;
                const accountPoints = BigNumber.from(_claims[key].points);
                const proof = _claims[key].proof;
                const [aggregateToken1Claimed, aggregateToken2Claimed] = await Promise.all([
                    distributor.getClaimed(zeroAddress(), token1.address),
                    distributor.getClaimed(zeroAddress(), token2.address),
                ]);

                // Claim token1
                await expect(distributor.connect(signer).claim(token1.address, accountPoints, aggregatePoints, proof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(
                        key,
                        token1.address,
                        accountPoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateToken1Claimed))
                    );

                // Expect token1 claim to revert
                await expect(
                    distributor.connect(signer).claim(token1.address, accountPoints, aggregatePoints, proof, aggregateProof)
                ).to.be.revertedWith("MerkleDistributor: Nothing to claim.");

                // Claim token2
                await expect(distributor.connect(signer).claim(token2.address, accountPoints, aggregatePoints, proof, aggregateProof))
                    .to.emit(distributor, "Claimed")
                    .withArgs(
                        key,
                        token2.address,
                        accountPoints.mul(ethers.constants.WeiPerEther).div(aggregatePoints.sub(aggregateToken2Claimed))
                    );

                // Expect token2 claim to revert
                await expect(
                    distributor.connect(signer).claim(token2.address, accountPoints, aggregatePoints, proof, aggregateProof)
                ).to.be.revertedWith("MerkleDistributor: Nothing to claim.");
            }
        });
    });
});
