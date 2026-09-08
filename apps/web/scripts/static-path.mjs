// Static-file path containment for Node harness servers (apps/web).
//
// `resolveStaticPath` maps a request path to a file inside a root
// directory, or returns null when the request must not be served (missing
// file handling stays with the caller). A naive `resolved.startsWith(root)`
// prefix check is insufficient: `resolve(root, "./static-evil/x")` starts
// with the root string while escaping to a sibling directory. This helper
// compares with `path.relative` instead, so `..`, decoded `%2e%2e`
// sequences, and sibling-prefix paths all resolve to null.
import { relative, resolve, sep } from "node:path";

/**
 * Resolve `requestPath` (a URL pathname such as `/iframe.html`) to an
 * absolute file inside `rootDir`, or null when it escapes the root or is
 * not decodable. `/` serves the Storybook shell (`/index.html`).
 */
export function resolveStaticPath(rootDir, requestPath) {
	const pathname = requestPath === "/" ? "/index.html" : requestPath;
	let decoded;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	if (decoded.includes("\0")) {
		return null;
	}
	const file = resolve(rootDir, `.${decoded}`);
	const location = relative(rootDir, file);
	if (location === "" || location === ".." || location.startsWith(`..${sep}`)) {
		return null;
	}
	return file;
}
