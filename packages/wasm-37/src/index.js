import { createRequire } from "module";
const require = createRequire(import.meta.url);

const Module = require("../build/nethack.js");
export default Module;
export const nethackVersion = "3.7";
