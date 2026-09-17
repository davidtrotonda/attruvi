import { createReactNativeRuntime } from "./native-runtime.js";
import { configureDefaultRuntime } from "./singleton.js";

configureDefaultRuntime(createReactNativeRuntime);

export * from "./index.js";
