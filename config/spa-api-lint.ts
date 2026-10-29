type AstNode = {
  type: string;
  name?: string | AstNode;
  value?: unknown;
  callee?: AstNode;
  property?: AstNode;
  parent?: AstNode;
};
type RuleContext = {
  filename: string;
  report: (finding: { node: AstNode; messageId: string }) => void;
};

function propertyName(node: AstNode | string | undefined): string | null {
  if (typeof node === "string") return node;
  if (node?.type === "Identifier" || node?.type === "JSXIdentifier")
    return typeof node.name === "string" ? node.name : null;
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

export default {
  meta: { name: "spa-api" },
  rules: {
    "request-boundary": {
      meta: {
        type: "problem",
        docs: { description: "Keep SPA data requests on the shared public API transport." },
        schema: [],
        messages: {
          transport: "Use apiFetch from spa/api/client for SPA data requests.",
          form: "SPA forms must submit through apiFetch, not native form actions.",
          legacy: "Legacy HTML form transport is not allowed in the SPA.",
        },
      },
      create(context: RuleContext) {
        const isClient = context.filename.replaceAll("\\", "/").endsWith("/spa/api/client.ts");
        function checkTransport(node: AstNode) {
          if (isClient) return;
          const callee = node.callee;
          if (callee === undefined) return;
          const name = callee.type === "MemberExpression" ? propertyName(callee.property) : propertyName(callee);
          if (name !== null && ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon"].includes(name))
            context.report({ node, messageId: "transport" });
          
        }
        return {
          CallExpression: checkTransport,
          NewExpression: checkTransport,
          JSXAttribute(node: AstNode) {
            const name = propertyName(node.name);
            if (name === "formAction" || (name === "action" && propertyName(node.parent?.name) === "form")) 
              context.report({ node, messageId: "form" });
            
          },
          Literal(node: AstNode) {
            if (typeof node.value === "string" && (
              ["authenticity_token", "_method"].includes(node.value) || node.value.includes("text/html")
            )) 
              context.report({ node, messageId: "legacy" });
            
          },
        };
      },
    },
  },
};
