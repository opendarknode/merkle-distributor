import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            accounts: {
                count: 5000,
            },
        },
    },
    solidity: "0.7.3",
    mocha: {
        timeout: 50000,
    },
    typechain: {
        outDir: "types",
        target: "ethers-v5",
    },
};

export default config;
