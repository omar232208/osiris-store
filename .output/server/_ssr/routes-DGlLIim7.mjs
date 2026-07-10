import { n as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime, r as require_react } from "../_libs/react+tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DGlLIim7.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Index() {
	(0, import_react.useEffect)(() => {
		window.location.replace("/home.html");
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-black text-white",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-mono text-sm opacity-70",
			children: "Entering Osiris…"
		})
	});
}
//#endregion
export { Index as component };
