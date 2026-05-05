import nodeConfig from "@aetheria/config/eslint/node";
import testOverlay from "@aetheria/config/eslint/test";

export default [...nodeConfig, ...testOverlay];
