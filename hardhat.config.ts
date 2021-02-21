import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";

const config: HardhatUserConfig = {
    solidity: "0.7.3",
    typechain: {
        outDir: "types",
    },
};

export default config;
