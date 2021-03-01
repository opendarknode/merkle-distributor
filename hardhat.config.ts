import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            accounts: {
                count: 5000,
            },
        },
    },
    solidity: "0.7.3",
    typechain: {
        outDir: "types",
    },
    mocha: {
        timeout: 50000,
    },
};

export default config;
